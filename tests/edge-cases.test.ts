import { createServer, type Server } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { audit } from '../src/audit.js';
import { urlSchema } from '../src/config.js';

const html = (content: string) => `<!doctype html><html><head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <link rel="icon" href="data:,">
  <style>html,body{margin:0;padding:0}*{box-sizing:border-box}</style>
  </head><body>${content}</body></html>`;

describe('audit edge cases', () => {
  let server: Server;
  let baseUrl: string;
  let outputDir: string;

  beforeAll(async () => {
    outputDir = await mkdtemp(join(tmpdir(), 'viewport-guard-edge-'));
    server = createServer((request, response) => {
      if (request.url === '/pending') {
        // A valid long-running request must not fail just because sampling ends.
        return;
      }
      const content = request.url === '/scroll'
        ? '<main style="width:100%;overflow-x:auto"><div style="width:1800px;height:40px">Internal scroller</div></main>'
        : request.url === '/inflight'
          ? '<p>Pending fetch</p><script>fetch("/pending").catch(() => {})</script>'
          : '<main style="width:100%;padding:16px"><h1>Normal page</h1></main>';
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
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

  it('does not report an internal horizontal scroller as page overflow', async () => {
    const { report } = await audit(`${baseUrl}/scroll`, { outputDir, waitMs: 25 });
    expect(report.summary, JSON.stringify(report.results)).toEqual({ total: 4, passed: 4, failed: 0, errors: 0 });
    for (const result of report.results) {
      expect(result.overflow?.hasOverflow).toBe(false);
      expect(result.overflow?.elements).toEqual([]);
    }
  });

  it('keeps existing files and previous reports when reusing an output directory', async () => {
    const sentinel = join(outputDir, 'keep-existing.txt');
    await writeFile(sentinel, 'existing user content', 'utf8');
    const first = await audit(`${baseUrl}/normal`, { outputDir, waitMs: 0 });
    const firstContents = await readFile(first.reportPath, 'utf8');
    const second = await audit(`${baseUrl}/normal`, { outputDir, waitMs: 0 });

    expect(second.outputDir).not.toBe(first.outputDir);
    expect(await readFile(sentinel, 'utf8')).toBe('existing user content');
    expect(await readFile(first.reportPath, 'utf8')).toBe(firstContents);
    expect(first.report.summary.passed).toBe(4);
    expect(second.report.summary.passed).toBe(4);
    for (const run of [first, second]) {
      for (const result of run.report.results) {
        expect(result.screenshot).not.toBeNull();
        const screenshot = await readFile(join(run.outputDir, result.screenshot!));
        expect(screenshot.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      }
    }
  });

  it('does not turn a request still pending at sampling end into a network finding', async () => {
    const { report } = await audit(`${baseUrl}/inflight`, { outputDir, waitMs: 25 });
    expect(report.summary).toEqual({ total: 4, passed: 4, failed: 0, errors: 0 });
    for (const result of report.results) expect(result.failedRequests).toEqual([]);
  });

  it.each(['not-a-url', ':', 'http://[bad', 'https://', '', 'http://'])('rejects malformed URL %j without throwing from safeParse', (value) => {
    expect(() => urlSchema.safeParse(value)).not.toThrow();
    expect(urlSchema.safeParse(value).success).toBe(false);
  });
});
