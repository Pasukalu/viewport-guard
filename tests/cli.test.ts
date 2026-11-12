import { execFile, spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const projectDir = fileURLToPath(new URL('..', import.meta.url));
const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
let buildDir: string;
let version: string;

interface CliResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

async function runCli(args: string[]): Promise<CliResult> {
  return new Promise<CliResult>((resolve, reject) => {
    const child = spawn(process.execPath, [join(buildDir, 'cli.js'), ...args], {
      cwd: projectDir,
      env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: join(buildDir, 'no-browser-installed') },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => { stderr += chunk; });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('CLI argument test exceeded its 10 second limit'));
    }, 10_000);
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

async function expectInputError(args: string[], message: RegExp): Promise<void> {
  const result = await runCli(args);
  expect(result.code).toBe(2);
  expect(result.stderr).toMatch(message);
  expect(result.stdout).not.toContain('Report:');
  expect(result.stderr).not.toContain('Audit failed:');
}

describe('compiled CLI arguments without a browser', () => {
  beforeAll(async () => {
    const artifactDir = join(projectDir, '.artifacts');
    await mkdir(artifactDir, { recursive: true });
    buildDir = await mkdtemp(join(artifactDir, 'cli-test-'));
    const metadata = JSON.parse(await readFile(join(projectDir, 'package.json'), 'utf8')) as { version: string };
    version = metadata.version;
    // Compile once into an isolated directory so npm test needs no prebuilt dist.
    await execFileAsync(process.execPath, [
      require.resolve('typescript/bin/tsc'), '-p', join(projectDir, 'tsconfig.json'),
      '--outDir', buildDir, '--declaration', 'false', '--sourceMap', 'false',
    ], { cwd: projectDir, windowsHide: true, timeout: 20_000 });
  });

  afterAll(async () => {
    if (buildDir) await rm(buildDir, { recursive: true, force: true });
  });

  it('prints top-level help and exits successfully', async () => {
    const result = await runCli(['--help']);
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/Usage: viewport-guard/);
    expect(result.stdout).toContain('audit');
    expect(result.stderr).toBe('');
  });

  it('prints audit help including the readiness, timeout, and width options', async () => {
    const result = await runCli(['audit', '--help']);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('<url>');
    expect(result.stdout).toContain('--wait-for <selector>');
    expect(result.stdout).toContain('--timeout <ms>');
    expect(result.stdout).toContain('--widths <list>');
    expect(result.stderr).toBe('');
  });

  it('prints the version declared in package.json', async () => {
    const result = await runCli(['--version']);
    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe(version);
    expect(result.stderr).toBe('');
  });

  it('rejects a missing audit URL', async () => {
    await expectInputError(['audit'], /missing required argument.*url/i);
  });

  it('rejects an unknown command', async () => {
    await expectInputError(['inspect'], /unknown command.*inspect/i);
  });

  it('rejects an unexpected extra positional argument', async () => {
    await expectInputError(['audit', 'http://127.0.0.1:9', 'unexpected'], /too many arguments/i);
  });

  it('rejects an unknown option', async () => {
    await expectInputError(['audit', 'http://127.0.0.1:9', '--unknown-option'], /unknown option/i);
  });

  it('rejects an option with its required value missing', async () => {
    await expectInputError(['audit', 'http://127.0.0.1:9', '--timeout'], /argument missing/i);
  });

  it.each(['', '   '])('rejects an explicitly empty comparison output %j before reading reports', async (output) => {
    await expectInputError(['compare', 'missing-baseline.json', 'missing-current.json', '--output', output], /output path must not be empty/i);
  });

  it.each([
    { name: 'malformed timeout', flags: ['--timeout', '10ms'], field: 'timeoutMs' },
    { name: 'zero timeout', flags: ['--timeout', '0'], field: 'timeoutMs' },
    { name: 'out-of-range wait', flags: ['--wait', '30001'], field: 'waitMs' },
    { name: 'empty selector', flags: ['--wait-for', '   '], field: 'waitForSelector' },
    { name: 'empty output path', flags: ['--output', '   '], field: 'outputDir' },
  ])('rejects $name before launching Chromium', async ({ flags, field }) => {
    await expectInputError(['audit', 'http://127.0.0.1:9', ...flags], new RegExp(`Invalid input:.*${field}`));
  });

  it.each([
    '', '   ', '()', '239', '3841', '320,320', '0360,360',
    '240,241,242,243,244,245,246,247,248',
    '320.5', '1e3', '0x140', '320px', '320,,768', ',320', '320,',
  ])('rejects invalid width list %j before launching Chromium', async (widths) => {
    await expectInputError(['audit', 'http://127.0.0.1:9', '--widths', widths], /Invalid input:.*widths/);
  });

  it.each([
    { name: 'malformed URL', url: 'not a URL', message: /Invalid input:/ },
    { name: 'unsupported protocol', url: 'file:///tmp/fixture.html', message: /URL must use http:\/\/ or https:\/\// },
    { name: 'embedded credentials', url: 'https://user:password@example.test', message: /URL credentials are not supported/ },
  ])('rejects $name before launching Chromium', async ({ url, message }) => {
    await expectInputError(['audit', url], message);
  });
});
