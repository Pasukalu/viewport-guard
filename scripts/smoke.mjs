import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startFixtureServer } from './fixture-server.mjs';

const projectDir = fileURLToPath(new URL('..', import.meta.url));
const artifactDir = resolve(projectDir, '.artifacts/smoke');
await mkdir(artifactDir, { recursive: true });
const server = await startFixtureServer();

async function runCli(args) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, [join(projectDir, 'dist/cli.js'), ...args], {
      cwd: projectDir, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    const timer = setTimeout(() => { child.kill(); reject(new Error('Smoke CLI timed out')); }, 90_000);
    child.once('close', (code) => {
      clearTimeout(timer);
      resolveRun({ code, stdout, stderr });
    });
  });
}

async function checkPage(name, expectedExit, { fixture = name, waitMs = 250, timeoutMs, waitForSelector, widths } = {}) {
  const parentDir = join(artifactDir, name);
  const expectedWidths = widths ?? [360, 390, 768, 1440];
  const args = ['audit', `${server.url}/${fixture}.html`, '--output', parentDir, '--wait', String(waitMs)];
  if (timeoutMs !== undefined) args.push('--timeout', String(timeoutMs));
  if (waitForSelector !== undefined) args.push('--wait-for', waitForSelector);
  if (widths !== undefined) args.push('--widths', widths.join(','));
  const result = await runCli(args);
  assert.equal(result.code, expectedExit, `${name}: ${result.stdout}\n${result.stderr}`);
  const reportLine = result.stdout.split(/\r?\n/).find((line) => line.startsWith('Report: '));
  assert.ok(reportLine, `${name}: CLI must print the report path`);
  const reportPath = reportLine.slice('Report: '.length);
  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  assert.equal(report.schemaVersion, '1.0.0');
  assert.equal(report.summary.total, expectedWidths.length);
  assert.equal(report.summary.errors, expectedExit === 2 ? expectedWidths.length : 0);
  assert.equal(report.options.waitMs, waitMs);
  if (waitForSelector !== undefined) assert.equal(report.options.waitForSelector, waitForSelector);
  if (widths !== undefined) assert.deepEqual(report.options.widths, widths);
  else assert.equal(Object.hasOwn(report.options, 'widths'), false);
  assert.deepEqual(report.results.map((entry) => entry.viewport.width), expectedWidths);
  const runDir = resolve(reportPath, '..');
  assert.deepEqual((await readdir(join(runDir, 'screenshots'))).sort(), expectedWidths.map((width) => `${width}.png`).sort());
  if (expectedExit === 2) {
    assert.deepEqual(report.summary, { total: expectedWidths.length, passed: 0, failed: 0, errors: expectedWidths.length });
  } else if (fixture === 'normal') {
    assert.deepEqual(report.summary, { total: expectedWidths.length, passed: expectedWidths.length, failed: 0, errors: 0 });
  } else if (['overflow', 'overflow-evidence', 'delayed'].includes(fixture)) {
    const failed = expectedWidths.filter((width) => 1800 - width > 1).length;
    assert.deepEqual(report.summary, { total: expectedWidths.length, passed: expectedWidths.length - failed, failed, errors: 0 });
  } else if (fixture === 'errors') {
    assert.deepEqual(report.summary, { total: expectedWidths.length, passed: 0, failed: expectedWidths.length, errors: 0 });
  }
  for (const entry of report.results) {
    assert.equal(entry.viewport.height, 900);
    assert.equal(entry.screenshot, `screenshots/${entry.viewport.width}.png`);
    const png = await readFile(join(runDir, entry.screenshot));
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(png.readUInt32BE(16), entry.viewport.width);
    assert.equal(png.readUInt32BE(20), 900);
    if (fixture === 'normal') assert.equal(entry.overflow.hasOverflow, false);
    if (fixture === 'overflow' || fixture === 'overflow-evidence' || fixture === 'delayed') assert.equal(entry.overflow.overflowPx, Math.max(0, 1800 - entry.viewport.width));
    if (fixture === 'overflow-evidence') {
      const selectors = entry.overflow.elements.map((element) => element.selector);
      assert.ok(selectors.length >= 2, 'Duplicate-ID panels must produce distinct evidence');
      assert.equal(new Set(selectors).size, selectors.length);
      assert.ok(selectors.every((selector) => selector !== '#duplicate-panel'));
    }
    if (fixture === 'delayed') assert.equal(new URL(entry.finalUrl).search, '?ready=1');
    if (expectedExit === 2) assert.ok(entry.errors.some((error) => error.includes('Readiness wait failed')));
    if (fixture === 'errors') {
      assert.ok(entry.consoleErrors.some((error) => error.text === 'fixture: deliberate console error'));
      assert.ok(entry.pageErrors.some((error) => error.message === 'fixture: deliberate page error'));
      assert.ok(entry.failedRequests.some((request) => request.url.endsWith('/disconnect')));
    }
  }
  console.log(`PASS ${name}: exit ${result.code}, ${expectedWidths.length} viewports, ${expectedWidths.length} PNGs, report ${reportPath}`);
  return { fixture: name, widths: expectedWidths, exitCode: result.code, reportPath, summary: report.summary };
}

try {
  const results = [];
  for (const [name, exitCode] of [['normal', 0], ['overflow', 1], ['overflow-evidence', 1], ['errors', 1]]) {
    results.push(await checkPage(name, exitCode));
  }
  results.push(await checkPage('delayed', 1, { waitMs: 0, waitForSelector: '#ready' }));
  results.push(await checkPage('readiness-timeout', 2, {
    fixture: 'normal', waitMs: 0, timeoutMs: 250, waitForSelector: '#never-ready',
  }));
  results.push(await checkPage('custom-normal', 0, { fixture: 'normal', widths: [1024, 320] }));
  results.push(await checkPage('custom-overflow', 1, { fixture: 'overflow', widths: [1920, 320, 1024] }));
  results.push(await checkPage('custom-delayed', 1, {
    fixture: 'delayed', widths: [1024, 320], waitMs: 0, waitForSelector: '#ready',
  }));
  const invalid = await runCli(['audit', 'file:///tmp/fixture.html']);
  assert.equal(invalid.code, 2);
  assert.match(invalid.stderr, /http:\/\/ or https:\/\//);
  console.log('PASS invalid URL: exit 2');
  const invalidWidthOutput = join(artifactDir, 'invalid-widths');
  const invalidWidths = await runCli(['audit', `${server.url}/normal.html`, '--widths', '320,320', '--output', invalidWidthOutput]);
  assert.equal(invalidWidths.code, 2);
  assert.match(invalidWidths.stderr, /Invalid input:.*widths/);
  assert.ok(!invalidWidths.stdout.includes('Report:'));
  await assert.rejects(stat(invalidWidthOutput), { code: 'ENOENT' });
  console.log('PASS invalid widths: exit 2, no report or output directory');
  await writeFile(join(artifactDir, 'summary.json'), `${JSON.stringify({ completedAt: new Date().toISOString(), results, invalidUrlExitCode: invalid.code, invalidWidthsExitCode: invalidWidths.code }, null, 2)}\n`);
  console.log(`Smoke artifacts: ${artifactDir}`);
} finally {
  await server.close();
}
