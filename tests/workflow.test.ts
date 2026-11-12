import { execFile, spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { comparisonSchema } from '../src/compare.js';
import { reportSchema } from '../src/report.js';
import { startFixtureServer } from './helpers/fixture-server.js';

const projectDir = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const execFileAsync = promisify(execFile);

interface CliResult { code: number | null; stdout: string; stderr: string }

describe('compiled CLI workflows', () => {
  let buildDir: string;
  let dataDir: string;
  let caseDir: string;
  let server: Awaited<ReturnType<typeof startFixtureServer>>;

  beforeAll(async () => {
    const artifactDir = join(projectDir, '.artifacts');
    await mkdir(artifactDir, { recursive: true });
    buildDir = await mkdtemp(join(artifactDir, 'workflow-cli-'));
    dataDir = await mkdtemp(join(artifactDir, 'workflow-data-'));
    await execFileAsync(process.execPath, [
      require.resolve('typescript/bin/tsc'), '-p', join(projectDir, 'tsconfig.json'),
      '--outDir', buildDir, '--declaration', 'false', '--sourceMap', 'false',
    ], { cwd: projectDir, windowsHide: true, timeout: 20_000 });
    server = await startFixtureServer();
  });

  beforeEach(async () => { caseDir = await mkdtemp(join(dataDir, 'case-')); });

  afterAll(async () => {
    await server?.close();
    if (buildDir) await rm(buildDir, { recursive: true, force: true });
    if (dataDir) await rm(dataDir, { recursive: true, force: true });
  });

  async function runCli(args: string[]): Promise<CliResult> {
    return new Promise<CliResult>((resolveRun, reject) => {
      const child = spawn(process.execPath, [join(buildDir, 'cli.js'), ...args], {
        cwd: projectDir, env: process.env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      child.stdout.setEncoding('utf8').on('data', (chunk: string) => { stdout += chunk; });
      child.stderr.setEncoding('utf8').on('data', (chunk: string) => { stderr += chunk; });
      const timer = setTimeout(() => { child.kill(); reject(new Error('CLI workflow exceeded its 45 second limit')); }, 45_000);
      child.once('error', (error) => { clearTimeout(timer); reject(error); });
      child.once('close', (code) => { clearTimeout(timer); resolveRun({ code, stdout, stderr }); });
    });
  }

  function artifactPath(result: CliResult, label = 'Report: '): string {
    const line = result.stdout.split(/\r?\n/).find((entry) => entry.startsWith(label));
    expect(line, `${result.stdout}\n${result.stderr}`).toBeDefined();
    return line!.slice(label.length);
  }

  async function auditFixture(name: string, extra: string[] = []): Promise<{ result: CliResult; reportPath: string; report: ReturnType<typeof reportSchema.parse> }> {
    const result = await runCli(['audit', `${server.url}/${name}.html`, '--widths', '360', '--wait', '0', '--output', join(caseDir, 'audits'), ...extra]);
    const reportPath = artifactPath(result);
    const report = reportSchema.parse(JSON.parse(await readFile(reportPath, 'utf8')));
    return { result, reportPath, report };
  }

  it('uses config-relative output paths while explicit CLI width and wait options take precedence', async () => {
    const configDir = join(caseDir, 'settings');
    await mkdir(configDir);
    const configPath = join(configDir, 'audit.json');
    await writeFile(configPath, JSON.stringify({ outputDir: 'saved-runs', widths: [360], waitMs: 1500, html: true }));
    const result = await runCli(['audit', `${server.url}/normal.html`, '--config', configPath, '--widths', '768,320', '--wait', '0']);
    expect(result.code, result.stderr).toBe(0);
    const reportPath = artifactPath(result);
    expect(dirname(dirname(reportPath))).toBe(resolve(configDir, 'saved-runs'));
    const report = reportSchema.parse(JSON.parse(await readFile(reportPath, 'utf8')));
    expect(report.options.widths).toEqual([768, 320]);
    expect(report.options.waitMs).toBe(0);
    expect(report.summary).toEqual({ total: 2, passed: 2, failed: 0, errors: 0 });
    const htmlPath = artifactPath(result, 'HTML report: ');
    expect(dirname(htmlPath)).toBe(dirname(reportPath));
    const html = await readFile(htmlPath, 'utf8');
    expect(html).toContain('Viewport Guard');
    expect(html).toContain('data:image/png;base64,');
    expect(result.stdout.split(/\r?\n/).filter((line) => line.startsWith('Report: '))).toHaveLength(1);
  });

  it('can ignore findings for exit policy while preserving raw failed states and counts', async () => {
    const { result, report } = await auditFixture('overflow', ['--fail-on', 'none']);
    expect(result.code, result.stderr).toBe(0);
    expect(report.options.failOn).toEqual([]);
    expect(report.summary).toEqual({ total: 1, passed: 0, failed: 1, errors: 0 });
    expect(report.results[0]?.status).toBe('failed');
    expect(report.results[0]?.overflow?.hasOverflow).toBe(true);
    expect(report.evaluation?.passed).toBe(true);
  });

  it('compares a baseline with itself and writes a no-regression comparison JSON file', async () => {
    const baseline = await auditFixture('overflow');
    expect(baseline.result.code).toBe(1);
    const outputPath = join(caseDir, 'comparison.json');
    const result = await runCli(['compare', baseline.reportPath, baseline.reportPath, '--output', outputPath]);
    expect(result.code, result.stderr).toBe(0);
    expect(artifactPath(result, 'Comparison: ')).toBe(outputPath);
    const comparison = comparisonSchema.parse(JSON.parse(await readFile(outputPath, 'utf8')));
    expect(comparison.summary).toEqual({ added: 0, resolved: 0, worsened: 0, improved: 0, unchanged: 1 });
  });

  it('accepts unchanged known findings against a baseline and includes the comparison in HTML', async () => {
    const baseline = await auditFixture('overflow');
    expect(baseline.result.code, baseline.result.stderr).toBe(1);
    const current = await auditFixture('overflow', ['--baseline', baseline.reportPath, '--html']);
    expect(current.result.code, current.result.stderr).toBe(0);
    expect(current.report.summary.failed).toBe(1);
    const comparisonPath = artifactPath(current.result, 'Comparison: ');
    expect(dirname(comparisonPath)).toBe(dirname(current.reportPath));
    expect(JSON.parse(await readFile(comparisonPath, 'utf8')).summary).toEqual({ added: 0, resolved: 0, worsened: 0, improved: 0, unchanged: 1 });
    const html = await readFile(artifactPath(current.result, 'HTML report: '), 'utf8');
    expect(html).toContain('Baseline comparison');
    expect(html).toContain('Unchanged');
  });

  it('renders an existing JSON report independently and requires force to replace the HTML', async () => {
    const baseline = await auditFixture('normal');
    expect(baseline.result.code, baseline.result.stderr).toBe(0);
    const outputPath = join(caseDir, 'standalone.html');
    const first = await runCli(['report', baseline.reportPath, '--output', outputPath]);
    expect(first.code, first.stderr).toBe(0);
    expect(artifactPath(first, 'HTML report: ')).toBe(outputPath);
    const html = await readFile(outputPath, 'utf8');
    expect(html).toContain('data:image/png;base64,');
    expect(html).toContain('Content-Security-Policy');
    const rejected = await runCli(['report', baseline.reportPath, '--output', outputPath]);
    expect(rejected.code).toBe(2);
    expect(rejected.stderr).toMatch(/already exists/i);
    expect(await readFile(outputPath, 'utf8')).toBe(html);
    const forced = await runCli(['report', baseline.reportPath, '--output', outputPath, '--force']);
    expect(forced.code, forced.stderr).toBe(0);
  });

  it('rejects unknown config keys before creating any audit output', async () => {
    const outputPath = join(caseDir, 'must-not-exist');
    const configPath = join(caseDir, 'invalid.json');
    await writeFile(configPath, JSON.stringify({ outputDir: outputPath, unknownSetting: true }));
    const result = await runCli(['audit', `${server.url}/normal.html`, '--config', configPath]);
    expect(result.code).toBe(2);
    expect(result.stderr).toMatch(/unrecognized|unknown/i);
    expect(result.stdout).not.toContain('Report: ');
    await expect(stat(outputPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects incompatible target URLs before creating comparison output', async () => {
    const baseline = await auditFixture('normal');
    expect(baseline.result.code, baseline.result.stderr).toBe(0);
    const currentPath = join(caseDir, 'different-target.json');
    await writeFile(currentPath, JSON.stringify({ ...baseline.report, targetUrl: `${server.url}/different.html` }));
    const outputPath = join(caseDir, 'incompatible.json');
    const result = await runCli(['compare', baseline.reportPath, currentPath, '--output', outputPath]);
    expect(result.code).toBe(2);
    expect(result.stderr).toMatch(/different target URLs/i);
    await expect(stat(outputPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
