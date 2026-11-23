import { randomBytes } from 'node:crypto';
import { access, constants, lstat, mkdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { CLEANUP_TIMEOUT_MS, errorMessage, inspectViewport } from './audit.js';
import { launchChromium } from './browser.js';
import { resolveScanViewports, scanOptionsSchema, urlSchema, type ScanOptions } from './config.js';
import { withTimeout } from './deadline.js';
import { writeHtmlReport } from './html.js';
import { evaluateReport } from './policy.js';
import { reportSchema, type AuditReport, type ViewportResult } from './report.js';

export interface ScanProgressEvent {
  phase: 'starting' | 'viewport-start' | 'viewport-done' | 'writing-report' | 'done';
  viewportIndex?: number;
  totalViewports?: number;
  viewport?: { width: number; height: number };
  result?: ViewportResult;
}

export interface ScanResult {
  report: AuditReport;
  htmlPath: string;
  hasOverflow: boolean;
  operationalErrors: string[];
  screenshotDataUrls: Array<string | null>;
}

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

/** Verify that the target HTML output path is syntactically valid and writable before launching a browser. */
export async function validateWritableHtmlPath(rawPath: string): Promise<string> {
  const trimmed = rawPath.trim();
  if (!trimmed) throw new Error('Output path must not be empty');
  const outputPath = resolve(trimmed);
  if (!/\.html$/i.test(outputPath)) {
    throw new Error(`Output path must end with .html: ${outputPath}`);
  }
  try {
    const existing = await lstat(outputPath);
    if (existing.isSymbolicLink()) {
      throw new Error(`Output path must not be a symbolic link: ${outputPath}`);
    }
    if (existing.isDirectory()) {
      throw new Error(`Output path is a directory, not an HTML file: ${outputPath}`);
    }
    try {
      await access(outputPath, constants.W_OK);
    } catch (error) {
      throw new Error(`Cannot write report to ${outputPath}: ${errorMessage(error)}`);
    }
  } catch (error) {
    if (!isMissing(error)) throw error;
  }

  const parentDir = dirname(outputPath);
  try {
    await mkdir(parentDir, { recursive: true });
    const probePath = join(parentDir, `.vg-write-probe-${process.pid}-${randomBytes(6).toString('hex')}.tmp`);
    await writeFile(probePath, '', { flag: 'wx' });
    await unlink(probePath);
  } catch (error) {
    throw new Error(`Cannot write report to ${outputPath}: ${errorMessage(error)}`);
  }
  return outputPath;
}

/** Scan a single HTTP/HTTPS URL across responsive viewports and emit a standalone HTML report. */
export async function scan(
  url: string,
  input: Partial<ScanOptions> = {},
  onProgress?: (event: ScanProgressEvent) => void,
): Promise<ScanResult> {
  const targetUrl = urlSchema.parse(url);
  const options = scanOptionsSchema.parse(input);
  const outputPath = await validateWritableHtmlPath(options.outputPath);
  const viewports = resolveScanViewports(options.widths);
  const startedAt = new Date().toISOString();
  const started = performance.now();

  onProgress?.({ phase: 'starting', totalViewports: viewports.length });

  const browser = await launchChromium();
  const results: ViewportResult[] = [];
  const screenshotBuffers: Array<Buffer | null> = [];
  const runErrors: string[] = [];
  let navigatedCount = 0;

  try {
    for (let index = 0; index < viewports.length; index += 1) {
      const viewport = viewports[index]!;
      onProgress?.({
        phase: 'viewport-start',
        viewportIndex: index,
        totalViewports: viewports.length,
        viewport,
      });
      const inspected = await inspectViewport(browser, targetUrl, viewport, {
        timeoutMs: options.timeoutMs,
        waitMs: options.waitMs,
        ...(options.waitForSelector !== undefined ? { waitForSelector: options.waitForSelector } : {}),
        maxOverflowElements: 5,
      });
      if (inspected.navigated) navigatedCount += 1;
      results.push(inspected.result);
      screenshotBuffers.push(inspected.screenshotBuffer);
      onProgress?.({
        phase: 'viewport-done',
        viewportIndex: index,
        totalViewports: viewports.length,
        viewport,
        result: inspected.result,
      });
    }
  } finally {
    try {
      await withTimeout(() => browser.close(), CLEANUP_TIMEOUT_MS, 'Browser cleanup');
    } catch (error) {
      runErrors.push(`Browser cleanup failed: ${errorMessage(error)}`);
    }
  }

  if (navigatedCount === 0) {
    const cleanReason = (text: string): string => text
      .replace(/\u001b\[[0-9;]*m/g, '')
      .split(/\r?\n/)[0]!
      .trim();
    const reasons = Array.from(new Set(results.flatMap((entry) => entry.errors.map(cleanReason))));
    const detail = reasons.length > 0 ? reasons.join('; ') : 'all viewports failed to load';
    throw new Error(`Unable to load ${targetUrl}: ${detail}`);
  }

  const report = reportSchema.parse({
    schemaVersion: '1.0.0',
    targetUrl,
    startedAt,
    durationMs: Math.round(performance.now() - started),
    options: {
      timeoutMs: options.timeoutMs,
      waitMs: options.waitMs,
      ...(options.waitForSelector !== undefined ? { waitForSelector: options.waitForSelector } : {}),
      ...(options.widths !== undefined ? { widths: options.widths } : {}),
      failOn: ['overflow'],
    },
    summary: {
      total: results.length,
      passed: results.filter((entry) => entry.status === 'passed').length,
      failed: results.filter((entry) => entry.status === 'failed').length,
      errors: results.filter((entry) => entry.status === 'error').length,
    },
    results,
    ...(runErrors.length > 0 ? { errors: runErrors } : {}),
  });
  report.evaluation = evaluateReport(report);

  onProgress?.({ phase: 'writing-report', totalViewports: viewports.length });
  let htmlPath: string;
  try {
    htmlPath = await writeHtmlReport(report, {
      outputPath,
      screenshotBuffers,
      overwrite: true,
    });
  } catch (error) {
    throw new Error(`Cannot write report to ${outputPath}: ${errorMessage(error)}`);
  }

  const operationalErrors = [
    ...runErrors,
    ...results.flatMap((entry) => entry.errors.map((err) => `${entry.viewport.width}x${entry.viewport.height}: ${err}`)),
  ];
  const hasOverflow = results.some((entry) => entry.overflow?.hasOverflow === true);
  const screenshotDataUrls = screenshotBuffers.map((buffer) => (
    buffer ? `data:image/png;base64,${buffer.toString('base64')}` : null
  ));
  onProgress?.({ phase: 'done', totalViewports: viewports.length });
  return { report, htmlPath, hasOverflow, operationalErrors, screenshotDataUrls };
}
