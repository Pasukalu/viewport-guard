import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startFixtureServer } from './fixture-server.mjs';

const projectDir = fileURLToPath(new URL('..', import.meta.url));
const artifactDir = join(projectDir, '.artifacts', 'smoke-v1');
await mkdir(artifactDir, { recursive: true });
const runDir = await mkdtemp(join(artifactDir, 'run-'));
const server = await startFixtureServer();
const results = [];

async function runCli(args, expectedExit) {
  const result = await new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, [join(projectDir, 'dist', 'cli.js'), ...args], {
      cwd: projectDir, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
    const timer = setTimeout(() => { child.kill(); reject(new Error('v1 smoke CLI exceeded its 45 second limit')); }, 45_000);
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('close', (code) => { clearTimeout(timer); resolveRun({ code, stdout, stderr }); });
  });
  assert.equal(result.code, expectedExit, `${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
  return result;
}

function artifactPath(result, label) {
  const lines = result.stdout.split(/\r?\n/).filter((line) => line.startsWith(label));
  assert.equal(lines.length, 1, `Expected one ${label} line: ${result.stdout}\n${result.stderr}`);
  return lines[0].slice(label.length);
}

function record(name, result, artifacts = {}) {
  results.push({ name, exitCode: result.code, ...artifacts });
  console.log(`PASS v1 ${name}: exit ${result.code}`);
}

async function readReport(result) {
  const reportPath = artifactPath(result, 'Report: ');
  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  assert.equal(report.schemaVersion, '1.0.0');
  assert.deepEqual(report.results.map((entry) => entry.viewport), [{ width: 390, height: 900 }]);
  assert.deepEqual(report.summary, { total: 1, passed: 0, failed: 1, errors: 0 });
  assert.equal(report.results[0].status, 'failed');
  assert.equal(report.results[0].overflow.overflowPx, 1410);
  return { report, reportPath };
}

async function assertEmbeddedHtml(htmlPath, reportPath, report) {
  const html = await readFile(htmlPath, 'utf8');
  const screenshot = await readFile(resolve(dirname(reportPath), report.results[0].screenshot));
  const mascot = await readFile(join(projectDir, 'assets', 'brand', 'mascot.png'));
  assert.ok(html.includes(`data:image/png;base64,${screenshot.toString('base64')}`), 'HTML must embed the actual screenshot');
  assert.ok(html.includes(`data:image/png;base64,${mascot.toString('base64')}`), 'HTML must embed the project mascot');
  const images = Array.from(html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g), (match) => match[1]);
  assert.equal(images.length, 2);
  assert.ok(images.every((source) => source.startsWith('data:image/png;base64,')));
  assert.ok(html.includes('Content-Security-Policy'));
  assert.ok(!/<script\b[^>]*\bsrc=|<link\b[^>]*\brel=["']stylesheet["']/i.test(html));
  return html;
}

try {
  const configDir = join(runDir, 'settings');
  await mkdir(configDir);
  const configPath = join(configDir, 'audit.json');
  await writeFile(configPath, `${JSON.stringify({ outputDir: '../configured-audits', widths: [360], waitMs: 0, failOn: [], html: true }, null, 2)}\n`);
  const configured = await runCli(['audit', `${server.url}/overflow.html`, '--config', configPath, '--widths', '390'], 0);
  const configuredRun = await readReport(configured);
  assert.equal(dirname(dirname(configuredRun.reportPath)), resolve(configDir, '../configured-audits'));
  assert.deepEqual(configuredRun.report.options.failOn, []);
  assert.deepEqual(configuredRun.report.evaluation, { failOn: [], passed: true, blockingViewports: [] });
  const configuredHtml = artifactPath(configured, 'HTML report: ');
  await assertEmbeddedHtml(configuredHtml, configuredRun.reportPath, configuredRun.report);
  record('config-policy-html', configured, { reportPath: configuredRun.reportPath, htmlPath: configuredHtml });

  const standalonePath = join(runDir, 'standalone.html');
  const standalone = await runCli(['report', configuredRun.reportPath, '--output', standalonePath], 0);
  assert.equal(artifactPath(standalone, 'HTML report: '), standalonePath);
  const originalHtml = await assertEmbeddedHtml(standalonePath, configuredRun.reportPath, configuredRun.report);
  record('standalone-html', standalone, { htmlPath: standalonePath });
  const refused = await runCli(['report', configuredRun.reportPath, '--output', standalonePath], 2);
  assert.match(refused.stderr, /already exists/i);
  assert.equal(await readFile(standalonePath, 'utf8'), originalHtml);
  record('standalone-preserve-existing', refused);
  const forced = await runCli(['report', configuredRun.reportPath, '--output', standalonePath, '--force'], 0);
  await assertEmbeddedHtml(standalonePath, configuredRun.reportPath, configuredRun.report);
  record('standalone-force', forced, { htmlPath: standalonePath });

  const baseline = await runCli(['audit', `${server.url}/overflow.html`, '--widths', '390', '--wait', '0', '--output', join(runDir, 'baselines')], 1);
  const baselineRun = await readReport(baseline);
  record('baseline-capture', baseline, { reportPath: baselineRun.reportPath });
  const comparisonPath = join(runDir, 'identical-comparison.json');
  const identical = await runCli(['compare', baselineRun.reportPath, baselineRun.reportPath, '--output', comparisonPath], 0);
  assert.equal(artifactPath(identical, 'Comparison: '), comparisonPath);
  assert.deepEqual(JSON.parse(await readFile(comparisonPath, 'utf8')).summary, { added: 0, resolved: 0, worsened: 0, improved: 0, unchanged: 1 });
  record('compare-identical', identical, { comparisonPath });

  const current = await runCli(['audit', `${server.url}/overflow.html`, '--widths', '390', '--wait', '0', '--baseline', baselineRun.reportPath, '--html', '--output', join(runDir, 'current')], 0);
  const currentRun = await readReport(current);
  const currentComparison = artifactPath(current, 'Comparison: ');
  assert.deepEqual(JSON.parse(await readFile(currentComparison, 'utf8')).summary, { added: 0, resolved: 0, worsened: 0, improved: 0, unchanged: 1 });
  const currentHtml = artifactPath(current, 'HTML report: ');
  assert.ok((await assertEmbeddedHtml(currentHtml, currentRun.reportPath, currentRun.report)).includes('Baseline comparison'));
  record('audit-known-baseline', current, { reportPath: currentRun.reportPath, comparisonPath: currentComparison, htmlPath: currentHtml });

  const incompatiblePath = join(runDir, 'incompatible-baseline.json');
  const incompatibleContents = `${JSON.stringify({ ...baselineRun.report, targetUrl: `${server.url}/normal.html` }, null, 2)}\n`;
  await writeFile(incompatiblePath, incompatibleContents);
  const incompatible = await runCli(['audit', `${server.url}/overflow.html`, '--widths', '390', '--wait', '0', '--baseline', incompatiblePath, '--output', join(runDir, 'incompatible')], 2);
  assert.match(incompatible.stderr, /different target URLs/i);
  const incompatibleRun = await readReport(incompatible);
  await assert.rejects(stat(join(dirname(incompatibleRun.reportPath), 'comparison.json')), { code: 'ENOENT' });
  assert.equal(await readFile(incompatiblePath, 'utf8'), incompatibleContents);
  record('audit-incompatible-baseline', incompatible, { reportPath: incompatibleRun.reportPath });

  const summary = { completedAt: new Date().toISOString(), runDir, scenarios: results.length, results };
  await writeFile(join(runDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  await writeFile(join(artifactDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(`v1 smoke artifacts: ${runDir}`);
} finally {
  await server.close();
}
