import { mkdtemp, mkdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { writeHtmlReport } from '../src/html.js';
import { comparisonSchema } from '../src/compare.js';
import { reportSchema, type AuditReport } from '../src/report.js';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC3sAAAAASUVORK5CYII=', 'base64');
const ATTACK = '</script><script>window.__injected=1</script><img src="https://example.invalid/leak" onerror="window.__injected=2">';

function exampleReport(): AuditReport {
  return reportSchema.parse({
    schemaVersion: '1.0.0', targetUrl: 'https://example.test/?sample=1',
    startedAt: '2026-11-12T00:00:00.000Z', durationMs: 420,
    options: { timeoutMs: 15000, waitMs: 0, failOn: [] },
    summary: { total: 2, passed: 1, failed: 1, errors: 0 },
    results: [
      {
        viewport: { width: 360, height: 900 }, status: 'failed', finalUrl: 'javascript:window.__injected=3',
        screenshot: 'screenshots/360.png',
        overflow: { viewportWidth: 360, documentWidth: 1800, bodyWidth: 1800, overflowPx: 1440, hasOverflow: true,
          elements: [{ selector: `#panel[title="${ATTACK}"]`, tag: 'div', left: 0, right: 1800, width: 1800 }] },
        consoleErrors: [{ text: ATTACK, location: { url: `https://example.test/${ATTACK}`, lineNumber: 1, columnNumber: 2 } }],
        pageErrors: [{ name: 'Error', message: `Page ${ATTACK}`, stack: `stack: ${ATTACK}` }],
        failedRequests: [{ url: `https://example.test/${ATTACK}`, method: 'GET', resourceType: 'fetch', errorText: `Failed ${ATTACK}` }],
        errors: [],
      },
      {
        viewport: { width: 1440, height: 900 }, status: 'passed', finalUrl: 'https://example.test/',
        screenshot: 'screenshots/1440.png',
        overflow: { viewportWidth: 1440, documentWidth: 1440, bodyWidth: 1440, overflowPx: 0, hasOverflow: false, elements: [] },
        consoleErrors: [], pageErrors: [], failedRequests: [], errors: [],
      },
    ],
  });
}

describe('self-contained HTML reports', () => {
  let rootDir: string;
  let baseDir: string;
  let browser: Browser;
  let context: BrowserContext | undefined;

  beforeAll(async () => {
    rootDir = await mkdtemp(join(tmpdir(), 'viewport-guard-html-'));
    browser = await chromium.launch({ headless: true });
  });

  beforeEach(async () => {
    baseDir = await mkdtemp(join(rootDir, 'case-'));
    await mkdir(join(baseDir, 'screenshots'));
    await Promise.all([360, 1440].map((width) => writeFile(join(baseDir, 'screenshots', `${width}.png`), PNG)));
  });

  afterEach(async () => {
    await context?.close();
    context = undefined;
  });

  afterAll(async () => {
    await browser?.close();
    if (rootDir) await rm(rootDir, { recursive: true, force: true });
  });

  async function openReport(report: AuditReport, width = 1000): Promise<{ page: Page; htmlPath: string; pageErrors: string[]; externalRequests: string[] }> {
    const htmlPath = await writeHtmlReport(report, { baseDir, outputPath: join(baseDir, 'report.html') });
    context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    const pageErrors: string[] = [];
    const externalRequests: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('request', (request) => {
      if (/^https?:/.test(request.url())) externalRequests.push(request.url());
    });
    await page.goto(pathToFileURL(htmlPath).href);
    return { page, htmlPath, pageErrors, externalRequests };
  }

  it('renders escaped untrusted findings offline without script execution or external assets', async () => {
    const { page, pageErrors, externalRequests } = await openReport(exampleReport());
    expect(await page.title()).toContain('Viewport Guard');
    expect(await page.locator('body').textContent()).toContain(ATTACK);
    expect(await page.evaluate(() => Object.hasOwn(window, '__injected'))).toBe(false);
    expect(await page.locator('a[href^="javascript:"]').count()).toBe(0);
    expect(await page.locator('script[src],link[rel="stylesheet"]').count()).toBe(0);
    expect(await page.locator('img').evaluateAll((images) => images.every((image) => image.getAttribute('src')?.startsWith('data:image/png;base64,')))).toBe(true);
    expect(await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')).toContain("default-src 'none'");
    expect(await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')).toContain("connect-src 'none'");
    expect(pageErrors).toEqual([]);
    expect(externalRequests).toEqual([]);
  });

  it('keeps raw findings visible when the selected failure policy ignores them', async () => {
    const { page } = await openReport(exampleReport());
    expect(await page.locator('.badge').textContent()).toBe('Policy passed');
    expect(await page.locator('.summary .stat strong').allTextContents()).toEqual(['2', '4', '0', '0']);
    expect(await page.locator('[aria-label="Failure policy"]').textContent()).toContain('none');
    expect(await page.locator('#panel-0 [data-category="console"]').textContent()).toContain(ATTACK);
  });

  it('supports viewport tabs using arrow, Home, and End keys', async () => {
    const { page, pageErrors } = await openReport(exampleReport());
    const first = page.getByRole('tab', { name: /360px/ });
    const last = page.getByRole('tab', { name: /1440px/ });
    await first.focus();
    await page.keyboard.press('ArrowRight');
    expect(await last.getAttribute('aria-selected')).toBe('true');
    expect(await page.locator('#panel-1').isVisible()).toBe(true);
    expect(await page.locator('#panel-0').isVisible()).toBe(false);
    await page.keyboard.press('Home');
    expect(await first.getAttribute('aria-selected')).toBe('true');
    await page.keyboard.press('End');
    expect(await last.getAttribute('aria-selected')).toBe('true');
    await page.keyboard.press('ArrowLeft');
    expect(await first.getAttribute('aria-selected')).toBe('true');
    expect(pageErrors).toEqual([]);
  });

  it('keeps global and viewport execution errors visible while filtering details', async () => {
    const report = exampleReport();
    report.errors = ['Global browser cleanup failed'];
    report.results[0]!.errors = ['Viewport screenshot failed'];
    report.results[0]!.status = 'error';
    report.summary = { total: 2, passed: 1, failed: 0, errors: 1 };
    const { page } = await openReport(report);
    await page.locator('#issue-filter').selectOption('console');
    expect(await page.locator('#panel-0 [data-category="console"]').isVisible()).toBe(true);
    expect(await page.locator('#panel-0 [data-category="request"]').isVisible()).toBe(false);
    expect(await page.locator('#execution-errors').isVisible()).toBe(true);
    expect(await page.locator('#execution-errors').textContent()).toContain('Global browser cleanup failed');
    expect(await page.locator('#execution-errors').textContent()).toContain('Viewport screenshot failed');
    expect(await page.locator('.badge').textContent()).toBe('Execution error');
    expect(await page.locator('.summary .stat strong').allTextContents()).toEqual(['2', '4', '0', '2']);
  });

  it('fits a 320px viewport even with long URLs, selectors, errors, and all tabs', async () => {
    const report = exampleReport();
    report.targetUrl = `https://example.test/${'long-target-'.repeat(80)}`;
    report.results[0]!.consoleErrors[0]!.text = 'unbroken'.repeat(300);
    report.results[0]!.overflow!.elements[0]!.selector = '#long-selector-'.repeat(200);
    const { page, pageErrors } = await openReport(report, 320);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    expect(await page.locator('#issue-filter').isVisible()).toBe(true);
    expect(pageErrors).toEqual([]);
  });

  it('recomputes the policy outcome instead of trusting supplied evaluation metadata', async () => {
    const original = exampleReport();
    const report = reportSchema.parse({
      ...original, options: { ...original.options, failOn: ['overflow'] },
      evaluation: { failOn: [], passed: true, blockingViewports: [] },
    });
    const { page } = await openReport(report);
    expect(await page.locator('.badge').textContent()).toBe('Policy blocked');
    expect(await page.locator('.summary .stat strong').allTextContents()).toEqual(['2', '4', '1', '0']);
  });

  it('shows placeholders for missing and null screenshot references', async () => {
    const report = exampleReport();
    report.results[0]!.screenshot = 'screenshots/missing.png';
    report.results[1]!.screenshot = null;
    const { page } = await openReport(report);
    expect(await page.locator('.placeholder').count()).toBe(2);
    expect(await page.locator('#panel-0').textContent()).toContain('Screenshot unavailable');
  });

  it('rejects more than eight viewport results before loading images or creating output', async () => {
    const report = exampleReport();
    const clean = report.results[1]!;
    report.results = Array.from({ length: 9 }, (_, index) => ({
      ...clean, viewport: { width: 240 + index, height: 900 }, screenshot: null,
    }));
    report.summary = { total: 9, passed: 9, failed: 0, errors: 0 };
    const outputPath = join(baseDir, 'too-many.html');
    await expect(writeHtmlReport(report, { baseDir, outputPath })).rejects.toThrow(/at most 8 viewport results/);
    await expect(stat(outputPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('renders optional comparison summaries and escapes finding text in every change list', async () => {
    const viewport = { width: 360, height: 900 };
    const comparison = comparisonSchema.parse({
      schemaVersion: '1.0.0', targetUrl: 'https://example.test/',
      summary: { added: 1, resolved: 1, worsened: 1, improved: 1, unchanged: 2 },
      added: [{ viewport, kind: 'console', key: ATTACK, message: ATTACK, count: 1 }],
      resolved: [{ viewport, kind: 'pageerror', key: ATTACK, message: ATTACK, count: 1 }],
      worsened: [{ viewport, kind: 'overflow', beforePx: 10, afterPx: 20 }],
      improved: [{ viewport, kind: 'overflow', beforePx: 20, afterPx: 5 }],
    });
    const outputPath = await writeHtmlReport(exampleReport(), { baseDir, outputPath: join(baseDir, 'comparison.html'), comparison });
    context = await browser.newContext({ viewport: { width: 320, height: 900 } });
    const page = await context.newPage();
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.goto(pathToFileURL(outputPath).href);
    expect(await page.locator('.comparison-stat strong').allTextContents()).toEqual(['1', '1', '1', '1', '2']);
    expect(await page.locator('#comparison').textContent()).toContain(ATTACK);
    expect(await page.locator('#comparison').textContent()).toContain('10px → 20px');
    expect(await page.locator('#comparison').textContent()).toContain('20px → 5px');
    expect(await page.evaluate(() => Object.hasOwn(window, '__injected'))).toBe(false);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    expect(pageErrors).toEqual([]);
  });

  it.each(['../outside.png', 'screenshots/../360.png', '..\\outside.png', '/absolute.png', 'C:\\outside.png', 'C:outside.png', 'https://example.test/image.png', 'screenshots/image.svg', 'screenshots/invalid\u0000.png'])('rejects unsafe screenshot reference %j before creating output', async (screenshot) => {
    const report = exampleReport();
    report.results[0]!.screenshot = screenshot;
    const outputPath = join(baseDir, 'unsafe.html');
    await expect(writeHtmlReport(report, { baseDir, outputPath })).rejects.toThrow(/Unsafe screenshot path/);
    await expect(stat(outputPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects a screenshot directory symlink that points outside the report directory', async ({ skip }) => {
    const outsideDir = await mkdtemp(join(rootDir, 'outside-'));
    await writeFile(join(outsideDir, 'outside.png'), PNG);
    try {
      await symlink(outsideDir, join(baseDir, 'linked'), 'junction');
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && ['EPERM', 'EACCES', 'ENOSYS'].includes(String(error.code))) skip();
      throw error;
    }
    const report = exampleReport();
    report.results[0]!.screenshot = 'linked/outside.png';
    await expect(writeHtmlReport(report, { baseDir, outputPath: join(baseDir, 'unsafe.html') })).rejects.toThrow(/symlink resolves outside/);
  });

  it('rejects a file that has a PNG extension but an invalid signature', async () => {
    await writeFile(join(baseDir, 'screenshots', '360.png'), '<script>not an image</script>');
    await expect(writeHtmlReport(exampleReport(), { baseDir, outputPath: join(baseDir, 'invalid.html') })).rejects.toThrow(/not a PNG image/);
  });

  it('rejects screenshot files larger than the per-image limit', async () => {
    await writeFile(join(baseDir, 'screenshots', '360.png'), Buffer.alloc(8 * 1024 * 1024 + 1));
    await expect(writeHtmlReport(exampleReport(), { baseDir, outputPath: join(baseDir, 'large.html') })).rejects.toThrow(/8 MB image limit/);
  });

  it('requires an HTML suffix and preserves existing output unless overwrite is explicit', async () => {
    const report = exampleReport();
    await expect(writeHtmlReport(report, { baseDir, outputPath: join(baseDir, 'report.json') })).rejects.toThrow(/end in .html/);
    const outputPath = await writeHtmlReport(report, { baseDir, outputPath: join(baseDir, 'report.html') });
    const original = await readFile(outputPath, 'utf8');
    report.targetUrl = 'https://changed.example.test/';
    await expect(writeHtmlReport(report, { baseDir, outputPath })).rejects.toThrow(/already exists/);
    expect(await readFile(outputPath, 'utf8')).toBe(original);
    expect(await writeHtmlReport(report, { baseDir, outputPath, overwrite: true })).toBe(outputPath);
    expect(await readFile(outputPath, 'utf8')).toContain('https://changed.example.test/');
  });
});
