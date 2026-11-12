import type { Page } from 'playwright';
import type { OverflowResult } from './report.js';

export async function measureOverflow(page: Page): Promise<OverflowResult> {
  return page.evaluate(() => {
    const root = document.documentElement;
    const viewportWidth = root.clientWidth;
    const documentWidth = root.scrollWidth;
    const bodyWidth = document.body?.scrollWidth ?? 0;
    // The root scroll area is authoritative: a clipped or internally scrollable
    // body can be wider without causing horizontal page scrolling.
    const overflowPx = Math.max(0, documentWidth - viewportWidth);
    const hasOverflow = overflowPx > 1;
    const elements: OverflowResult['elements'] = [];

    const matchesOnly = (selector: string, target: Element): boolean => {
      try {
        const matches = document.querySelectorAll(selector);
        return matches.length === 1 && matches[0] === target;
      } catch {
        return false;
      }
    };

    const selectorFor = (target: Element): string | null => {
      const namedSegments: string[] = [];
      const positionalSegments: string[] = [];
      let current: Element | null = target;

      const pathFrom = (anchor: string): string | null => {
        const named = [anchor, ...namedSegments].join(' > ');
        if (matchesOnly(named, target)) return named;
        // A positional path also works for unusual or namespaced element
        // names that cannot be expressed by the preferred type selector.
        const positional = [anchor, ...positionalSegments].join(' > ');
        return matchesOnly(positional, target) ? positional : null;
      };

      while (current) {
        if (current.id) {
          const idSelector = `#${CSS.escape(current.id)}`;
          // An escaped ID can still be duplicated or fail to round-trip.
          if (matchesOnly(idSelector, current)) {
            const path = pathFrom(idSelector);
            if (path) return path;
          }
        }
        if (current === root) return pathFrom(':root');
        const parentElement: Element | null = current.parentElement;
        if (!parentElement) return null;
        const index = Array.from(parentElement.children).indexOf(current) + 1;
        const position = `:nth-child(${index})`;
        namedSegments.unshift(`${CSS.escape(current.localName)}${position}`);
        positionalSegments.unshift(position);
        current = parentElement;
      }
      return null;
    };

    if (hasOverflow) {
      for (const element of document.querySelectorAll('body *')) {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        if (rect.width === 0 || rect.height === 0 || style.visibility === 'hidden' || style.display === 'none') continue;
        if (rect.left >= -1 && rect.right <= viewportWidth + 1) continue;
        const tag = element.tagName.toLowerCase();
        const selector = selectorFor(element);
        if (selector === null) continue;
        elements.push({ selector, tag, left: rect.left, right: rect.right, width: rect.width });
        if (elements.length >= 20) break;
      }
    }

    return { viewportWidth, documentWidth, bodyWidth, overflowPx, hasOverflow, elements };
  });
}
