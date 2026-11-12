import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { measureOverflow } from '../src/overflow.js';
import { type OverflowResult } from '../src/report.js';

const baseStyle = '<style>html,body{margin:0;padding:0}*{box-sizing:border-box}.wide{height:24px}</style>';

async function expectNativeMetrics(page: Page, result: OverflowResult): Promise<void> {
  const metrics = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
  }));
  expect(result.viewportWidth).toBe(metrics.viewportWidth);
  expect(result.documentWidth).toBe(metrics.documentWidth);
  expect(result.bodyWidth).toBe(metrics.bodyWidth);
  expect(result.overflowPx).toBe(Math.max(0, metrics.documentWidth - metrics.viewportWidth));
  expect(result.hasOverflow).toBe(metrics.documentWidth - metrics.viewportWidth > 1);
}

/** Resolve every returned selector in the unchanged browser DOM, then compare
 * node identity and geometry with independently marked fixture targets. */
async function expectUniqueEvidence(page: Page, result: OverflowResult, expectedCount: number): Promise<void> {
  const targets = await page.evaluate(() => Array.from(document.querySelectorAll('[data-evidence]')).map((element) => {
    const rect = element.getBoundingClientRect();
    return {
      marker: element.getAttribute('data-evidence'), tag: element.tagName.toLowerCase(),
      left: rect.left, right: rect.right, width: rect.width,
    };
  }));
  expect(result.elements).toHaveLength(expectedCount);
  expect(new Set(result.elements.map((element) => element.selector)).size).toBe(expectedCount);
  const seen = new Set<string | null>();
  for (const candidate of result.elements) {
    const expectedTargets = targets.filter((target) => target.left === candidate.left
      && target.right === candidate.right && target.width === candidate.width);
    // Test targets deliberately have distinct geometry, so a selector pointing
    // at a different node cannot pass by matching an interchangeable rectangle.
    expect(expectedTargets).toHaveLength(1);
    const expected = expectedTargets[0]!;
    const matches = await page.evaluate((selector) => Array.from(document.querySelectorAll(selector)).map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        marker: element.getAttribute('data-evidence'), tag: element.tagName.toLowerCase(),
        left: rect.left, right: rect.right, width: rect.width,
      };
    }), candidate.selector);
    expect(matches).toEqual([expected]);
    expect(candidate.tag).toBe(expected.tag);
    expect(seen.has(expected.marker)).toBe(false);
    seen.add(expected.marker);
  }
}

