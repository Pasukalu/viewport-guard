import { createServer, type Server } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { audit, type AuditResult } from '../src/audit.js';
import { getExitCode, reportSchema } from '../src/report.js';

const html = (content: string) => `<!doctype html><html><head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <link rel="icon" href="data:,">
  <style>html,body{margin:0;padding:0}*{box-sizing:border-box}</style>
  </head><body>${content}</body></html>`;

async function expectSavedReport(run: AuditResult): Promise<void> {
  const saved = reportSchema.parse(JSON.parse(await readFile(run.reportPath, 'utf8')));
  expect(saved).toEqual(run.report);
  expect(saved.results.map((result) => result.viewport.width)).toEqual([360, 390, 768, 1440]);
}

describe('bounded browser operations and cleanup reliability', () => {
  let server: Server;
  let baseUrl: string;
  let outputDir: string;

  beforeAll(async () => {
    outputDir = await mkdtemp(join(tmpdir(), 'viewport-guard-reliability-'));
    server = createServer((request, response) => {
      let content: string;
      if (request.url === '/measurement-blocked') {
        // This stays responsive through navigation and only blocks when our
        // measurement queries candidates. Playwright's default timeout alone
        // does not bound a page.evaluate call in this state.
        content = '<div style="width:1800px;height:24px">Wide panel</div>'
          + '<script>document.querySelectorAll = () => { while (true) {} };</script>';
      } else if (request.url === '/readiness-blocked') {
        content = '<div id="ready">Ready</div>'
          + '<script>document.querySelector = () => { while (true) {} };</script>';
      } else {
        content = '<main><h1>Responsive page</h1><p>Cleanup regression fixture</p></main>';
      }
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      response.end(html(content));
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Fixture server has no TCP address');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    if (server) {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
    if (outputDir) await rm(outputDir, { recursive: true, force: true });
  });

  it('bounds a blocked measurement and saves errors for all four viewports', async () => {
    const run = await audit(`${baseUrl}/measurement-blocked`, { outputDir, timeoutMs: 300, waitMs: 0 });
    expect(run.report.summary).toEqual({ total: 4, passed: 0, failed: 0, errors: 4 });
    expect(getExitCode(run.report)).toBe(2);
    for (const result of run.report.results) {
      expect(result.status).toBe('error');
      expect(result.overflow).toBeNull();
      const measurementError = result.errors.find((error) => error.startsWith('Overflow measurement failed:'));
      expect(measurementError).toMatch(/timed out|timeout|deadline|exceeded/i);
      // A blocked renderer may prevent a screenshot; its error is recorded
      // separately instead of requiring an artifact the browser cannot make.
      if (result.screenshot === null) {
        expect(result.errors.some((error) => error.startsWith('Screenshot failed:'))).toBe(true);
      }
    }
    await expectSavedReport(run);
  }, 30_000);

  it('bounds blocked readiness validation and continues to a saved four-viewport report', async () => {
    const run = await audit(`${baseUrl}/readiness-blocked`, {
      outputDir, timeoutMs: 300, waitMs: 0, waitForSelector: '#ready',
    });
    expect(run.report.summary).toEqual({ total: 4, passed: 0, failed: 0, errors: 4 });
    expect(run.report.options.waitForSelector).toBe('#ready');
    expect(getExitCode(run.report)).toBe(2);
    for (const result of run.report.results) {
      expect(result.status).toBe('error');
      const readinessError = result.errors.find((error) => error.startsWith('Readiness wait failed for'));
      expect(readinessError).toMatch(/timed out|timeout|deadline|exceeded/i);
      if (result.screenshot === null) {
        expect(result.errors.some((error) => error.startsWith('Screenshot failed:'))).toBe(true);
      }
    }
    await expectSavedReport(run);
  }, 30_000);

  it('preserves a clean audit report when browser cleanup rejects', async () => {
    const knownFailure = 'reliability fixture: browser cleanup rejected';
    const originalLaunch = chromium.launch.bind(chromium);
    let realBrowser: Browser | undefined;
    let closeOriginal: (() => Promise<void>) | undefined;
    let restoreClose: (() => void) | undefined;
    const launchSpy = vi.spyOn(chromium, 'launch').mockImplementationOnce(async (options) => {
      const browser = await originalLaunch(options);
      realBrowser = browser;
      const originalClose = browser.close.bind(browser);
      closeOriginal = () => originalClose();
      const closeSpy = vi.spyOn(browser, 'close').mockImplementationOnce(async (closeOptions) => {
        // Shut down the real process first, then deterministically simulate
        // the cleanup rejection so this regression test cannot leak a browser.
        await originalClose(closeOptions);
        throw new Error(knownFailure);
      });
      restoreClose = () => closeSpy.mockRestore();
      return browser;
    });

    try {
      const run = await audit(`${baseUrl}/normal`, { outputDir, timeoutMs: 2_000, waitMs: 0 });
      expect(run.report.summary).toEqual({ total: 4, passed: 4, failed: 0, errors: 0 });
      expect(run.report.results.every((result) => result.status === 'passed' && result.errors.length === 0)).toBe(true);
      expect(run.report.errors).toHaveLength(1);
      expect(run.report.errors?.[0]).toContain(knownFailure);
      expect(getExitCode(run.report)).toBe(2);
      await expectSavedReport(run);
    } finally {
      launchSpy.mockRestore();
      restoreClose?.();
      if (realBrowser?.isConnected()) await closeOriginal?.();
    }
  });
});
