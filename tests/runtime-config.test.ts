import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveRuntimeConfig } from '../src/runtime-config.js';
import { parseFailOn } from '../src/config.js';

describe('JSON configuration and explicit CLI overrides', () => {
  let root: string;
  let settings: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'viewport-guard-config-'));
    settings = join(root, 'settings');
    await mkdir(settings);
  });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });

  async function file(value: unknown): Promise<string> {
    const path = join(settings, 'audit.json');
    await writeFile(path, JSON.stringify(value));
    return path;
  }

  it('uses the working directory for defaults even when an empty config is elsewhere', async () => {
    const runtime = await resolveRuntimeConfig(await file({}), {}, root);
    expect(runtime).toEqual({
      auditOptions: { outputDir: resolve(root, 'viewport-guard-reports'), timeoutMs: 15000, waitMs: 500 }, html: false,
    });
  });

  it('resolves file and explicit CLI paths from their own origins without changing process cwd', async () => {
    const before = process.cwd();
    const config = await file({ outputDir: 'saved', baseline: '../baseline.json', timeoutMs: 800, waitMs: 50, widths: [390], html: true, failOn: ['console'] });
    const fromFile = await resolveRuntimeConfig(config, {}, root);
    expect(fromFile.auditOptions.outputDir).toBe(join(settings, 'saved'));
    expect(fromFile.baseline).toBe(join(root, 'baseline.json'));
    const overridden = await resolveRuntimeConfig(config, { outputDir: 'cli-output', baseline: 'cli-base.json', waitMs: 0, widths: [1024, 320], html: false, failOn: [] }, root);
    expect(overridden.auditOptions).toEqual({ outputDir: join(root, 'cli-output'), timeoutMs: 800, waitMs: 0, widths: [1024, 320], failOn: [] });
    expect(overridden.baseline).toBe(join(root, 'cli-base.json'));
    expect(overridden.html).toBe(false);
    expect(process.cwd()).toBe(before);
  });

  it('allows explicitly disabling a configured baseline', async () => {
    const runtime = await resolveRuntimeConfig(await file({ baseline: 'old.json', html: true }), { baseline: false }, root);
    expect(runtime).not.toHaveProperty('baseline');
    expect(runtime.html).toBe(true);
  });

  it.each([
    { unknown: true }, { timeoutMs: 0 }, { html: 'yes' }, { widths: [390, 390] }, { failOn: ['unknown'] }, { failOn: ['console', 'console'] }, { baseline: '' },
  ])('rejects invalid config even when CLI values might otherwise replace it', async (value) => {
    await expect(resolveRuntimeConfig(await file(value), { timeoutMs: 1000, html: false, widths: [320], failOn: [] }, root)).rejects.toThrow();
  });

  it('reports malformed JSON and excessive config size without executing content', async () => {
    const path = join(settings, 'bad.json');
    await writeFile(path, '{');
    await expect(resolveRuntimeConfig(path, {}, root)).rejects.toThrow('Invalid JSON');
    await writeFile(path, ' '.repeat(64 * 1024 + 1));
    await expect(resolveRuntimeConfig(path, {}, root)).rejects.toThrow('exceeds');
  });

  it('parses all and none aliases without changing the default policy', () => {
    expect(parseFailOn('all')).toEqual(['overflow', 'console', 'pageerror', 'request']);
    expect(parseFailOn('none')).toEqual([]);
    expect(parseFailOn(' console,overflow ')).toEqual(['console', 'overflow']);
  });
});
