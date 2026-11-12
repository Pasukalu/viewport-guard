import { dirname, resolve } from 'node:path';
import { z } from 'zod';
import { auditInputSchema, optionsSchema, type AuditOptions } from './config.js';
import { readJsonFile } from './files.js';

export const runtimeOverridesSchema = auditInputSchema.partial().extend({
  html: z.boolean().optional(),
  baseline: z.union([z.string().trim().min(1), z.literal(false)]).optional(),
}).strict();

export interface RuntimeOptions {
  auditOptions: AuditOptions;
  html: boolean;
  baseline?: string;
}

export async function resolveRuntimeConfig(
  configFile: string | undefined,
  overrides: unknown = {},
  cwd = process.cwd(),
): Promise<RuntimeOptions> {
  let configured: z.infer<typeof runtimeOverridesSchema> = {};
  if (configFile !== undefined) {
    const path = resolve(cwd, configFile);
    configured = runtimeOverridesSchema.parse(await readJsonFile(path, 64 * 1024));
    if (configured.outputDir !== undefined) configured.outputDir = resolve(dirname(path), configured.outputDir);
    if (typeof configured.baseline === 'string') configured.baseline = resolve(dirname(path), configured.baseline);
  }
  const cli = runtimeOverridesSchema.parse(overrides);
  if (cli.outputDir !== undefined) cli.outputDir = resolve(cwd, cli.outputDir);
  if (typeof cli.baseline === 'string') cli.baseline = resolve(cwd, cli.baseline);
  const { html, baseline, ...auditOptions } = { ...configured, ...cli };
  const parsed = optionsSchema.parse(auditOptions);
  parsed.outputDir = resolve(cwd, parsed.outputDir);
  return { auditOptions: parsed, html: html ?? false, ...(typeof baseline === 'string' ? { baseline } : {}) };
}
