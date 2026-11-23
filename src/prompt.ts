import type { AuditReport, ViewportResult } from './report.js';

function formatPx(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}px` : `${rounded.toFixed(1)}px`;
}

function elementOverflowPx(result: ViewportResult, element: NonNullable<ViewportResult['overflow']>['elements'][number]): number {
  if (element.overflowPx !== undefined) return element.overflowPx;
  const viewportWidth = result.overflow?.viewportWidth ?? result.viewport.width;
  return Math.max(0, -element.left, element.right - viewportWidth);
}

/** Build a self-contained AI repair prompt from observed horizontal overflow data. */
export function buildFixPrompt(report: AuditReport, maxCandidatesPerViewport = 5): string {
  const title = report.results.find((result) => result.pageTitle && result.pageTitle.trim().length > 0)?.pageTitle?.trim();
  const checkedList = report.results.map((result) => `${result.viewport.width}×${result.viewport.height}`).join(', ');
  const overflowing = report.results.filter((result) => result.overflow?.hasOverflow);

  const headerLines = [
    `Target URL: ${report.targetUrl}`,
    ...(title ? [`Page title: ${title}`] : []),
  ];

  if (overflowing.length === 0) {
    const summaryList = report.results
      .map((result) => `${result.viewport.width}×${result.viewport.height} (${result.overflow ? formatPx(result.overflow.overflowPx) : 'unknown'})`)
      .join(', ');
    return [
      'No horizontal viewport overflow was detected (0px across checked viewports).',
      '',
      ...headerLines,
      `Checked viewports: ${summaryList || 'none'}`,
      '',
      'Regression guard instructions:',
      `- If you edit layout CSS, re-test this page at the exact same viewports (${checkedList || 'default viewports'}) to confirm horizontal overflow stays 0px.`,
    ].join('\n');
  }

  const lines: string[] = [
    'Please inspect and fix the horizontal viewport overflow on this page with the smallest possible CSS change.',
    '',
    ...headerLines,
    '',
    'Overflowing viewports:',
  ];

  for (const result of overflowing) {
    const overflow = result.overflow!;
    lines.push(
      `- ${result.viewport.width}×${result.viewport.height} CSS px: documentWidth ${formatPx(overflow.documentWidth)} vs viewportWidth ${formatPx(overflow.viewportWidth)} (overflow +${formatPx(overflow.overflowPx)})`,
    );
    const candidates = overflow.elements.slice(0, maxCandidatesPerViewport);
    if (candidates.length > 0) {
      lines.push('  Suspected overflowing elements (cross-check against the report screenshot first):');
      candidates.forEach((element, index) => {
        const delta = elementOverflowPx(result, element);
        lines.push(
          `  ${index + 1}. ${element.selector} (left: ${formatPx(element.left)}, right: ${formatPx(element.right)}, width: ${formatPx(element.width)}, overflow: +${formatPx(delta)})`,
        );
      });
    } else {
      lines.push('  Suspected overflowing elements: none isolated automatically (inspect the screenshot and root layout styles).');
    }
  }

  lines.push(
    '',
    'Please do the following:',
    '1. Verify the candidate selectors above against the screenshots in the report, then inspect the relevant CSS rules and ancestor containers (check fixed width, min-width, white-space: nowrap, margins/padding, flex/grid tracks, and media sizing).',
    '2. Make the minimal responsive CSS fix (for example, replace fixed pixel widths with width: 100%; max-width: ... and let inner content scale or wrap cleanly inside its container) instead of blindly hiding clipped content.',
    `3. Re-test this page at the exact same viewports (${checkedList}) and confirm horizontal overflow is 0px at every width.`,
  );

  return lines.join('\n');
}
