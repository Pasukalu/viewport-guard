import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { type Browser, type BrowserContext, type Page } from 'playwright';
import { launchChromium } from './browser.js';
import { optionsSchema, urlSchema, VIEWPORTS, VIEWPORT_HEIGHT, type AuditOptions, type ViewportSize } from './config.js';
import { reportSchema, type AuditReport, type ViewportResult } from './report.js';
import { measureOverflow } from './overflow.js';
import { withTimeout } from './deadline.js';
import { evaluateReport } from './policy.js';

export const CLEANUP_TIMEOUT_MS = 5_000;
const FONT_WAIT_CAP_MS = 5_000;
const TITLE_TIMEOUT_CAP_MS = 3_000;

export interface AuditResult {
  report: AuditReport;
  reportPath: string;
  outputDir: string;
}

export interface InspectViewportOptions {
  timeoutMs: number;
  waitMs: number;
  waitForSelector?: string;
  maxOverflowElements?: number;
  screenshotOutputDir?: string;
}

export interface InspectViewportResult {
  result: ViewportResult;
  screenshotBuffer: Buffer | null;
  navigated: boolean;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function waitForFontsBounded(page: Page, timeoutMs: number): Promise<void> {
  const budgetMs = Math.max(1, Math.min(timeoutMs, FONT_WAIT_CAP_MS));
  await withTimeout(
    () => page.evaluate((limitMs) => {
      const fonts = document.fonts;
      if (!fonts || !fonts.ready) return;
      return Promise.race([
        fonts.ready.then(() => undefined, () => undefined),
        new Promise<void>((resolveWait) => { setTimeout(resolveWait, limitMs); }),
      ]);
    }, budgetMs),
    budgetMs + 250,
    'Font readiness wait',
  );
}

export async function inspectViewport(
  browser: Browser,
  url: string,
  viewport: ViewportSize,
  options: InspectViewportOptions,
): Promise<InspectViewportResult> {
  const result: ViewportResult = {
    viewport, status: 'error', finalUrl: url, screenshot: null, overflow: null,
    consoleErrors: [], pageErrors: [], failedRequests: [], errors: [],
  };
  let context: BrowserContext | undefined;
  let page: Page | undefined;
  let screenshotBuffer: Buffer | null = null;
  let navigated = false;
  const maxOverflowElements = options.maxOverflowElements ?? 20;

  try {
    context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    page = await context.newPage();
    page.setDefaultTimeout(options.timeoutMs);
    page.setDefaultNavigationTimeout(options.timeoutMs);
    page.on('console', (message) => {
      if (message.type() === 'error') {
        result.consoleErrors.push({ text: message.text(), location: message.location() });
      }
    });
    page.on('pageerror', (error) => {
      result.pageErrors.push({ name: error.name, message: error.message, ...(error.stack ? { stack: error.stack } : {}) });
    });
    page.on('requestfailed', (request) => {
      result.failedRequests.push({
        url: request.url(), method: request.method(), resourceType: request.resourceType(),
        errorText: request.failure()?.errorText ?? 'Unknown network failure',
      });
    });

    try {
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: options.timeoutMs });
      if (response && response.status() >= 400) {
        result.errors.push(`Navigation returned HTTP ${response.status()}`);
      } else {
        navigated = true;
      }
    } catch (error) {
      result.errors.push(`Navigation failed: ${errorMessage(error)}`);
    }
    result.finalUrl = page.url();

    if (navigated) {
      if (options.waitForSelector !== undefined) {
        try {
          // Validate standard CSS syntax before using Playwright's selector
          // engine, which also accepts non-CSS selector chains.
          await withTimeout(
            () => page!.evaluate((selector) => { document.querySelector(selector); }, options.waitForSelector!),
            options.timeoutMs,
            'Readiness CSS validation',
          );
          await page.locator(`css=${options.waitForSelector}`).first().waitFor({
            state: 'visible', timeout: options.timeoutMs,
          });
        } catch (error) {
          result.errors.push(`Readiness wait failed for ${JSON.stringify(options.waitForSelector)}: ${errorMessage(error)}`);
        }
      }
      if (result.errors.length === 0) {
        try {
          await waitForFontsBounded(page, options.timeoutMs);
        } catch {
          // Font readiness is best-effort and strictly time-bounded; continue with measurement.
        }
      }
      // Do not use networkidle: polling and analytics can keep a page busy forever.
      if (options.waitMs > 0) await page.waitForTimeout(options.waitMs);
      if (result.errors.length === 0) {
        try {
          const title = await withTimeout(
            () => page!.title(),
            Math.max(1, Math.min(options.timeoutMs, TITLE_TIMEOUT_CAP_MS)),
            'Page title capture',
          );
          if (title.trim().length > 0) result.pageTitle = title;
        } catch {
          // Missing title must not block overflow measurement or screenshot capture.
        }
      }
      try {
        result.overflow = await withTimeout(
          () => measureOverflow(page!, maxOverflowElements),
          options.timeoutMs,
          'Overflow measurement',
        );
      } catch (error) {
        result.errors.push(`Overflow measurement failed: ${errorMessage(error)}`);
      }
    }

