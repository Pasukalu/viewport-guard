import { describe, expect, it } from 'vitest';
import { compareReports, comparisonSchema } from '../src/compare.js';
import { DEFAULT_FAIL_ON, type FailureKind } from '../src/config.js';
import type { AuditReport, ViewportResult } from '../src/report.js';

function viewport(width = 390, details: Partial<ViewportResult> = {}): ViewportResult {
  const result: ViewportResult = {
    viewport: { width, height: 900 }, status: 'passed', finalUrl: 'https://example.test/page',
    screenshot: `screenshots/${width}.png`,
    overflow: { viewportWidth: width, documentWidth: width, bodyWidth: width, overflowPx: 0, hasOverflow: false, elements: [] },
    consoleErrors: [], pageErrors: [], failedRequests: [], errors: [], ...details,
  };
  result.status = result.errors.length > 0 ? 'error'
    : result.overflow?.hasOverflow || result.consoleErrors.length || result.pageErrors.length || result.failedRequests.length
      ? 'failed' : 'passed';
  return result;
}

function report(results: ViewportResult[] = [viewport()], failOn?: FailureKind[]): AuditReport {
  return {
    schemaVersion: '1.0.0', targetUrl: 'https://example.test/page', startedAt: '2026-11-12T00:00:00.000Z', durationMs: 1,
    options: { timeoutMs: 15000, waitMs: 0, ...(failOn !== undefined ? { failOn } : {}) },
    summary: {
      total: results.length,
      passed: results.filter((result) => result.status === 'passed').length,
      failed: results.filter((result) => result.status === 'failed').length,
      errors: results.filter((result) => result.status === 'error').length,
    }, results,
  };
}

function withOverflow(px: number, width = 390): ViewportResult {
  return viewport(width, { overflow: {
    viewportWidth: width, documentWidth: width + px, bodyWidth: width + px,
    overflowPx: px, hasOverflow: px > 1, elements: [],
  } });
}

function consoleError(text: string, url = 'https://example.test/app.js'): ViewportResult['consoleErrors'][number] {
  return { text, location: { url, lineNumber: 10, columnNumber: 20 } };
}

const request = { url: 'https://example.test/api?key=1', method: 'GET', resourceType: 'fetch', errorText: 'net::ERR_FAILED' };
const noChanges = { added: 0, resolved: 0, worsened: 0, improved: 0, unchanged: 0 };

