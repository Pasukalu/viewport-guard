import { z } from 'zod';
import { DEFAULT_FAIL_ON, failOnSchema, type FailureKind } from './config.js';
import type { AuditReport } from './report.js';

export const evaluationSchema = z.object({
  failOn: failOnSchema,
  passed: z.boolean(),
  blockingViewports: z.array(z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    categories: failOnSchema,
  })),
});

export type ReportEvaluation = z.infer<typeof evaluationSchema>;

/** Evaluate policy without rewriting the report's observed findings or counts. */
export function evaluateReport(report: AuditReport): ReportEvaluation {
  const failOn = failOnSchema.parse(report.options.failOn ?? DEFAULT_FAIL_ON);
  const blockingViewports: ReportEvaluation['blockingViewports'] = [];
  for (const result of report.results) {
    const observed: Record<FailureKind, boolean> = {
      overflow: result.overflow?.hasOverflow ?? false,
      console: result.consoleErrors.length > 0,
      pageerror: result.pageErrors.length > 0,
      request: result.failedRequests.length > 0,
    };
    const categories = failOn.filter((kind) => observed[kind]);
    if (categories.length > 0) {
      blockingViewports.push({ ...result.viewport, categories });
    }
  }
  const operationalFailure = report.summary.errors > 0
    || (report.errors?.length ?? 0) > 0
    || report.results.some((result) => result.status === 'error' || result.errors.length > 0);
  return {
    failOn,
    passed: !operationalFailure && blockingViewports.length === 0,
    blockingViewports,
  };
}
