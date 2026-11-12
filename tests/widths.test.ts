import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { audit, type AuditResult } from '../src/audit.js';
import { VIEWPORTS } from '../src/config.js';
import { getExitCode, reportSchema } from '../src/report.js';
import { startFixtureServer } from './helpers/fixture-server.js';

async function expectWidthArtifacts(run: AuditResult, widths: number[]): Promise<void> {
  expect(run.report.options.widths).toEqual(widths);
  expect(run.report.results.map((result) => result.viewport.width)).toEqual(widths);
  expect(run.report.summary.total).toBe(widths.length);
  expect(reportSchema.parse(JSON.parse(await readFile(run.reportPath, 'utf8')))).toEqual(run.report);
  expect((await readdir(join(run.outputDir, 'screenshots'))).sort()).toEqual(widths.map((width) => `${width}.png`).sort());
  for (const result of run.report.results) {
    expect(result.viewport.height).toBe(900);
    expect(result.screenshot).toBe(`screenshots/${result.viewport.width}.png`);
    const png = await readFile(join(run.outputDir, result.screenshot!));
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(png.readUInt32BE(16)).toBe(result.viewport.width);
    expect(png.readUInt32BE(20)).toBe(900);
  }
}

describe('custom viewport widths', () => {
  let server: Awaited<ReturnType<typeof startFixtureServer>>;
  let outputDir: string;

  beforeAll(async () => {
    server = await startFixtureServer();
    outputDir = await mkdtemp(join(tmpdir(), 'viewport-guard-widths-'));
  });

  afterAll(async () => {
    await server?.close();
    if (outputDir) await rm(outputDir, { recursive: true, force: true });
  });

  it('preserves an unsorted list with mixed findings and leaves caller/default arrays unchanged', async () => {
    const widths = [1920, 320, 1024];
    const run = await audit(`${server.url}/overflow.html`, { outputDir, waitMs: 0, widths });
    expect(run.report.summary).toEqual({ total: 3, passed: 1, failed: 2, errors: 0 });
    expect(getExitCode(run.report)).toBe(1);
    expect(run.report.results.map((result) => result.status)).toEqual(['passed', 'failed', 'failed']);
    for (const result of run.report.results) {
      expect(result.overflow?.overflowPx).toBe(Math.max(0, 1800 - result.viewport.width));
    }
    expect(widths).toEqual([1920, 320, 1024]);
    expect(VIEWPORTS).toEqual([360, 390, 768, 1440].map((width) => ({ width, height: 900 })));
    await expectWidthArtifacts(run, widths);
  });

  it('runs a singleton list with one screenshot and no default-width extras', async () => {
    const run = await audit(`${server.url}/normal.html`, { outputDir, waitMs: 0, widths: [768] });
    expect(run.report.summary).toEqual({ total: 1, passed: 1, failed: 0, errors: 0 });
    expect(getExitCode(run.report)).toBe(0);
    expect(run.report.results[0]?.overflow?.hasOverflow).toBe(false);
    await expectWidthArtifacts(run, [768]);
  });

  it('combines custom order with CSS readiness and preserves the URL of the delayed evidence', async () => {
    const widths = [1024, 320];
    const run = await audit(`${server.url}/delayed.html`, {
      outputDir, waitMs: 0, timeoutMs: 3_000, widths, waitForSelector: '#ready',
    });
    expect(run.report.summary).toEqual({ total: 2, passed: 0, failed: 2, errors: 0 });
    expect(getExitCode(run.report)).toBe(1);
    expect(run.report.options.waitForSelector).toBe('#ready');
    for (const result of run.report.results) {
      expect(result.finalUrl).toBe(`${server.url}/delayed.html?ready=1`);
      expect(result.overflow?.overflowPx).toBe(1800 - result.viewport.width);
      expect(result.errors).toEqual([]);
    }
    await expectWidthArtifacts(run, widths);
  });

  it('rejects duplicate API widths before browser launch or output creation', async () => {
    const invalidOutput = join(outputDir, 'invalid-input');
    const launch = vi.spyOn(chromium, 'launch');
    try {
      await expect(audit(`${server.url}/normal.html`, { outputDir: invalidOutput, widths: [320, 320] })).rejects.toMatchObject({ name: 'ZodError' });
      expect(launch).not.toHaveBeenCalled();
      await expect(stat(invalidOutput)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      launch.mockRestore();
    }
  });
});
