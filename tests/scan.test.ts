import { createServer, type Server } from 'node:http';
import { copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, type Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { measureOverflow } from '../src/overflow.js';
import { buildFixPrompt } from '../src/prompt.js';
import { scan } from '../src/scan.js';
// @ts-expect-error ESM script helper without .d.ts
import { startDemoServer } from '../scripts/demo-server.mjs';

interface DemoServerHandle {
  url: string;
  brokenUrl: string;
  fixedUrl: string;
  close: () => Promise<void>;
}

describe('Viewport Guard scan workflow, demo pages, and overflow rules', () => {
  let demoServer: DemoServerHandle;
  let edgeServer: Server;
  let edgeBaseUrl: string;
  let workDir: string;
  let browser: Browser;

  beforeAll(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'viewport-guard-scan-'));
    demoServer = await startDemoServer(0);
    browser = await chromium.launch({ headless: true });

    edgeServer = createServer((request, response) => {
      let body = '';
      if (request.url === '/one-px') {
        body = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
          <style>*{box-sizing:border-box}html,body{margin:0;padding:0}.edge{width:376px;height:40px}</style>
          </head><body><div class="edge">1px diff</div></body></html>`;
      } else if (request.url === '/clipped-and-sorted') {
        body = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
          <title>&lt;/textarea&gt;&lt;script&gt;window.__xss=1&lt;/script&gt; Evil Title</title>
          <style>
            *{box-sizing:border-box}html,body{margin:0;padding:0}
            .clip-box{width:300px;overflow-x:hidden;height:40px}
            .clipped-giant{width:1400px;height:30px}
            .zero-size{width:0;height:0;margin-left:900px}
            .hidden-wide{display:none;width:1200px;height:30px}
            .item-1{width:410px;height:20px}
            .item-2{width:450px;height:20px}
            .item-3{width:490px;height:20px}
            .item-4{width:530px;height:20px}
            .item-5{width:570px;height:20px}
            .item-6{width:610px;height:20px}
            .item-7{width:650px;height:20px}
          </style></head><body>
          <div class="clip-box"><div class="clipped-giant">Clipped inside overflow-x:hidden</div></div>
          <div class="zero-size"></div>
          <div class="hidden-wide">Hidden</div>
          <div class="item-1">1</div>
          <div class="item-2">2</div>
          <div class="item-3">3</div>
          <div class="item-4">4</div>
          <div class="item-5">5</div>
          <div class="item-6">6</div>
          <div class="item-7">7</div>
          </body></html>`;
      } else {
        body = '<!doctype html><html><head><meta charset="utf-8"><title>Clean</title></head><body><p>OK</p></body></html>';
      }
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(body);
    });
    await new Promise<void>((resolve, reject) => {
      edgeServer.once('error', reject);
      edgeServer.listen(0, '127.0.0.1', resolve);
    });
    const addr = edgeServer.address();
    if (!addr || typeof addr === 'string') throw new Error('Expected TCP edge server');
    edgeBaseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    await browser?.close();
    await demoServer?.close();
    if (edgeServer) {
      edgeServer.closeAllConnections();
      await new Promise<void>((resolve, reject) => edgeServer.close((err) => (err ? reject(err) : resolve())));
    }
    if (workDir) await rm(workDir, { recursive: true, force: true });
  });

  it('scans the broken demo page at 375/390/768 and reports 185/170/0px overflow with .offer-row', async () => {
    const outPath = join(workDir, 'broken-report.html');
    const result = await scan(demoServer.brokenUrl, { outputPath: outPath, waitMs: 50 });

    expect(result.hasOverflow).toBe(true);
    expect(result.operationalErrors).toEqual([]);
    expect(result.report.results.map((entry) => entry.viewport)).toEqual([
      { width: 375, height: 812 },
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
    ]);
    expect(result.report.results.map((entry) => entry.overflow?.overflowPx)).toEqual([185, 170, 0]);
    expect(result.report.results.map((entry) => entry.overflow?.hasOverflow)).toEqual([true, true, false]);

    expect(result.report.results[0]!.overflow!.elements.length).toBeGreaterThan(0);
    expect(result.report.results[0]!.overflow!.elements.length).toBeLessThanOrEqual(5);
    expect(result.report.results[0]!.overflow!.elements[0]!.selector).toBe('.offer-row');
    expect(result.report.results[1]!.overflow!.elements[0]!.selector).toBe('.offer-row');
    expect(result.report.results[2]!.overflow!.elements).toEqual([]);

    const prompt = buildFixPrompt(result.report);
    expect(prompt).toContain('375×812');
    expect(prompt).toContain('185px');
    expect(prompt).toContain('390×844');
    expect(prompt).toContain('170px');
    expect(prompt).toContain('.offer-row');
    expect(prompt).toContain('768×1024');

    const html = await readFile(outPath, 'utf8');
    expect(html).toContain('.offer-row');
    expect(html).toContain('cross-check with the screenshot');
    expect(html).toContain('id="fix-prompt"');
    const embeddedImages = Array.from(html.matchAll(/<img\b[^>]*\bsrc="(data:image\/png;base64,[^"]+)"/g));
    expect(embeddedImages.length).toBeGreaterThanOrEqual(3);
  });

  it('scans the fixed demo page with 0px overflow and keeps screenshots + prompt working after copying HTML alone', async () => {
    const outPath = join(workDir, 'fixed-report.html');
    const result = await scan(demoServer.fixedUrl, { outputPath: outPath, waitMs: 50 });

    expect(result.hasOverflow).toBe(false);
    expect(result.operationalErrors).toEqual([]);
    expect(result.report.results.map((entry) => entry.overflow?.overflowPx)).toEqual([0, 0, 0]);
    expect(result.report.results.every((entry) => entry.overflow?.elements.length === 0)).toBe(true);

    // Copy ONLY the standalone HTML file into an isolated directory and open it offline.
    const isolatedDir = await mkdtemp(join(tmpdir(), 'viewport-guard-copied-'));
    const copiedHtml = join(isolatedDir, 'portable-report.html');
    await copyFile(outPath, copiedHtml);

    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    try {
      const page = await context.newPage();
      const pageErrors: string[] = [];
      const externalRequests: string[] = [];
      page.on('pageerror', (err) => pageErrors.push(err.message));
      page.on('request', (req) => {
        if (/^https?:/.test(req.url())) externalRequests.push(req.url());
      });
      await page.goto(pathToFileURL(copiedHtml).href);

      // Verify all three viewport screenshots render from embedded data URLs.
      for (let idx = 0; idx < 3; idx += 1) {
        await page.locator(`#tab-${idx}`).click();
        const img = page.locator(`#panel-${idx} .capture-stage img`);
        expect(await img.count()).toBe(1);
        const dims = await img.evaluate((el: HTMLImageElement) => ({
          complete: el.complete,
          naturalWidth: el.naturalWidth,
          naturalHeight: el.naturalHeight,
        }));
        expect(dims.complete).toBe(true);
        expect(dims.naturalWidth).toBe(result.report.results[idx]!.viewport.width);
        expect(dims.naturalHeight).toBe(result.report.results[idx]!.viewport.height);
      }

      // Verify prompt box is populated and manual selection fallback works when clipboard fails.
      const promptValue = await page.locator('#fix-prompt').inputValue();
      expect(promptValue).toContain('0px');
      await page.evaluate(() => {
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: { writeText: () => Promise.reject(new Error('Clipboard blocked')) },
        });
        document.execCommand = () => false;
      });
      await page.locator('#copy-prompt').click();
      const selection = await page.evaluate(() => {
        const el = document.getElementById('fix-prompt') as HTMLTextAreaElement;
        return { start: el.selectionStart, end: el.selectionEnd, len: el.value.length };
      });
      expect(selection.start).toBe(0);
      expect(selection.end).toBe(selection.len);
      expect(selection.len).toBeGreaterThan(20);
      expect(await page.locator('#copy-status').textContent()).toContain('Ctrl+C');
      expect(pageErrors).toEqual([]);
      expect(externalRequests).toEqual([]);
    } finally {
      await context.close();
      await rm(isolatedDir, { recursive: true, force: true });
    }
  });

  it('treats <=1px document difference as 0px overflow', async () => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 1 });
    try {
      const page = await context.newPage();
      await page.goto(`${edgeBaseUrl}/one-px`, { waitUntil: 'domcontentloaded' });
      const overflow = await measureOverflow(page, 5);
      expect(overflow.documentWidth).toBe(376);
      expect(overflow.viewportWidth).toBe(375);
      expect(overflow.hasOverflow).toBe(false);
      expect(overflow.overflowPx).toBe(0);
      expect(overflow.elements).toEqual([]);
    } finally {
      await context.close();
    }
  });

  it('skips clipped/zero-size/hidden elements, sorts by overflow descending, caps at 5, and escapes evil titles', async () => {
    const outPath = join(workDir, 'clipped-sorted.html');
    const result = await scan(`${edgeBaseUrl}/clipped-and-sorted`, {
      outputPath: outPath,
      widths: [375],
      waitMs: 50,
    });
    const overflow = result.report.results[0]!.overflow!;
    expect(overflow.hasOverflow).toBe(true);
    expect(overflow.overflowPx).toBe(275);
    expect(overflow.elements).toHaveLength(5);
    expect(overflow.elements.map((el) => el.selector)).toEqual([
      '.item-7',
      '.item-6',
      '.item-5',
      '.item-4',
      '.item-3',
    ]);
    expect(overflow.elements.some((el) => el.selector.includes('clipped-giant'))).toBe(false);
    expect(overflow.elements.some((el) => el.selector.includes('zero-size'))).toBe(false);
    expect(overflow.elements.some((el) => el.selector.includes('hidden-wide'))).toBe(false);

    // Open generated HTML to confirm zero script execution from malicious title.
    const context = await browser.newContext({ viewport: { width: 1000, height: 800 } });
    try {
      const page = await context.newPage();
      await page.goto(pathToFileURL(outPath).href);
      expect(await page.evaluate(() => Object.hasOwn(window, '__xss'))).toBe(false);
    } finally {
      await context.close();
    }
  });

  it('rejects invalid URLs, unwritable output paths, and unreachable pages with clear errors', async () => {
    await expect(scan('ftp://example.com/page', { outputPath: join(workDir, 'bad-url.html') }))
      .rejects.toThrow(/http:\/\/ or https:\/\//);

    const existingDir = join(workDir, 'a-directory.html');
    await mkdir(existingDir, { recursive: true });
    await expect(scan(demoServer.fixedUrl, { outputPath: existingDir }))
      .rejects.toThrow(/directory/i);

    const regularFile = join(workDir, 'not-a-dir.txt');
    await writeFile(regularFile, 'occupied', 'utf8');
    await expect(scan(demoServer.fixedUrl, { outputPath: join(regularFile, 'report.html') }))
      .rejects.toThrow(/Cannot write report/i);

    // Find an unused closed loopback port and verify unreachable page error + no fake output file.
    const tempServer = createServer();
    await new Promise<void>((resolve) => tempServer.listen(0, '127.0.0.1', resolve));
    const closedPort = (tempServer.address() as { port: number }).port;
    await new Promise<void>((resolve) => tempServer.close(() => resolve()));

    const unreachableOut = join(workDir, 'unreachable-report.html');
    await expect(scan(`http://127.0.0.1:${closedPort}/missing`, { outputPath: unreachableOut, timeoutMs: 3_000, waitMs: 0 }))
      .rejects.toThrow(/Unable to load/i);
    await expect(stat(unreachableOut)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
