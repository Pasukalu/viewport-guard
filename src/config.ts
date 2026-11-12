import { z } from 'zod';

export const VIEWPORT_HEIGHT = 900;

export const VIEWPORTS = [360, 390, 768, 1440].map((width) => ({
  width,
  height: VIEWPORT_HEIGHT,
}));

export const urlSchema = z.string().trim().url().superRefine((value, ctx) => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    // The URL format validator already supplies the validation issue.
    return;
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    ctx.addIssue({ code: 'custom', message: 'URL must use http:// or https://' });
  }
  if (url.username || url.password) {
    ctx.addIssue({ code: 'custom', message: 'URL credentials are not supported' });
  }
}).transform((value) => new URL(value).href);

export const selectorSchema = z.string().trim().min(1).max(2000);

export const widthsSchema = z.array(z.number().int().min(240).max(3840))
  .min(1).max(8)
  .refine((widths) => new Set(widths).size === widths.length, {
    message: 'Viewport widths must be unique',
  });

export const failureKindSchema = z.enum(['overflow', 'console', 'pageerror', 'request']);
export type FailureKind = z.infer<typeof failureKindSchema>;
export const DEFAULT_FAIL_ON: FailureKind[] = ['overflow', 'console', 'pageerror', 'request'];
export const failOnSchema = z.array(failureKindSchema).max(4)
  .refine((values) => new Set(values).size === values.length, { message: 'Failure categories must be unique' });

// No defaults here: file values must not acquire implicit CLI overrides.
export const auditInputSchema = z.object({
  outputDir: z.string().trim().min(1),
  timeoutMs: z.number().int().min(1).max(120_000),
  waitMs: z.number().int().min(0).max(30_000),
  waitForSelector: selectorSchema.optional(),
  widths: widthsSchema.optional(),
  failOn: failOnSchema.optional(),
}).strict();

export const optionsSchema = auditInputSchema.extend({
  outputDir: auditInputSchema.shape.outputDir.default('viewport-guard-reports'),
  timeoutMs: auditInputSchema.shape.timeoutMs.default(15_000),
  waitMs: auditInputSchema.shape.waitMs.default(500),
});

export type AuditOptions = z.infer<typeof optionsSchema>;

export function parseMilliseconds(value: string): number {
  // Reject partial numbers, scientific notation, and empty strings from CLI input.
  return /^\d+$/.test(value) ? Number(value) : Number.NaN;
}

export function parseWidths(value: string): number[] {
  // Keep invalid tokens invalid; Number('') or parseInt('320px') would silently
  // accept inputs that do not express a decimal integer viewport width.
  return value.split(',').map((part) => {
    const token = part.trim();
    return /^\d+$/.test(token) ? Number(token) : Number.NaN;
  });
}

export function parseFailOn(value: string): string[] {
  const parts = value.split(',').map((part) => part.trim());
  if (parts.length === 1 && parts[0] === 'all') return [...DEFAULT_FAIL_ON];
  if (parts.length === 1 && parts[0] === 'none') return [];
  return parts;
}
