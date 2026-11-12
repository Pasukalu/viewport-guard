import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { audit, type AuditResult } from '../src/audit.js';
import { getExitCode, reportSchema } from '../src/report.js';
import { startFixtureServer } from './helpers/fixture-server.js';

async function expectSavedArtifacts(run: AuditResult): Promise<void> {
  expect(run.report.results.map((result) => result.viewport.width)).toEqual([360, 390, 768, 1440]);
  expect(reportSchema.parse(JSON.parse(await readFile(run.reportPath, 'utf8')))).toEqual(run.report);
  for (const result of run.report.results) {
    expect(result.screenshot).toBe(`screenshots/${result.viewport.width}.png`);
    const png = await readFile(join(run.outputDir, result.screenshot!));
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(png.readUInt32BE(16)).toBe(result.viewport.width);
    expect(png.readUInt32BE(20)).toBe(900);
  }
}

describe('CSS readiness selector', () => {
  let server: Awaited<ReturnType<typeof startFixtureServer>>;
  let outputDir: string;

  beforeAll(async () => {
    server = await startFixtureServer();
    outputDir = await mkdtemp(join(tmpdir(), 'viewport-guard-readiness-'));
  });

  afterAll(async () => {
    await server?.close();
    if (outputDir) await rm(outputDir, { recursive: true, force: true });
  });

  it('waits for a hidden element to become visible before measuring delayed overflow at all widths', async () => {
    const run = await audit(`${server.url}/delayed.html`, {
      outputDir, waitMs: 0, timeoutMs: 3_000, waitForSelector: '#ready',
    });
    expect(run.report.options.waitForSelector).toBe('#ready');
    expect(run.report.options.waitMs).toBe(0);
    expect(run.report.summary).toEqual({ total: 4, passed: 0, failed: 4, errors: 0 });
    expect(getExitCode(run.report)).toBe(1);
    for (const result of run.report.results) {
      expect(result.finalUrl).toBe(`${server.url}/delayed.html?ready=1`);
      expect(result.overflow?.hasOverflow).toBe(true);
      expect(result.overflow?.overflowPx).toBe(1800 - result.viewport.width);
      expect(result.overflow?.elements.some((element) => element.selector === '#ready')).toBe(true);
      expect(result.errors).toEqual([]);
    }
    await expectSavedArtifacts(run);
  });

  it('records readiness timeouts while preserving measurements, screenshots, and all four results', async () => {
    const run = await audit(`${server.url}/normal.html`, {
      outputDir, waitMs: 0, timeoutMs: 250, waitForSelector: '#never-ready',
    });
    expect(run.report.options.waitForSelector).toBe('#never-ready');
    expect(run.report.summary).toEqual({ total: 4, passed: 0, failed: 0, errors: 4 });
    expect(getExitCode(run.report)).toBe(2);
    for (const result of run.report.results) {
      expect(result.errors.some((error) => error.includes('Readiness wait failed'))).toBe(true);
      expect(result.overflow?.hasOverflow).toBe(false);
    }
    await expectSavedArtifacts(run);
  });

  it.each(['[', 'text=ready', '#ready >> text=x'])('records invalid CSS selector %s as readiness errors and preserves screenshots at every width', async (selector) => {
    const run = await audit(`${server.url}/normal.html`, {
      outputDir, waitMs: 0, timeoutMs: 2_000, waitForSelector: selector,
    });
    expect(run.report.options.waitForSelector).toBe(selector);
    expect(run.report.summary).toEqual({ total: 4, passed: 0, failed: 0, errors: 4 });
    expect(getExitCode(run.report)).toBe(2);
    for (const result of run.report.results) {
      expect(result.errors.some((error) => error.includes('Readiness wait failed'))).toBe(true);
      expect(result.overflow?.hasOverflow).toBe(false);
    }
    await expectSavedArtifacts(run);
  });
});