describe('report comparison', () => {
  it('compares clean legacy reports without introducing signals', () => {
    const result = compareReports(report(), report());
    expect(result).toEqual({ schemaVersion: '1.0.0', targetUrl: 'https://example.test/page', summary: noChanges, added: [], resolved: [], worsened: [], improved: [] });
    expect(comparisonSchema.parse(result)).toEqual(result);
  });

  it('respects duplicate finding multiplicity rather than comparing counts alone', () => {
    const baseline = report([viewport(390, { consoleErrors: [
      ...Array.from({ length: 3 }, () => consoleError('retained')),
      ...Array.from({ length: 4 }, () => consoleError('removed')),
    ] })]);
    const current = report([viewport(390, { consoleErrors: [
      ...Array.from({ length: 6 }, () => consoleError('retained')),
      ...Array.from({ length: 2 }, () => consoleError('new')),
    ] })]);
    const result = compareReports(baseline, current);
    expect(result.summary).toEqual({ ...noChanges, added: 5, resolved: 4, unchanged: 3 });
    expect(result.added.map((finding) => [finding.message, finding.count]).sort()).toEqual([['new', 2], ['retained', 3]]);
    expect(result.resolved).toEqual([expect.objectContaining({ kind: 'console', message: 'removed', count: 4 })]);
  });

  it('matches each signal to its viewport instead of moving it between widths', () => {
    const result = compareReports(
      report([viewport(390, { consoleErrors: [consoleError('failure')] }), viewport(768)]),
      report([viewport(390), viewport(768, { consoleErrors: [consoleError('failure')] })]),
    );
    expect(result.summary).toEqual({ ...noChanges, added: 1, resolved: 1 });
    expect(result.added[0]?.viewport.width).toBe(768);
    expect(result.resolved[0]?.viewport.width).toBe(390);
  });

  it('ignores viewport and policy ordering and normalizes equivalent target URLs', () => {
    const baseline = report([withOverflow(20, 768), withOverflow(30, 390)], [...DEFAULT_FAIL_ON].reverse());
    baseline.targetUrl = 'https://EXAMPLE.test:443/page';
    const current = report([withOverflow(30, 390), withOverflow(20, 768)]);
    expect(compareReports(baseline, current).summary).toEqual({ ...noChanges, unchanged: 2 });
  });

  it('ignores snapshot selectors, stacks, line numbers, image paths, final routes, and timings', () => {
    const baseline = report([{
      ...withOverflow(30),
      consoleErrors: [consoleError('failure')],
      pageErrors: [{ name: 'TypeError', message: 'broken', stack: 'old.js:1' }],
      failedRequests: [{ ...request }],
    }]);
    const current = structuredClone(baseline);
    current.startedAt = '2026-11-13T00:00:00.000Z';
    current.durationMs = 99;
    const result = current.results[0]!;
    result.screenshot = 'screenshots/new.png';
    result.finalUrl = 'https://example.test/redirected';
    result.consoleErrors[0]!.location.lineNumber = 100;
    result.consoleErrors[0]!.location.columnNumber = 200;
    result.pageErrors[0]!.stack = 'new.js:900';
    result.overflow!.elements = [{ selector: ':root > body > div:nth-child(3)', tag: 'div', left: 0, right: 420, width: 420 }];
    expect(compareReports(baseline, current).summary).toEqual({ ...noChanges, unchanged: 4 });
  });

  it('treats a changed console source URL as a different exact signal', () => {
    const result = compareReports(
      report([viewport(390, { consoleErrors: [consoleError('same text', 'https://example.test/old.js')] })]),
      report([viewport(390, { consoleErrors: [consoleError('same text', 'https://example.test/new.js')] })]),
    );
    expect(result.summary).toEqual({ ...noChanges, added: 1, resolved: 1 });
  });

  it('treats a changed page error name as a different signal even when its message is unchanged', () => {
    const result = compareReports(
      report([viewport(390, { pageErrors: [{ name: 'Error', message: 'failure' }] })]),
      report([viewport(390, { pageErrors: [{ name: 'TypeError', message: 'failure' }] })]),
    );
    expect(result.summary).toEqual({ ...noChanges, added: 1, resolved: 1 });
  });

  it.each([
    { field: 'method', value: 'POST' },
    { field: 'url', value: 'https://example.test/api?key=2' },
    { field: 'resourceType', value: 'xhr' },
    { field: 'errorText', value: 'net::ERR_CONNECTION_REFUSED' },
  ] as const)('includes request $field in its exact fingerprint', ({ field, value }) => {
    const result = compareReports(
      report([viewport(390, { failedRequests: [{ ...request }] })]),
      report([viewport(390, { failedRequests: [{ ...request, [field]: value }] })]),
    );
    expect(result.summary).toEqual({ ...noChanges, added: 1, resolved: 1 });
  });

  it.each([
    { before: 0, after: 30, summary: { ...noChanges, added: 1 } },
    { before: 30, after: 0, summary: { ...noChanges, resolved: 1 } },
    { before: 30, after: 60, summary: { ...noChanges, worsened: 1 } },
    { before: 60, after: 30, summary: { ...noChanges, improved: 1 } },
    { before: 30, after: 30, summary: { ...noChanges, unchanged: 1 } },
    { before: 0, after: 1, summary: noChanges },
    { before: 1, after: 2, summary: { ...noChanges, added: 1 } },
  ])('classifies overflow changing from $before to $after CSS px', ({ before, after, summary }) => {
    const result = compareReports(report([withOverflow(before)]), report([withOverflow(after)]));
    expect(result.summary).toEqual(summary);
    if (summary.worsened > 0) expect(result.worsened).toEqual([{ viewport: { width: 390, height: 900 }, kind: 'overflow', beforePx: before, afterPx: after }]);
    if (summary.improved > 0) expect(result.improved).toEqual([{ viewport: { width: 390, height: 900 }, kind: 'overflow', beforePx: before, afterPx: after }]);
  });

  it('filters comparison signals to the shared selected policy', () => {
    const baseline = report([withOverflow(30)], ['console']);
    const current = report([{ ...withOverflow(60), failedRequests: [{ ...request }] }], ['console']);
    expect(compareReports(baseline, current).summary).toEqual(noChanges);
    expect(current.results[0]?.failedRequests).toHaveLength(1);
  });

  it('supports matching empty policies without suppressing raw findings', () => {
    const current = report([withOverflow(30)], []);
    expect(compareReports(report([viewport()], []), current).summary).toEqual(noChanges);
    expect(current.summary.failed).toBe(1);
  });

  it('does not mutate either source report', () => {
    const baseline = report([withOverflow(20)]);
    const current = report([withOverflow(30)]);
    const copies = structuredClone([baseline, current]);
    compareReports(baseline, current);
    expect([baseline, current]).toEqual(copies);
  });
});