describe('overflow evidence in the same live Chromium DOM', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => { browser = await chromium.launch({ headless: true }); });
  beforeEach(async () => { page = await browser.newPage({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 1 }); });
  afterEach(async () => { await page?.close(); });
  afterAll(async () => { await browser?.close(); });

  it('keeps a short selector for a simple unique ID', async () => {
    await page.setContent(`${baseStyle}<div id="wide-panel" class="wide" data-evidence="panel" style="width:1800px">Wide</div>`);
    const result = await measureOverflow(page);
    expect(result.overflowPx).toBe(1410);
    expect(result.elements[0]?.selector).toBe('#wide-panel');
    await expectNativeMetrics(page, result);
    await expectUniqueEvidence(page, result, 1);
  });

  it('distinguishes duplicate IDs even when ancestor IDs are duplicated too', async () => {
    await page.setContent(`${baseStyle}
      <section id="duplicate-parent"><div id="duplicate-panel" class="wide" data-evidence="first" style="width:1800px">First</div></section>
      <section id="duplicate-parent"><span id="duplicate-panel" class="wide" data-evidence="second" style="display:block;width:1900px">Second</span></section>`);
    const result = await measureOverflow(page);
    expect(result.overflowPx).toBe(1510);
    expect(result.elements.every((element) => element.selector !== '#duplicate-panel')).toBe(true);
    await expectNativeMetrics(page, result);
    await expectUniqueEvidence(page, result, 2);
  });

  it('distinguishes repeated classes among mixed tag siblings and nested groups', async () => {
    await page.setContent(`${baseStyle}<main>
      <section class="group"><article class="wide repeated" data-evidence="article" style="width:1800px">Article</article>
      <p class="wide repeated" data-evidence="paragraph" style="width:1810px">Paragraph</p></section>
      <section class="group"><div class="wide repeated" data-evidence="division" style="width:1820px">Division</div></section>
      </main>`);
    const result = await measureOverflow(page);
    expect(result.overflowPx).toBe(1430);
    await expectNativeMetrics(page, result);
    await expectUniqueEvidence(page, result, 3);
  });

  it.each(['panel:wide', 'wide panel', 'panel"quoted\'value', '123panel', '宽面板'])('resolves the CSS-escaped ID %s to the original node', async (id) => {
    await page.setContent(`${baseStyle}<div class="wide" data-evidence="escaped" style="width:1800px">Escaped ID</div>`);
    await page.locator('[data-evidence="escaped"]').evaluate((element, value) => { element.id = value; }, id);
    const result = await measureOverflow(page);
    expect(result.overflowPx).toBe(1410);
    await expectNativeMetrics(page, result);
    await expectUniqueEvidence(page, result, 1);
  });

  it('falls back safely when an ID contains a null character that CSS escaping cannot round-trip', async () => {
    await page.setContent(`${baseStyle}<div class="wide" data-evidence="null-id" style="width:1800px">Null ID</div><div data-decoy style="width:100px;height:24px">Replacement ID</div>`);
    const ids = await page.evaluate(() => {
      const target = document.querySelector('[data-evidence="null-id"]')!;
      const decoy = document.querySelector('[data-decoy]')!;
      target.id = '\u0000';
      decoy.id = '\uFFFD';
      return [target.id, decoy.id];
    });
    expect(ids).toEqual(['\u0000', '\uFFFD']);
    const result = await measureOverflow(page);
    expect(result.overflowPx).toBe(1410);
    await expectNativeMetrics(page, result);
    await expectUniqueEvidence(page, result, 1);
  });

  it('locates an ID-less descendant beneath a unique ancestor without confusing sibling groups', async () => {
    await page.setContent(`${baseStyle}<section><div>Earlier group</div></section>
      <section id="unique-group"><div><span class="wide repeated" data-evidence="descendant" style="display:block;width:1800px">Nested target</span></div></section>`);
    const result = await measureOverflow(page);
    expect(result.overflowPx).toBe(1410);
    await expectNativeMetrics(page, result);
    await expectUniqueEvidence(page, result, 1);
  });

  it('returns at most 20 unique node identities when more than 20 elements overflow', async () => {
    const panels = Array.from({ length: 25 }, (_, index) => `<div class="wide repeated" data-evidence="panel-${index}" style="width:${1800 + index}px">Panel ${index}</div>`).join('');
    await page.setContent(`${baseStyle}${panels}`);
    const result = await measureOverflow(page);
    expect(result.overflowPx).toBe(1434);
    await expectNativeMetrics(page, result);
    await expectUniqueEvidence(page, result, 20);
  });

  it('reports transformed geometry and uniquely identifies the transformed node', async () => {
    await page.setContent(`${baseStyle}<div class="wide" data-evidence="transformed" style="width:300px;transform:translateX(300px)">Transformed</div>`);
    const result = await measureOverflow(page);
    expect(result.overflowPx).toBe(210);
    expect(result.elements[0]).toMatchObject({ left: 300, right: 600, width: 300 });
    await expectNativeMetrics(page, result);
    await expectUniqueEvidence(page, result, 1);
  });

  it('does not report an offscreen fixed element when the browser has no page overflow', async () => {
    await page.setContent(`${baseStyle}<div data-evidence="fixed" style="position:fixed;left:-1000px;width:100px;height:24px">Fixed</div>`);
    expect(await page.locator('[data-evidence="fixed"]').evaluate((element) => element.getBoundingClientRect().left)).toBe(-1000);
    const result = await measureOverflow(page);
    await expectNativeMetrics(page, result);
    expect(result.hasOverflow).toBe(false);
    expect(result.elements).toEqual([]);
  });

  it('captures negative-left overflow on an RTL page', async () => {
    await page.setContent(`<html dir="rtl"><head>${baseStyle}</head><body><div class="wide" data-evidence="rtl" style="width:1800px">RTL</div></body></html>`);
    const result = await measureOverflow(page);
    expect(result.overflowPx).toBe(1410);
    expect(result.elements[0]).toMatchObject({ left: -1410, right: 390, width: 1800 });
    await expectNativeMetrics(page, result);
    await expectUniqueEvidence(page, result, 1);
  });

  it.each(['hidden', 'auto'])('keeps an internally %s overflowing container clean at page level', async (overflow) => {
    await page.setContent(`${baseStyle}<div style="width:200px;overflow-x:${overflow}"><div class="wide" data-evidence="contained" style="width:1800px">Contained</div></div>`);
    const result = await measureOverflow(page);
    await expectNativeMetrics(page, result);
    expect(result.hasOverflow).toBe(false);
    expect(result.overflowPx).toBe(0);
    expect(result.elements).toEqual([]);
  });
});
