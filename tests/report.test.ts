import { describe, expect, it } from 'vitest';
import { getExitCode, reportSchema } from '../src/report.js';

describe('report readiness compatibility', () => {
  const baseReport = {
    schemaVersion: '1.0.0',
    targetUrl: 'http://localhost:4173/',
    startedAt: '2026-11-12T00:00:00.000Z',
    durationMs: 1,
    options: { timeoutMs: 15000, waitMs: 500 },
    summary: { total: 0, passed: 0, failed: 0, errors: 0 },
    results: [],
  };

  it('continues to accept Phase 1 reports without a readiness selector', () => {
    expect(reportSchema.parse(baseReport)).toEqual(baseReport);
    expect(reportSchema.parse(baseReport).options).not.toHaveProperty('waitForSelector');
  });

  it('retains the optional selector when present', () => {
    const report = reportSchema.parse({
      ...baseReport,
      options: { ...baseReport.options, waitForSelector: '#app-ready' },
    });
    expect(report.options.waitForSelector).toBe('#app-ready');
    expect(report.schemaVersion).toBe('1.0.0');
  });

  it('records explicit custom widths without adding them to old reports', () => {
    const report = reportSchema.parse({
      ...baseReport,
      options: { ...baseReport.options, widths: [1920, 320, 1024] },
    });
    expect(report.options).toHaveProperty('widths', [1920, 320, 1024]);
    expect(reportSchema.parse(baseReport).options).not.toHaveProperty('widths');
  });

  it('retains the explicit default list when it was requested', () => {
    const report = reportSchema.parse({
      ...baseReport,
      options: { ...baseReport.options, widths: [360, 390, 768, 1440] },
    });
    expect(report.options.widths).toEqual([360, 390, 768, 1440]);
    expect(report.schemaVersion).toBe('1.0.0');
  });

  it('retains global operational errors and returns exit 2 without losing viewport counts', () => {
    const report = reportSchema.parse({ ...baseReport, errors: ['Browser cleanup failed'] });
    expect(report.summary.errors).toBe(0);
    expect(report.errors).toEqual(['Browser cleanup failed']);
    expect(getExitCode(report)).toBe(2);
    expect(reportSchema.parse(baseReport)).not.toHaveProperty('errors');
  });
});