describe('comparison compatibility and completeness', () => {
  it('rejects different target URLs', () => {
    const current = report();
    current.targetUrl = 'https://example.test/another-page';
    expect(() => compareReports(report(), current)).toThrow(/different target URLs/);
  });

  it('rejects unsupported target protocols', () => {
    const current = report();
    current.targetUrl = 'ftp://example.test/page';
    expect(() => compareReports(report(), current)).toThrow(/supported HTTP\/HTTPS/);
  });

  it('rejects an unsupported schema version', () => {
    const current = { ...report(), schemaVersion: '2.0.0' } as unknown as AuditReport;
    expect(() => compareReports(report(), current)).toThrow(/unsupported report schema/);
  });

  it.each([
    { name: 'different widths', results: [viewport(768)] },
    { name: 'missing width', results: [viewport(390), viewport(768)] },
    { name: 'different heights', results: [viewport(390, { viewport: { width: 390, height: 800 } })] },
  ])('rejects $name instead of comparing an intersection', ({ results }) => {
    expect(() => compareReports(report(), report(results))).toThrow(/different viewport sets/);
  });

  it('rejects duplicate viewport identities', () => {
    expect(() => compareReports(report(), report([viewport(), viewport()]))).toThrow(/duplicate viewport/);
  });

  it('rejects empty reports', () => {
    expect(() => compareReports(report([]), report())).toThrow(/at least one viewport/);
  });

  it('rejects inputs exceeding the supported eight-viewport limit', () => {
    const oversized = report(Array.from({ length: 9 }, (_, index) => viewport(320 + index)));
    expect(() => compareReports(oversized, oversized)).toThrow(/eight-viewport limit/);
  });

  it('rejects different normalized failure policies', () => {
    expect(() => compareReports(report(), report([viewport()], []))).toThrow(/different failure policies/);
  });

  it('rejects null measurements even when overflow is ignored', () => {
    expect(() => compareReports(report([viewport()], []), report([viewport(390, { overflow: null })], []))).toThrow(/no overflow measurement/);
  });

  it('rejects viewport operational failures', () => {
    expect(() => compareReports(report(), report([viewport(390, { overflow: null, errors: ['Navigation failed'] })]))).toThrow(/operational errors/);
  });

  it('rejects global operational failures independently of viewport counts', () => {
    const current = report();
    current.errors = ['Browser cleanup failed'];
    expect(() => compareReports(report(), current)).toThrow(/operational errors/);
  });

  it.each(['total', 'passed', 'failed'] as const)('rejects an inconsistent %s count', (field) => {
    const current = report();
    current.summary[field] += 1;
    expect(() => compareReports(report(), current)).toThrow(/inconsistent status counts/);
  });

  it('rejects a passed viewport containing raw findings', () => {
    const current = report([withOverflow(30)]);
    current.results[0]!.status = 'passed';
    current.summary = { total: 1, passed: 1, failed: 0, errors: 0 };
    expect(() => compareReports(report(), current)).toThrow(/inconsistent status/);
  });

  it('rejects a failed viewport with no observed findings', () => {
    const current = report();
    current.results[0]!.status = 'failed';
    current.summary = { total: 1, passed: 0, failed: 1, errors: 0 };
    expect(() => compareReports(report(), current)).toThrow(/inconsistent status/);
  });

  it('rejects inconsistent overflow presence or pixel metrics', () => {
    const current = report([withOverflow(30)]);
    current.results[0]!.overflow!.hasOverflow = false;
    expect(() => compareReports(report(), current)).toThrow(/inconsistent overflow measurement/);
    current.results[0]!.overflow!.hasOverflow = true;
    current.results[0]!.overflow!.overflowPx = 40;
    expect(() => compareReports(report(), current)).toThrow(/inconsistent overflow measurement/);
  });
});