    if (options.screenshotOutputDir !== undefined) {
      try {
        const relativePath = `screenshots/${viewport.width}.png`;
        await page.screenshot({ path: join(options.screenshotOutputDir, relativePath), fullPage: false, timeout: options.timeoutMs });
        result.screenshot = relativePath;
      } catch (error) {
        result.errors.push(`Screenshot failed: ${errorMessage(error)}`);
      }
    } else if (navigated) {
      try {
        screenshotBuffer = await page.screenshot({ type: 'png', fullPage: false, timeout: options.timeoutMs });
      } catch (error) {
        result.errors.push(`Screenshot failed: ${errorMessage(error)}`);
      }
    }
  } catch (error) {
    result.errors.push(`Viewport audit failed: ${errorMessage(error)}`);
  } finally {
    // A client-side route can change during readiness or capture. Record the
    // URL of the evidence, rather than only the immediate navigation URL.
    if (page) result.finalUrl = page.url();
    // Cleanup cancels pending requests; those cancellations are caused by us,
    // outside the observation window, and must not become audit findings.
    page?.removeAllListeners('console');
    page?.removeAllListeners('pageerror');
    page?.removeAllListeners('requestfailed');
    if (context) {
      try {
        await withTimeout(() => context!.close(), CLEANUP_TIMEOUT_MS, 'Browser context cleanup');
      } catch (error) {
        result.errors.push(`Browser context cleanup failed: ${errorMessage(error)}`);
      }
    }
  }

  if (result.errors.length > 0) result.status = 'error';
  else if (result.overflow?.hasOverflow || result.consoleErrors.length || result.pageErrors.length || result.failedRequests.length) {
    result.status = 'failed';
  } else result.status = 'passed';
  return { result, screenshotBuffer, navigated };
}

export async function audit(url: string, input: Partial<AuditOptions> = {}): Promise<AuditResult> {
  const targetUrl = urlSchema.parse(url);
  const options = optionsSchema.parse(input);
  const viewports = options.widths?.map((width) => ({ width, height: VIEWPORT_HEIGHT })) ?? VIEWPORTS;
  const startedAt = new Date().toISOString();
  const started = performance.now();
  // Launch before creating output so missing browsers cannot leave a fake report.
  const browser = await launchChromium();
  let outputDir: string;
  const results: ViewportResult[] = [];
  const runErrors: string[] = [];
  try {
    const parentDir = resolve(options.outputDir);
    await mkdir(parentDir, { recursive: true });
    outputDir = await mkdtemp(join(parentDir, `audit-${startedAt.replace(/[:.]/g, '-')}-`));
    await mkdir(join(outputDir, 'screenshots'));
    for (const viewport of viewports) {
      const inspected = await inspectViewport(browser, targetUrl, viewport, {
        timeoutMs: options.timeoutMs,
        waitMs: options.waitMs,
        ...(options.waitForSelector !== undefined ? { waitForSelector: options.waitForSelector } : {}),
        maxOverflowElements: 20,
        screenshotOutputDir: outputDir,
      });
      results.push(inspected.result);
    }
  } finally {
    try {
      await withTimeout(() => browser.close(), CLEANUP_TIMEOUT_MS, 'Browser cleanup');
    } catch (error) {
      // Cleanup must not discard evidence already collected at every viewport.
      runErrors.push(`Browser cleanup failed: ${errorMessage(error)}`);
    }
  }
  const report = reportSchema.parse({
    schemaVersion: '1.0.0', targetUrl, startedAt,
    durationMs: Math.round(performance.now() - started),
    options: {
      timeoutMs: options.timeoutMs, waitMs: options.waitMs,
      ...(options.waitForSelector !== undefined ? { waitForSelector: options.waitForSelector } : {}),
      ...(options.widths !== undefined ? { widths: options.widths } : {}),
      ...(options.failOn !== undefined ? { failOn: options.failOn } : {}),
    },
    summary: {
      total: results.length,
      passed: results.filter((result) => result.status === 'passed').length,
      failed: results.filter((result) => result.status === 'failed').length,
      errors: results.filter((result) => result.status === 'error').length,
    },
    results,
    ...(runErrors.length > 0 ? { errors: runErrors } : {}),
  });
  if (options.failOn !== undefined) report.evaluation = evaluateReport(report);
  const reportPath = join(outputDir, 'report.json');
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return { report, reportPath, outputDir };
}
