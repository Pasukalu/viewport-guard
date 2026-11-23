import type { Page } from 'playwright';
import type { OverflowResult } from './report.js';

export async function measureOverflow(page: Page, maxElements = 20): Promise<OverflowResult> {
  return page.evaluate((limit) => {
    const root = document.documentElement;
    const viewportWidth = root.clientWidth;
    const documentWidth = root.scrollWidth;
    const bodyWidth = document.body?.scrollWidth ?? 0;
    // The root scroll area is authoritative: a clipped or internally scrollable
    // body can be wider without causing horizontal page scrolling.
    // Differences <= 1 CSS px are treated as subpixel rounding noise and recorded as 0.
    const rawOverflow = documentWidth - viewportWidth;
    const hasOverflow = rawOverflow > 1;
    const overflowPx = hasOverflow ? rawOverflow : 0;
    const elements: OverflowResult['elements'] = [];

    const roundOneDecimal = (value: number): number => Math.round(value * 10) / 10;

    const matchesOnly = (selector: string, target: Element): boolean => {
      try {
        const matches = document.querySelectorAll(selector);
        return matches.length === 1 && matches[0] === target;
      } catch {
        return false;
      }
    };

    const classTokens = (element: Element): string[] => Array.from(element.classList)
      .filter((token) => token.length > 0 && !token.includes('\u0000'))
      .slice(0, 3);

    const uniqueClassSelector = (target: Element): string | null => {
      const tokens = classTokens(target);
      if (tokens.length === 0) return null;
      for (const token of tokens) {
        const single = `.${CSS.escape(token)}`;
        if (matchesOnly(single, target)) return single;
      }
      if (tokens.length > 1) {
        const combined = tokens.map((token) => `.${CSS.escape(token)}`).join('');
        if (matchesOnly(combined, target)) return combined;
        const taggedCombined = `${CSS.escape(target.localName)}${combined}`;
        if (matchesOnly(taggedCombined, target)) return taggedCombined;
      }
      const taggedFirst = `${CSS.escape(target.localName)}.${CSS.escape(tokens[0]!)}`;
      if (matchesOnly(taggedFirst, target)) return taggedFirst;
      return null;
    };

    const selectorFor = (target: Element): string | null => {
      if (target.id) {
        const directId = `#${CSS.escape(target.id)}`;
        if (matchesOnly(directId, target)) return directId;
      }
      const directClass = uniqueClassSelector(target);
      if (directClass) return directClass;

      const classedSegments: string[] = [];
      const namedSegments: string[] = [];
      const positionalSegments: string[] = [];
      let current: Element | null = target;

      const pathFrom = (anchor: string): string | null => {
        const classed = [anchor, ...classedSegments].join(' > ');
        if (matchesOnly(classed, target)) return classed;
        const named = [anchor, ...namedSegments].join(' > ');
        if (matchesOnly(named, target)) return named;
        // A positional path also works for unusual or namespaced element
        // names that cannot be expressed by the preferred type selector.
        const positional = [anchor, ...positionalSegments].join(' > ');
        return matchesOnly(positional, target) ? positional : null;
      };

      while (current) {
        if (current !== target && current.id) {
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
        const escapedTag = CSS.escape(current.localName);
        const tokens = classTokens(current);
        const classSuffix = tokens.length > 0 ? tokens.map((token) => `.${CSS.escape(token)}`).join('') : '';
        classedSegments.unshift(`${escapedTag}${classSuffix}${position}`);
        namedSegments.unshift(`${escapedTag}${position}`);
        positionalSegments.unshift(position);
        current = parentElement;
      }
      return null;
    };

    const createsFixedContainingBlock = (style: CSSStyleDeclaration): boolean => (
      style.transform !== 'none'
      || style.perspective !== 'none'
      || style.filter !== 'none'
      || (style.backdropFilter !== undefined && style.backdropFilter !== '' && style.backdropFilter !== 'none')
      || /\b(paint|layout|strict|content)\b/.test(style.contain)
      || /\b(transform|filter|perspective)\b/.test(style.willChange)
    );

    const clipsAxis = (overflowValue: string, containValue: string): boolean => (
      overflowValue === 'hidden'
      || overflowValue === 'clip'
      || overflowValue === 'scroll'
      || overflowValue === 'auto'
      || /\b(paint|strict|content)\b/.test(containValue)
    );

    const visibleProtrusion = (element: Element, rect: DOMRect, style: CSSStyleDeclaration): number => {
      let visibleLeft = rect.left;
      let visibleRight = rect.right;
      let visibleTop = rect.top;
      let visibleBottom = rect.bottom;

      const position = style.position;
      let reachedContainingBlock = position !== 'fixed' && position !== 'absolute';
      const offsetParent = element instanceof HTMLElement ? element.offsetParent : null;

      let ancestor = element.parentElement;
      while (ancestor && ancestor !== document.body && ancestor !== root) {
        const ancestorStyle = getComputedStyle(ancestor);
        if (!reachedContainingBlock) {
          if (position === 'fixed') {
            if (createsFixedContainingBlock(ancestorStyle)) reachedContainingBlock = true;
          } else if (position === 'absolute') {
            if (ancestor === offsetParent || ancestorStyle.position !== 'static' || createsFixedContainingBlock(ancestorStyle)) {
              reachedContainingBlock = true;
            }
          }
        }
        if (reachedContainingBlock) {
          const clipX = clipsAxis(ancestorStyle.overflowX, ancestorStyle.contain);
          const clipY = clipsAxis(ancestorStyle.overflowY, ancestorStyle.contain);
          if (clipX || clipY) {
            const ancestorRect = ancestor.getBoundingClientRect();
            if (clipX) {
              if (ancestorRect.width <= 0) return 0;
              visibleLeft = Math.max(visibleLeft, ancestorRect.left);
              visibleRight = Math.min(visibleRight, ancestorRect.right);
            }
            if (clipY) {
              if (ancestorRect.height <= 0) return 0;
              visibleTop = Math.max(visibleTop, ancestorRect.top);
              visibleBottom = Math.min(visibleBottom, ancestorRect.bottom);
            }
            if (visibleRight <= visibleLeft || visibleBottom <= visibleTop) return 0;
          }
        }
        ancestor = ancestor.parentElement;
      }

      const protrusion = Math.max(0, -visibleLeft, visibleRight - viewportWidth);
      return protrusion > 1 ? protrusion : 0;
    };

    if (hasOverflow) {
      const candidates: Array<{
        element: Element;
        rect: DOMRect;
        protrusion: number;
        order: number;
      }> = [];
      let order = 0;
      for (const element of document.querySelectorAll('body *')) {
        const rect = element.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) continue;
        const style = getComputedStyle(element);
        if (
          style.display === 'none'
          || style.visibility === 'hidden'
          || style.visibility === 'collapse'
          || Number.parseFloat(style.opacity) === 0
        ) {
          continue;
        }
        if (rect.left >= -1 && rect.right <= viewportWidth + 1) continue;
        const protrusion = visibleProtrusion(element, rect, style);
        if (protrusion <= 1) continue;
        candidates.push({ element, rect, protrusion, order: order++ });
      }

      candidates.sort((a, b) => (
        (b.protrusion - a.protrusion)
        || (b.rect.width - a.rect.width)
        || (a.order - b.order)
      ));

      for (const candidate of candidates) {
        const selector = selectorFor(candidate.element);
        if (selector === null) continue;
        elements.push({
          selector,
          tag: candidate.element.tagName.toLowerCase(),
          left: candidate.rect.left,
          right: candidate.rect.right,
          width: candidate.rect.width,
          overflowPx: roundOneDecimal(candidate.protrusion),
        });
        if (elements.length >= limit) break;
      }
    }

    return { viewportWidth, documentWidth, bodyWidth, overflowPx, hasOverflow, elements };
  }, maxElements);
}
