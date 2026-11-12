import { z } from 'zod';
import { DEFAULT_FAIL_ON, failOnSchema, failureKindSchema, urlSchema, type FailureKind } from './config.js';
import type { AuditReport, ViewportResult } from './report.js';

const viewportSchema = z.object({ width: z.number().int().positive(), height: z.number().int().positive() });
const countSchema = z.number().int().nonnegative();

export const findingSchema = z.object({
  viewport: viewportSchema,
  kind: failureKindSchema,
  key: z.string(),
  message: z.string(),
  count: z.number().int().positive(),
});

export const overflowChangeSchema = z.object({
  viewport: viewportSchema,
  kind: z.literal('overflow'),
  beforePx: z.number().finite().nonnegative(),
  afterPx: z.number().finite().nonnegative(),
});

export const comparisonSchema = z.object({
  schemaVersion: z.literal('1.0.0'),
  targetUrl: z.string().url(),
  summary: z.object({
    added: countSchema,
    resolved: countSchema,
    worsened: countSchema,
    improved: countSchema,
    unchanged: countSchema,
  }),
  added: z.array(findingSchema),
  resolved: z.array(findingSchema),
  worsened: z.array(overflowChangeSchema),
  improved: z.array(overflowChangeSchema),
});

export type Finding = z.infer<typeof findingSchema>;
export type OverflowChange = z.infer<typeof overflowChangeSchema>;
export type ComparisonResult = z.infer<typeof comparisonSchema>;

type CountedFinding = Omit<Finding, 'viewport'>;

function viewportKey(viewport: ViewportResult['viewport']): string {
  return `${viewport.width}x${viewport.height}`;
}

function normalizedPolicy(report: AuditReport): FailureKind[] {
  const selected = failOnSchema.parse(report.options.failOn ?? DEFAULT_FAIL_ON);
  return DEFAULT_FAIL_ON.filter((kind) => selected.includes(kind));
}

/** Validate the semantic invariants needed for a meaningful comparison. File
 * callers additionally parse both inputs with reportSchema before calling. */
function validateReport(report: AuditReport, label: string): Map<string, ViewportResult> {
  if (report.schemaVersion !== '1.0.0') throw new Error(`${label}: unsupported report schema version`);
  if (report.results.length === 0) throw new Error(`${label}: report must contain at least one viewport`);
  if (report.results.length > 8) throw new Error(`${label}: report exceeds the eight-viewport limit`);
  if ((report.errors?.length ?? 0) > 0 || report.summary.errors > 0) {
    throw new Error(`${label}: reports with operational errors cannot be compared`);
  }

  const byViewport = new Map<string, ViewportResult>();
  for (const result of report.results) {
    const { width, height } = result.viewport;
    if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
      throw new Error(`${label}: invalid viewport dimensions`);
    }
    const key = viewportKey(result.viewport);
    if (byViewport.has(key)) throw new Error(`${label}: duplicate viewport ${key}`);
    if (result.status === 'error' || result.errors.length > 0) {
      throw new Error(`${label}: viewport ${key} has operational errors`);
    }
    if (result.overflow === null) throw new Error(`${label}: viewport ${key} has no overflow measurement`);
    const { overflowPx, hasOverflow, documentWidth, viewportWidth } = result.overflow;
    if (!Number.isFinite(overflowPx) || overflowPx < 0
      || hasOverflow !== (overflowPx > 1)
      || overflowPx !== Math.max(0, documentWidth - viewportWidth)) {
      throw new Error(`${label}: viewport ${key} has an inconsistent overflow measurement`);
    }
    const hasFindings = hasOverflow || result.consoleErrors.length > 0
      || result.pageErrors.length > 0 || result.failedRequests.length > 0;
    const expectedStatus = hasFindings ? 'failed' : 'passed';
    if (result.status !== expectedStatus) {
      throw new Error(`${label}: viewport ${key} has an inconsistent status`);
    }
    byViewport.set(key, result);
  }
  const expectedSummary = {
    total: report.results.length,
    passed: report.results.filter((result) => result.status === 'passed').length,
    failed: report.results.filter((result) => result.status === 'failed').length,
    errors: 0,
  };
  for (const field of ['total', 'passed', 'failed', 'errors'] as const) {
    if (report.summary[field] !== expectedSummary[field]) {
      throw new Error(`${label}: report has inconsistent status counts`);
    }
  }
  return byViewport;
}

