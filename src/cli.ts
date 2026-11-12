#!/usr/bin/env node
import { basename, dirname, extname, join, resolve } from 'node:path';
import { Command, CommanderError } from 'commander';
import { ZodError } from 'zod';
import { audit } from './audit.js';
import { compareReports } from './compare.js';
import { parseFailOn, parseMilliseconds, parseWidths } from './config.js';
import { assertOutputIsNotInput, readReportFile, writeJsonOutput } from './files.js';
import { writeHtmlReport } from './html.js';
import { getExitCode } from './report.js';
import { resolveRuntimeConfig } from './runtime-config.js';

const program = new Command();
program.name('viewport-guard')
  .description('Your whale-girl lookout for every viewport. Audit, compare, and inspect offline.')
  .version('1.0.0').showHelpAfterError().exitOverride();

program.command('audit')
  .description('Save viewport screenshots and a JSON report (HTTP/HTTPS only).')
  .argument('<url>', 'Page to audit')
  .option('--config <file>', 'Read JSON configuration; explicit CLI values take priority')
  .option('-o, --output <dir>', 'Parent for unique runs (default: viewport-guard-reports)')
  .option('--timeout <ms>', 'Per-operation timeout, 1–120000 (default: 15000)', parseMilliseconds)
  .option('--wait <ms>', 'Delay after readiness, 0–30000 (default: 500)', parseMilliseconds)
  .option('--wait-for <selector>', 'Wait for the first CSS match to be visible')
  .option('--widths <list>', '1–8 unique widths, 240–3840 (default: 360,390,768,1440)', parseWidths)
  .option('--fail-on <list>', 'all, none, or overflow,console,pageerror,request', parseFailOn)
  .option('--html', 'Also create a self-contained whale-girl HTML report')
  .option('--no-html', 'Disable HTML requested by the configuration file')
  .option('--baseline <file>', 'Compare against a baseline; fail only on regressions')
  .option('--no-baseline', 'Disable the baseline requested by the configuration file')
  .action(async (url: string, flags: Record<string, unknown>, command: Command) => {
    const fields: Record<string, string> = {
      output: 'outputDir', timeout: 'timeoutMs', wait: 'waitMs', waitFor: 'waitForSelector',
      widths: 'widths', failOn: 'failOn', html: 'html', baseline: 'baseline',
    };
    const overrides: Record<string, unknown> = {};
    for (const [flag, key] of Object.entries(fields)) {
      if (command.getOptionValueSource(flag) === 'cli') overrides[key] = flags[flag];
    }
    const runtime = await resolveRuntimeConfig(typeof flags.config === 'string' ? flags.config : undefined, overrides);
    const baseline = runtime.baseline ? await readReportFile(runtime.baseline) : undefined;
    const run = await audit(url, runtime.auditOptions);
    for (const result of run.report.results) {
      console.log(`${result.viewport.width}x${result.viewport.height}: ${result.status} | overflow=${result.overflow?.overflowPx ?? 'unknown'}px | console=${result.consoleErrors.length} | pageerror=${result.pageErrors.length} | requests=${result.failedRequests.length}`);
      for (const error of result.errors) console.error(`  ${error}`);
    }
    for (const error of run.report.errors ?? []) console.error(error);
    console.log(`Report: ${run.reportPath}`);
    if (run.report.evaluation) {
      console.log(`Policy: ${run.report.evaluation.passed ? 'passed' : 'blocked'} | fail-on=${run.report.evaluation.failOn.join(',') || 'none'}`);
    }
    let exitCode = getExitCode(run.report);
    let comparison: ReturnType<typeof compareReports> | undefined;
    let comparisonError: unknown;
    if (baseline !== undefined && exitCode !== 2) {
      try {
        comparison = compareReports(baseline, run.report);
        const path = await writeJsonOutput(join(run.outputDir, 'comparison.json'), comparison);
        console.log(`Comparison: ${path}`);
        exitCode = comparison.summary.added > 0 || comparison.summary.worsened > 0 ? 1 : 0;
        console.log(`Baseline: ${exitCode === 1 ? 'regressions' : 'no regressions'}`);
      } catch (error) {
        comparisonError = error;
        exitCode = 2;
      }
    }
    if (runtime.html) {
      const htmlPath = await writeHtmlReport(run.report, {
        baseDir: run.outputDir, outputPath: join(run.outputDir, 'report.html'),
        ...(comparison ? { comparison } : {}),
      });
      console.log(`HTML report: ${htmlPath}`);
    }
    if (comparisonError) console.error(`Comparison failed: ${comparisonError instanceof Error ? comparisonError.message : String(comparisonError)}`);
    process.exitCode = exitCode;
  });

program.command('report')
  .description('Turn an existing JSON audit into an offline HTML report')
  .argument('<report.json>', 'Audit report to render')
  .option('-o, --output <file>', 'HTML output (default: <report-name>.html beside input)')
  .option('--force', 'Replace an existing HTML output file')
  .action(async (input: string, flags: { output?: string; force?: boolean }) => {
    const inputPath = resolve(input);
    const report = await readReportFile(inputPath);
    const outputPath = resolve(flags.output ?? join(dirname(inputPath), `${basename(inputPath, extname(inputPath))}.html`));
    await assertOutputIsNotInput(outputPath, [inputPath]);
    const path = await writeHtmlReport(report, { baseDir: dirname(inputPath), outputPath, overwrite: flags.force ?? false });
    console.log(`HTML report: ${path}`);
    process.exitCode = 0;
  });

program.command('compare')
  .description('Compare two compatible audit reports without launching a browser')
  .argument('<baseline.json>', 'Baseline audit')
  .argument('<current.json>', 'Current audit')
  .option('-o, --output <file>', 'Optionally save comparison JSON')
  .option('--force', 'Replace an existing comparison output file')
  .action(async (baselinePath: string, currentPath: string, flags: { output?: string; force?: boolean }) => {
    if (flags.output !== undefined && flags.output.trim().length === 0) throw new Error('Output path must not be empty');
    const baseline = await readReportFile(resolve(baselinePath));
    const current = await readReportFile(resolve(currentPath));
    const comparison = compareReports(baseline, current);
    console.log(`Changes: added=${comparison.summary.added} resolved=${comparison.summary.resolved} worsened=${comparison.summary.worsened} improved=${comparison.summary.improved} unchanged=${comparison.summary.unchanged}`);
    if (flags.output !== undefined) {
      await assertOutputIsNotInput(flags.output, [baselinePath, currentPath]);
      console.log(`Comparison: ${await writeJsonOutput(flags.output, comparison, flags.force ?? false)}`);
    }
    process.exitCode = comparison.summary.added > 0 || comparison.summary.worsened > 0 ? 1 : 0;
  });

try {
  await program.parseAsync(process.argv);
} catch (error) {
  if (error instanceof CommanderError) process.exitCode = error.exitCode === 0 ? 0 : 2;
  else if (error instanceof ZodError) {
    console.error(`Invalid input: ${error.issues.map((issue) => `${issue.path.join('.') || 'input'}: ${issue.message}`).join('; ')}`);
    process.exitCode = 2;
  } else {
    console.error(`Operation failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
  }
}
