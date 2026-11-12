import { describe, expect, it } from 'vitest';
import { DEFAULT_FAIL_ON, type FailureKind } from '../src/config.js';
import { evaluateReport, evaluationSchema } from '../src/policy.js';
import { getExitCode, type AuditReport, type ViewportResult } from '../src/report.js';

function makeReport(details: Partial<ViewportResult> = {}, failOn?: FailureKind[]): AuditReport {
  const result: ViewportResult = {
    viewport: { width: 390, height: 900 }, status: 'passed', finalUrl: 'https://example.test/',
    screenshot: 'screenshots/390.png',
    overflow: { viewportWidth: 390, documentWidth: 390, bodyWidth: 390, overflowPx: 0, hasOverflow: false, elements: [] },
    consoleErrors: [], pageErrors: [], failedRequests: [], errors: [], ...details,
  };
  result.status = result.errors.length > 0 ? 'error'
    : result.overflow?.hasOverflow || result.consoleErrors.length || result.pageErrors.length || result.failedRequests.length
      ? 'failed' : 'passed';
  return {
    schemaVersion: '1.0.0', targetUrl: 'https://example.test/', startedAt: '2026-11-12T00:00:00.000Z', durationMs: 1,
    options: { timeoutMs: 15000, waitMs: 0, ...(failOn !== undefined ? { failOn } : {}) },
    summary: { total: 1, passed: Number(result.status === 'passed'), failed: Number(result.status === 'failed'), errors: Number(result.status === 'error') },
    results: [result],
  };
}

const evidence: Record<FailureKind, Partial<ViewportResult>> = {
  overflow: { overflow: { viewportWidth: 390, documentWidth: 490, bodyWidth: 490, overflowPx: 100, hasOverflow: true, elements: [] } },
  console: { consoleErrors: [{ text: 'console failure', location: { url: 'https://example.test/app.js', lineNumber: 1, columnNumber: 2 } }] },
  pageerror: { pageErrors: [{ name: 'Error', message: 'page failure', stack: 'volatile stack' }] },
  request: { failedRequests: [{ url: 'https://example.test/api', method: 'GET', resourceType: 'fetch', errorText: 'net::ERR_FAILED' }] },
};

describe('failure policy evaluation', () => {
  it('passes a clean legacy report with the default policy', () => {
    const report = makeReport();
    expect(evaluateReport(report)).toEqual({ failOn: DEFAULT_FAIL_ON, passed: true, blockingViewports: [] });
    expect(getExitCode(report)).toBe(0);
  });

  it.each(['overflow', 'console', 'pageerror', 'request'] as const)('blocks observed %s findings when selected', (kind) => {
    const report = makeReport(evidence[kind], [kind]);
    const evaluation = evaluateReport(report);
    expect(evaluation).toEqual({ failOn: [kind], passed: false, blockingViewports: [{ width: 390, height: 900, categories: [kind] }] });
    expect(evaluationSchema.parse(evaluation)).toEqual(evaluation);
    expect(getExitCode(report)).toBe(1);
  });

  it.each(['overflow', 'console', 'pageerror', 'request'] as const)('retains raw %s findings when policy ignores them', (kind) => {
    const report = makeReport(evidence[kind], []);
    const original = structuredClone(report);
    expect(evaluateReport(report)).toEqual({ failOn: [], passed: true, blockingViewports: [] });
    expect(report).toEqual(original);
    expect(report.summary.failed).toBe(1);
    expect(report.results[0]?.status).toBe('failed');
    expect(getExitCode(report)).toBe(0);
  });

  it('selects only blocking categories while keeping every observed category', () => {
    const report = makeReport({ ...evidence.overflow, ...evidence.console, ...evidence.pageerror, ...evidence.request }, ['request', 'overflow']);
    expect(evaluateReport(report).blockingViewports).toEqual([{ width: 390, height: 900, categories: ['request', 'overflow'] }]);
    expect(report.results[0]?.consoleErrors).toHaveLength(1);
    expect(report.results[0]?.pageErrors).toHaveLength(1);
  });

  it('preserves legacy all-findings exit behavior when no policy is recorded', () => {
    const report = makeReport(evidence.console);
    expect(report.options).not.toHaveProperty('failOn');
    expect(evaluateReport(report).failOn).toEqual(DEFAULT_FAIL_ON);
    expect(getExitCode(report)).toBe(1);
  });

  it('does not let an empty policy ignore a viewport operational failure', () => {
    const report = makeReport({ overflow: null, errors: ['Overflow measurement failed: timeout'] }, []);
    expect(evaluateReport(report).passed).toBe(false);
    expect(evaluateReport(report).blockingViewports).toEqual([]);
    expect(getExitCode(report)).toBe(2);
  });

  it('does not let an empty policy ignore a global cleanup failure', () => {
    const report = makeReport({}, []);
    report.errors = ['Browser cleanup failed'];
    expect(report.summary.errors).toBe(0);
    expect(evaluateReport(report).passed).toBe(false);
    expect(getExitCode(report)).toBe(2);
  });

  it('evaluates facts instead of trusting a stale stored evaluation', () => {
    const report = makeReport(evidence.console, ['console']);
    report.evaluation = { failOn: ['console'], passed: true, blockingViewports: [] };
    expect(evaluateReport(report).passed).toBe(false);
    expect(getExitCode(report)).toBe(1);
  });

  it('rejects duplicate policy categories in serialized evaluations', () => {
    expect(evaluationSchema.safeParse({ failOn: ['console', 'console'], passed: true, blockingViewports: [] }).success).toBe(false);
  });
});
