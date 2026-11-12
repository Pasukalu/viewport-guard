import { describe, expect, it } from 'vitest';
import { optionsSchema, parseMilliseconds, parseWidths, urlSchema, VIEWPORTS } from '../src/config.js';

describe('audit configuration', () => {
  it('uses the four required viewport widths', () => {
    expect(VIEWPORTS.map((viewport) => viewport.width)).toEqual([360, 390, 768, 1440]);
  });

  it.each(['file:///tmp/index.html', 'ftp://example.com', 'javascript:alert(1)', 'bad url', 'https://user:password@example.com'])('rejects unsupported URL %s', (url) => {
    expect(urlSchema.safeParse(url).success).toBe(false);
  });

  it('normalizes HTTP URLs', () => {
    expect(urlSchema.parse(' http://localhost:4173 ')).toBe('http://localhost:4173/');
  });

  it('applies defaults and validates time bounds', () => {
    expect(optionsSchema.parse({})).toEqual({ outputDir: 'viewport-guard-reports', timeoutMs: 15_000, waitMs: 500 });
    expect(optionsSchema.safeParse({ timeoutMs: 0 }).success).toBe(false);
    expect(optionsSchema.safeParse({ waitMs: 30_001 }).success).toBe(false);
    expect(optionsSchema.safeParse({ waitMs: 0 }).success).toBe(true);
    expect(optionsSchema.safeParse({ outputDir: ' ' }).success).toBe(false);
  });

  it('keeps readiness optional and trims a supplied selector', () => {
    expect(optionsSchema.parse({})).not.toHaveProperty('waitForSelector');
    expect(optionsSchema.parse({ waitForSelector: '  #app-ready  ' }).waitForSelector).toBe('#app-ready');
  });

  it.each([
    { widths: [240] },
    { widths: [3840] },
    { widths: [1920, 320, 1024] },
    { widths: [240, 320, 360, 390, 768, 1024, 1440, 3840] },
  ])('accepts the valid custom width list $widths', ({ widths }) => {
    expect(optionsSchema.safeParse({ widths }).success).toBe(true);
  });

  it.each([
    { name: 'empty list', widths: [] },
    { name: 'null', widths: null },
    { name: 'string list', widths: '320,390' },
    { name: 'string member', widths: [320, '390'] },
    { name: 'non-finite member', widths: [Number.POSITIVE_INFINITY] },
    { name: 'NaN member', widths: [Number.NaN] },
    { name: 'fraction', widths: [320.5] },
    { name: 'below minimum', widths: [239] },
    { name: 'above maximum', widths: [3841] },
    { name: 'duplicate', widths: [320, 320] },
    { name: 'too many', widths: Array.from({ length: 9 }, (_, index) => 240 + index) },
  ])('rejects $name as an API width list', ({ widths }) => {
    expect(optionsSchema.safeParse({ widths }).success).toBe(false);
  });

  it('parses decimal comma lists without sorting or changing defaults', () => {
    const widths = parseWidths(' 1920, 0320 ,1024 ');
    expect(widths).toEqual([1920, 320, 1024]);
    const parsed = optionsSchema.parse({ widths });
    expect(parsed.widths).toEqual(widths);
    expect(parsed.widths).not.toBe(widths);
    expect(optionsSchema.parse({})).not.toHaveProperty('widths');
    expect(VIEWPORTS.map((viewport) => viewport.width)).toEqual([360, 390, 768, 1440]);
  });

  it.each(['', ' ', ',320', '320,', '320,,390', '320;390', '320.0', '3.2e2', '+320', '-320', '0x140', '320px', 'Infinity', '0320,320'])('rejects malformed CLI width list %j', (value) => {
    expect(optionsSchema.safeParse({ widths: parseWidths(value) }).success).toBe(false);
  });

  it.each(['', '   ', 'x'.repeat(2001)])('rejects an empty or oversized readiness selector', (selector) => {
    expect(optionsSchema.safeParse({ waitForSelector: selector }).success).toBe(false);
  });

  it.each(['10ms', '1e3', '-1', '', '1.5', 'Infinity'])('rejects malformed milliseconds %s', (value) => {
    expect(Number.isNaN(parseMilliseconds(value))).toBe(true);
  });
});