function collectFindings(result: ViewportResult, selected: FailureKind[]): Map<string, CountedFinding> {
  const findings = new Map<string, CountedFinding>();
  const add = (kind: FailureKind, parts: string[], message: string): void => {
    const key = JSON.stringify([kind, ...parts]);
    const previous = findings.get(key);
    if (previous) previous.count += 1;
    else findings.set(key, { kind, key, message, count: 1 });
  };
  if (selected.includes('console')) {
    for (const error of result.consoleErrors) add('console', [error.text, error.location.url], error.text);
  }
  if (selected.includes('pageerror')) {
    for (const error of result.pageErrors) add('pageerror', [error.name, error.message], `${error.name}: ${error.message}`);
  }
  if (selected.includes('request')) {
    for (const request of result.failedRequests) {
      add('request', [request.method, request.url, request.resourceType, request.errorText],
        `${request.method} ${request.url} (${request.resourceType}): ${request.errorText}`);
    }
  }
  return findings;
}

/** Compare selected finding signals, never DOM snapshot selectors or images. */
export function compareReports(baseline: AuditReport, current: AuditReport): ComparisonResult {
  const baselineViewports = validateReport(baseline, 'Baseline');
  const currentViewports = validateReport(current, 'Current');
  const baselineUrl = urlSchema.safeParse(baseline.targetUrl);
  const currentUrl = urlSchema.safeParse(current.targetUrl);
  if (!baselineUrl.success || !currentUrl.success) throw new Error('Comparison requires supported HTTP/HTTPS target URLs');
  if (baselineUrl.data !== currentUrl.data) throw new Error('Reports have different target URLs');
  const policy = normalizedPolicy(current);
  if (JSON.stringify(normalizedPolicy(baseline)) !== JSON.stringify(policy)) {
    throw new Error('Reports have different failure policies');
  }
  if (baselineViewports.size !== currentViewports.size
    || Array.from(currentViewports.keys()).some((key) => !baselineViewports.has(key))) {
    throw new Error('Reports have different viewport sets');
  }

  const added: Finding[] = [];
  const resolved: Finding[] = [];
  const worsened: OverflowChange[] = [];
  const improved: OverflowChange[] = [];
  let unchanged = 0;
  // Canonical ordering makes the result independent of report viewport order.
  const ordered = Array.from(currentViewports.values()).sort((left, right) => left.viewport.width - right.viewport.width
    || left.viewport.height - right.viewport.height);
  for (const after of ordered) {
    const before = baselineViewports.get(viewportKey(after.viewport))!;
    const viewport = { ...after.viewport };
    const beforeFindings = collectFindings(before, policy);
    const afterFindings = collectFindings(after, policy);
    const keys = Array.from(new Set([...beforeFindings.keys(), ...afterFindings.keys()])).sort();
    for (const key of keys) {
      const previous = beforeFindings.get(key);
      const next = afterFindings.get(key);
      const beforeCount = previous?.count ?? 0;
      const afterCount = next?.count ?? 0;
      unchanged += Math.min(beforeCount, afterCount);
      if (afterCount > beforeCount) added.push({ viewport, ...next!, count: afterCount - beforeCount });
      if (beforeCount > afterCount) resolved.push({ viewport, ...previous!, count: beforeCount - afterCount });
    }

    if (policy.includes('overflow')) {
      const previous = before.overflow!;
      const next = after.overflow!;
      if (!previous.hasOverflow && next.hasOverflow) {
        added.push({ viewport, kind: 'overflow', key: 'overflow', message: `Horizontal overflow: ${next.overflowPx} CSS px`, count: 1 });
      } else if (previous.hasOverflow && !next.hasOverflow) {
        resolved.push({ viewport, kind: 'overflow', key: 'overflow', message: `Horizontal overflow: ${previous.overflowPx} CSS px`, count: 1 });
      } else if (previous.hasOverflow && next.hasOverflow) {
        const change: OverflowChange = { viewport, kind: 'overflow', beforePx: previous.overflowPx, afterPx: next.overflowPx };
        if (next.overflowPx > previous.overflowPx) worsened.push(change);
        else if (next.overflowPx < previous.overflowPx) improved.push(change);
        else unchanged += 1;
      }
    }
  }

  return comparisonSchema.parse({
    schemaVersion: '1.0.0',
    targetUrl: currentUrl.data,
    summary: {
      added: added.reduce((total, finding) => total + finding.count, 0),
      resolved: resolved.reduce((total, finding) => total + finding.count, 0),
      worsened: worsened.length,
      improved: improved.length,
      unchanged,
    },
    added, resolved, worsened, improved,
  });
}
