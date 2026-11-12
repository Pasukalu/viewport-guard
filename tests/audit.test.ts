import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { audit } from '../src/audit.js';
import { getExitCode, reportSchema } from '../src/report.js';
import { startFixtureServer } from './helpers/fixture-server.js';

describe('real Chromium audits', () => {
  let server: Awaited<ReturnType<typeof startFixtureServer>>;
  let outputDir: string;
  let cleanRunDir: string;

  beforeAll(async () => {
    server = await startFixtureServer();
    outputDir = await mkdtemp(join(tmpdir(), 'viewport-guard-test-'));
  });

  afterAll(async () => {
    await server?.close();
    if (outputDir) await rm(outputDir, { recursive: true, force: true });
  });

  it('passes a responsive page and writes four correctly sized PNGs plus valid JSON', async () => {
    const run = await audit(`${server.url}/normal.html`, { outputDir, waitMs: 100 });
    cleanRunDir = run.outputDir;
    expect(run.report.summary).toEqual({ total: 4, passed: 4, failed: 0, errors: 0 });
    expect(getExitCode(run.report)).toBe(0);
    expect(run.report.results.map((result) => result.viewport.width)).toEqual([360, 390, 768, 1440]);
    expect(reportSchema.parse(JSON.parse(await readFile(run.reportPath, 'utf8')))).toEqual(run.report);
    for (const result of run.report.results) {
      expect(result.overflow?.hasOverflow).toBe(false);
      expect(result.consoleErrors).toEqual([]);
      expect(result.pageErrors).toEqual([]);
      expect(result.failedRequests).toEqual([]);
      expect(result.screenshot).toBe(`screenshots/${result.viewport.width}.png`);
      const png = await readFile(join(run.outputDir, result.screenshot!));
      expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      expect(png.readUInt32BE(16)).toBe(result.viewport.width);
      expect(png.readUInt32BE(20)).toBe(900);
    }
  });

  it('detects the intentional wide panel at all four widths without overwriting earlier output', async () => {
    const run = await audit(`${server.url}/overflow.html`, { outputDir, waitMs: 50 });
    expect(run.outputDir).not.toBe(cleanRunDir);
    expect(run.report.summary).toEqual({ total: 4, passed: 0, failed: 4, errors: 0 });
    expect(getExitCode(run.report)).toBe(1);
    for (const result of run.report.results) {
      expect(result.overflow?.hasOverflow).toBe(true);
      expect(result.overflow?.overflowPx).toBe(1800 - result.viewport.width);
      expect(result.overflow?.elements.some((element) => element.selector === '#wide-panel')).toBe(true);
    }
    expect(JSON.parse(await readFile(join(cleanRunDir, 'report.json'), 'utf8')).summary.passed).toBe(4);
  });

  it('collects console errors, uncaught exceptions, and failed transport requests', async () => {
    const run = await audit(`${server.url}/errors.html`, { outputDir, waitMs: 250 });
    expect(run.report.summary).toEqual({ total: 4, passed: 0, failed: 4, errors: 0 });
    for (const result of run.report.results) {
      expect(result.consoleErrors.some((error) => error.text === 'fixture: deliberate console error')).toBe(true);
      expect(result.pageErrors.some((error) => error.message === 'fixture: deliberate page error')).toBe(true);
      expect(result.failedRequests.some((request) => request.url === `${server.url}/disconnect`
        && request.method === 'GET' && request.errorText.length > 0)).toBe(true);
      expect(result.overflow?.hasOverflow).toBe(false);
    }
  });

  it('keeps a partial report and continues all viewports after HTTP navigation failures', async () => {
    const run = await audit(`${server.url}/missing.html`, { outputDir, waitMs: 0, timeoutMs: 2_000 });
    expect(run.report.summary).toEqual({ total: 4, passed: 0, failed: 0, errors: 4 });
    expect(getExitCode(run.report)).toBe(2);
    expect(JSON.parse(await readFile(run.reportPath, 'utf8')).results).toHaveLength(4);
    for (const result of run.report.results) {
      expect(result.errors.some((error) => error.includes('HTTP 404'))).toBe(true);
      expect(result.failedRequests).toEqual([]);
    }
  });
});
