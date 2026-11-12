import { z } from 'zod';
import { failOnSchema, selectorSchema, widthsSchema } from './config.js';
import { evaluationSchema, evaluateReport } from './policy.js';

const nonnegative = z.number().finite().nonnegative();
const viewportSchema = z.object({ width: z.number().int().positive(), height: z.number().int().positive() });

export const overflowSchema = z.object({
  viewportWidth: nonnegative,
  documentWidth: nonnegative,
  bodyWidth: nonnegative,
  overflowPx: nonnegative,
  hasOverflow: z.boolean(),
  elements: z.array(z.object({
    selector: z.string(),
    tag: z.string(),
    left: z.number().finite(),
    right: z.number().finite(),
    width: nonnegative,
  })),
});

export const viewportResultSchema = z.object({
  viewport: viewportSchema,
  status: z.enum(['passed', 'failed', 'error']),
  finalUrl: z.string(),
  screenshot: z.string().nullable(),
  overflow: overflowSchema.nullable(),
  consoleErrors: z.array(z.object({
    text: z.string(),
    location: z.object({ url: z.string(), lineNumber: z.number(), columnNumber: z.number() }),
  })),
  pageErrors: z.array(z.object({ name: z.string(), message: z.string(), stack: z.string().optional() })),
  failedRequests: z.array(z.object({
    url: z.string(), method: z.string(), resourceType: z.string(), errorText: z.string(),
  })),
  errors: z.array(z.string()),
});

export const reportSchema = z.object({
  schemaVersion: z.literal('1.0.0'),
  targetUrl: z.string().url(),
  startedAt: z.string().datetime(),
  durationMs: nonnegative,
  options: z.object({
    timeoutMs: z.number().int().positive(),
    waitMs: z.number().int().nonnegative(),
    waitForSelector: selectorSchema.optional(),
    widths: widthsSchema.optional(),
    failOn: failOnSchema.optional(),
  }),
  summary: z.object({ total: nonnegative, passed: nonnegative, failed: nonnegative, errors: nonnegative }),
  results: z.array(viewportResultSchema),
  errors: z.array(z.string()).optional(),
  evaluation: evaluationSchema.optional(),
});

export type OverflowResult = z.infer<typeof overflowSchema>;
export type ViewportResult = z.infer<typeof viewportResultSchema>;
export type AuditReport = z.infer<typeof reportSchema>;

export function getExitCode(report: AuditReport): 0 | 1 | 2 {
  if (report.summary.errors > 0 || report.errors?.length || report.results.some((result) => result.status === 'error' || result.errors.length > 0)) return 2;
  if (report.options.failOn !== undefined) return evaluateReport(report).passed ? 0 : 1;
  return report.summary.failed > 0 ? 1 : 0;
}
