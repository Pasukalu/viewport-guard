import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, readlink, realpath, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, win32 } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ComparisonResult } from './compare.js';
import { evaluateReport } from './policy.js';
import { reportSchema, type AuditReport, type ViewportResult } from './report.js';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from('89504e470d0a1a0a', 'hex');

export interface HtmlReportOptions {
  baseDir: string;
  outputPath: string;
  comparison?: ComparisonResult;
  overwrite?: boolean;
}

function escapeHtml(value: unknown): string {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]!);
}

function inside(baseDir: string, target: string): boolean {
  const location = relative(baseDir, target);
  return location === '' || (!location.startsWith(`..${win32.sep}`) && !location.startsWith('../') && location !== '..' && !isAbsolute(location));
}

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

async function pngDataUrl(path: string, description: string): Promise<string> {
  const metadata = await stat(path);
  if (!metadata.isFile()) throw new Error(`${description} must be a regular PNG file`);
  if (metadata.size > MAX_IMAGE_BYTES) throw new Error(`${description} exceeds the 8 MB image limit`);
  const data = await readFile(path);
  if (data.length > MAX_IMAGE_BYTES) throw new Error(`${description} exceeds the 8 MB image limit`);
  if (!data.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) throw new Error(`${description} is not a PNG image`);
  return `data:image/png;base64,${data.toString('base64')}`;
}

async function screenshotDataUrl(baseDir: string, screenshot: string | null): Promise<string | null> {
  if (screenshot === null) return null;
  const portable = screenshot.replaceAll('\\', '/');
  const parts = portable.split('/');
  if (!portable || screenshot.includes('\u0000') || isAbsolute(screenshot) || win32.isAbsolute(screenshot)
    || screenshot.includes(':') || parts.some((part) => part === '..' || part === '' || part === '.') || !/\.png$/i.test(portable)) {
    throw new Error('Unsafe screenshot path: use a relative PNG path inside the report directory');
  }
  // Resolve components explicitly, including broken links, so a missing file
  // cannot disguise a symlink that points outside the report directory.
  let current = baseDir;
  let pending = [...parts];
  let links = 0;
  while (pending.length) {
    const candidate = resolve(current, pending.shift()!);
    try {
      const metadata = await lstat(candidate);
      if (metadata.isSymbolicLink()) {
        const target = resolve(dirname(candidate), await readlink(candidate));
        if (!inside(baseDir, target)) throw new Error('Unsafe screenshot path: symlink resolves outside the report directory');
        if (++links > 40) throw new Error('Unsafe screenshot path: too many symbolic links');
        pending = [...relative(baseDir, target).split(/[\\/]/).filter(Boolean), ...pending];
        current = baseDir;
        continue;
      }
      current = await realpath(candidate);
    } catch (error) {
      if (isMissing(error)) return null;
      throw new Error(`Unable to read screenshot: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!inside(baseDir, current)) throw new Error('Unsafe screenshot path: symlink resolves outside the report directory');
  }
  return pngDataUrl(current, 'Screenshot');
}

async function mascotDataUrl(): Promise<string | null> {
  try {
    return await pngDataUrl(fileURLToPath(new URL('../assets/brand/mascot.png', import.meta.url)), 'Mascot');
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

const STYLES = `
:root{color-scheme:dark;--ink:#ecf6ff;--muted:#9eb5c9;--line:#243b53;--panel:#10253b;--cyan:#75e3e8;--navy:#071726;--danger:#ffb4ad;--good:#a8e8c0;--amber:#f4d493;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--navy);color:var(--ink);line-height:1.5}button,select{font:inherit}button,a,select,summary{touch-action:manipulation}a{color:var(--cyan)}button,select{color:var(--ink)}:focus-visible{outline:3px solid var(--cyan);outline-offset:4px}h1,h2,h3,p{margin:0}h1{font-size:clamp(1.8rem,4vw,3.4rem);line-height:1.1;letter-spacing:-.055em}h2{font-size:1.2rem;letter-spacing:-.02em}h3{font-size:.96rem}button{cursor:pointer}[hidden]{display:none!important}code,pre{font: .8rem/1.6 ui-monospace,SFMono-Regular,Consolas,monospace;overflow-wrap:anywhere;white-space:pre-wrap}img{max-width:100%}.shell{display:grid;grid-template-columns:232px minmax(0,1fr);min-height:100vh}.rail{position:sticky;top:0;height:100vh;display:flex;flex-direction:column;padding:32px 24px;border-right:1px solid var(--line);background:linear-gradient(180deg,#0c2439,#071726)}.wordmark{font-weight:800;letter-spacing:.18em;line-height:1.25;font-size:.96rem}.wordmark span{color:var(--cyan);display:block}.rail-note{color:var(--muted);font-size:.72rem;margin-top:12px}.rail-link{display:block;text-decoration:none;padding:12px 0;border-bottom:1px solid var(--line);font-size:.83rem}.rail-nav{margin-top:34px}.mascot{margin:auto -12px 0;text-align:center}.mascot img{display:block;max-height:330px;width:100%;object-fit:contain;object-position:bottom}.mascot figcaption{color:var(--muted);font-size:.67rem;margin-top:10px}.mascot-fallback{font-size:6rem;padding:40px 0}.content{width:100%;max-width:1680px;padding:40px clamp(16px,3.5vw,56px);min-width:0}.eyebrow{color:var(--cyan);font-size:.7rem;font-weight:700;letter-spacing:.19em;text-transform:uppercase;margin-bottom:16px}.hero{display:flex;justify-content:space-between;align-items:flex-start;gap:24px}.hero-copy{min-width:0}.target{color:#c6d8e6;margin-top:20px;overflow-wrap:anywhere;font-size:.9rem}.meta{color:var(--muted);font-size:.75rem;overflow-wrap:anywhere}.hero .meta{margin-top:9px}.badge{display:inline-flex;align-items:center;gap:7px;font-size:.72rem;font-weight:650;line-height:1.3;border:1px solid var(--line);padding:7px 10px;border-radius:99px;white-space:normal}.badge::before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor;flex:none}.passed{color:var(--good);background:#16382d}.failed{color:var(--amber);background:#3a3020}.error{color:var(--danger);background:#3a2428}.summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:30px 0 18px}.stat{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px;min-width:0}.stat strong{display:block;font-size:2rem;font-weight:650;letter-spacing:-.045em;line-height:1.15}.stat span{display:block;color:var(--muted);font-size:.72rem;margin-top:8px}.policy{display:flex;gap:12px;justify-content:space-between;align-items:center;padding:17px 20px;border:1px solid var(--line);border-radius:12px;background:#0b2033;font-size:.78rem}.policy p{overflow-wrap:anywhere;min-width:0}.policy strong{color:var(--cyan)}.section-heading{display:flex;justify-content:space-between;align-items:center;gap:16px;margin:32px 0 16px}.section-heading p{margin-top:5px}.tabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px}.tab{border:1px solid var(--line);border-radius:10px;padding:11px 14px;background:#0b1e30;text-align:left;min-width:0}.tab[aria-selected=true]{border-color:var(--cyan);background:#163846;box-shadow:inset 0 -2px var(--cyan)}.tab-width{font-weight:700;display:block;font-size:.82rem}.tab-status{font-size:.65rem;color:var(--muted);display:block;margin-top:4px}.viewport-panel{min-width:0}.evidence-grid{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(280px,.9fr);gap:18px;align-items:start}.card{border:1px solid var(--line);border-radius:14px;background:var(--panel);overflow:hidden;min-width:0}.card-header{padding:17px 19px;border-bottom:1px solid var(--line)}.card-header .meta{margin-top:4px}.capture-stage{padding:18px;display:flex;justify-content:center;align-items:flex-start;background:repeating-conic-gradient(#10253b 0% 25%,#122a40 0% 50%) 50%/18px 18px;min-width:0}.capture-stage img{display:block;width:auto;height:auto;max-width:100%;max-height:900px;object-fit:contain;border-radius:4px;box-shadow:0 12px 36px #0005}.placeholder{padding:50px 12px;text-align:center;color:var(--muted);font-size:.8rem}.detail-stack{display:grid;gap:12px;min-width:0}.issue-group{padding:18px}.issue-heading{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:10px}.count{font-size:.7rem;padding:3px 8px;background:#071726;border-radius:8px;color:var(--muted);flex:none}.issue-intro{font-size:.8rem;color:var(--muted);overflow-wrap:anywhere}.issues{list-style:none;margin:0;padding:0}.issues>li{padding:12px 0;border-top:1px solid var(--line);font-size:.79rem;overflow-wrap:anywhere}.issues>li:first-child{border-top:0}.issues p+p{margin-top:5px}.issues details{margin-top:8px}summary{font-size:.76rem;color:var(--cyan);cursor:pointer;overflow-wrap:anywhere}details pre{margin:10px 0 0;padding:12px;background:#071726;border-radius:8px;max-height:240px;overflow:auto}.selector{display:block;color:#e4faff;overflow-wrap:anywhere;white-space:pre-wrap}.geometry{display:flex;flex-wrap:wrap;gap:7px 16px;margin:9px 0 0;font-size:.67rem;color:var(--muted)}.geometry div{display:flex;gap:4px}.geometry dt,.geometry dd{margin:0}.filter{display:flex;align-items:center;gap:9px;font-size:.73rem;flex-shrink:0}.filter select{background:#10253b;border:1px solid var(--line);border-radius:8px;padding:8px 10px;max-width:100%}.critical{margin-top:18px;background:#30212a;border-color:#79505a}.critical .card-header{border-color:#79505a}.critical .issues{padding:4px 19px 10px}.critical h2{color:var(--danger)}.comparison{margin-top:24px}.comparison-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin-top:14px}.comparison-stat{border:1px solid var(--line);border-radius:10px;padding:13px;background:#0b2033}.comparison-stat strong{display:block;font-size:1.5rem}.comparison-stat span{color:var(--muted);font-size:.7rem}.comparison details{margin-top:12px;border:1px solid var(--line);border-radius:10px;padding:14px 18px;background:#0b2033}.comparison .issues{margin-top:10px}.footer{display:flex;justify-content:space-between;gap:16px;color:var(--muted);font-size:.68rem;margin-top:36px;padding-top:20px;border-top:1px solid var(--line)}.empty{color:var(--muted);font-size:.78rem;padding:8px 0}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
@media(min-width:1500px){.rail{padding-top:44px}.content{padding-top:48px}}@media(max-width:1100px){.shell{grid-template-columns:180px minmax(0,1fr)}.rail{padding:26px 18px}.evidence-grid{grid-template-columns:minmax(0,1fr)}.mascot img{max-height:270px}.summary{gap:8px}.stat{padding:14px}.stat strong{font-size:1.75rem}}@media(max-width:720px){.shell{display:block}.rail{position:relative;height:auto;display:block;padding:18px 20px;border-right:0;border-bottom:1px solid var(--line)}.wordmark{font-size:.78rem;letter-spacing:.16em}.wordmark span{display:inline;margin-left:8px}.rail-note{margin-top:5px;font-size:.65rem}.rail-nav{display:none}.mascot{position:absolute;right:10px;top:5px;width:74px;margin:0}.mascot img{height:76px}.mascot figcaption,.mascot-fallback{display:none}.content{padding-top:26px}.hero{display:block}.hero>.badge{margin-top:16px}.summary{grid-template-columns:repeat(2,minmax(0,1fr));margin-top:24px}.stat strong{font-size:1.8rem}.policy{display:block;padding:15px}.policy .meta{margin-top:7px}.section-heading{display:block;margin-top:26px}.filter{margin-top:14px}.tabs{gap:6px}.tab{padding:10px 12px}.comparison-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.capture-stage{padding:12px}.card-header,.issue-group{padding:15px}.footer{display:block}.footer span{display:block;margin-top:5px}.target{font-size:.8rem}}
`;

const INTERACTION = `
(() => {
  const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
  const selectTab = (selected) => {
    for (const tab of tabs) {
      const active = tab === selected;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      document.getElementById(tab.getAttribute('aria-controls')).hidden = !active;
    }
  };
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectTab(tab));
    tab.addEventListener('keydown', (event) => {
      let next = null;
      if (event.key === 'ArrowRight') next = tabs[(index + 1) % tabs.length];
      if (event.key === 'ArrowLeft') next = tabs[(index + tabs.length - 1) % tabs.length];
      if (event.key === 'Home') next = tabs[0];
      if (event.key === 'End') next = tabs[tabs.length - 1];
      if (next) { event.preventDefault(); selectTab(next); next.focus(); }
    });
  });
  document.getElementById('issue-filter').addEventListener('change', (event) => {
    const selected = event.target.value;
    document.querySelectorAll('[data-category]').forEach((group) => {
      group.hidden = selected !== 'all' && group.dataset.category !== selected;
    });
  });
})();
`;

function issueList(entries: string[], empty: string): string {
  return entries.length ? `<ul class="issues">${entries.map((entry) => `<li>${entry}</li>`).join('')}</ul>` : `<p class="empty">${escapeHtml(empty)}</p>`;
}

function group(category: string, title: string, count: number, content: string): string {
  return `<section class="card issue-group" data-category="${category}"><div class="issue-heading"><h3>${title}</h3><span class="count">${count}</span></div>${content}</section>`;
}

function viewportDetails(result: ViewportResult): string {
  const overflow = result.overflow;
  const overflowContent = overflow
    ? `<p class="issue-intro">${overflow.documentWidth}px document · ${overflow.viewportWidth}px viewport · <strong>${overflow.overflowPx}px overflow</strong></p>${issueList(overflow.elements.map((element) => `<code class="selector">${escapeHtml(element.selector)}</code><dl class="geometry"><div><dt>Left</dt><dd>${element.left}px</dd></div><div><dt>Right</dt><dd>${element.right}px</dd></div><div><dt>Width</dt><dd>${element.width}px</dd></div></dl>`), overflow.hasOverflow ? 'No visible candidate elements were recorded.' : 'No horizontal page overflow.')}`
    : '<p class="issue-intro">Overflow measurement unavailable. Review execution errors.</p>';
  return [
    group('overflow', 'Horizontal overflow', overflow?.hasOverflow ? 1 : 0, overflowContent),
    group('console', 'Console errors', result.consoleErrors.length, issueList(result.consoleErrors.map((error) => `<p>${escapeHtml(error.text)}</p><p class="meta">${escapeHtml(error.location.url)}:${error.location.lineNumber}:${error.location.columnNumber}</p>`), 'No console errors recorded.')),
    group('pageerror', 'Uncaught page errors', result.pageErrors.length, issueList(result.pageErrors.map((error) => `<p><strong>${escapeHtml(error.name)}</strong>: ${escapeHtml(error.message)}</p>${error.stack ? `<details><summary>Stack trace</summary><pre>${escapeHtml(error.stack)}</pre></details>` : ''}`), 'No uncaught page errors recorded.')),
    group('request', 'Failed network requests', result.failedRequests.length, issueList(result.failedRequests.map((request) => `<p><strong>${escapeHtml(request.method)}</strong> ${escapeHtml(request.url)}</p><p class="meta">${escapeHtml(request.resourceType)} · ${escapeHtml(request.errorText)}</p>`), 'No failed transport requests recorded.')),
  ].join('');
}

function comparisonSection(comparison: ComparisonResult): string {
  const labels = ['added', 'resolved', 'worsened', 'improved', 'unchanged'] as const;
  const summary = labels.map((label) => `<div class="comparison-stat"><strong>${escapeHtml(comparison.summary[label])}</strong><span>${label[0]!.toUpperCase() + label.slice(1)}</span></div>`).join('');
  const findingDetails = (title: string, findings: ComparisonResult['added']) => `<details${findings.length ? ' open' : ''}><summary>${title} · ${findings.length}</summary>${issueList(findings.map((finding) => `<p><strong>${escapeHtml(finding.viewport.width)} × ${escapeHtml(finding.viewport.height)} · ${escapeHtml(finding.kind)}</strong> · ${escapeHtml(finding.count)} occurrence(s)</p><p>${escapeHtml(finding.message)}</p><code>${escapeHtml(finding.key)}</code>`), 'None.')}</details>`;
  const changedDetails = (title: string, changes: ComparisonResult['worsened']) => `<details${changes.length ? ' open' : ''}><summary>${title} · ${changes.length}</summary>${issueList(changes.map((change) => `<p><strong>${escapeHtml(change.viewport.width)} × ${escapeHtml(change.viewport.height)}</strong> · ${escapeHtml(change.beforePx)}px → ${escapeHtml(change.afterPx)}px overflow</p>`), 'None.')}</details>`;
  return `<section id="comparison" class="comparison"><h2>Baseline comparison</h2><p class="meta">New findings, resolved findings, and overflow changes.</p><div class="comparison-grid">${summary}</div>${findingDetails('Added findings', comparison.added)}${findingDetails('Resolved findings', comparison.resolved)}${changedDetails('Worsened overflow', comparison.worsened)}${changedDetails('Improved overflow', comparison.improved)}</section>`;
}

/** Generate a standalone, offline HTML artifact from validated audit facts. */
export async function writeHtmlReport(input: AuditReport, options: HtmlReportOptions): Promise<string> {
  const report = reportSchema.parse(input);
  if (report.results.length > 8) throw new Error('HTML reports support at most 8 viewport results');
  const outputPath = resolve(options.outputPath);
  if (!/\.html$/i.test(outputPath)) throw new Error('HTML output path must end in .html');
  const baseDir = await realpath(resolve(options.baseDir));
  if (!(await stat(baseDir)).isDirectory()) throw new Error('Report base directory must be a directory');
  const screenshots = await Promise.all(report.results.map((result) => screenshotDataUrl(baseDir, result.screenshot)));
  const mascot = await mascotDataUrl();
  const evaluation = evaluateReport(report);
  const operationalErrors = [
    ...(report.errors ?? []).map((error) => ({ viewport: 'Whole audit', error })),
    ...report.results.flatMap((result) => {
      const errors = result.errors.length ? result.errors
        : result.status === 'error' ? ['An execution error was recorded without further details.'] : [];
      return errors.map((error) => ({ viewport: `${result.viewport.width} × ${result.viewport.height}`, error }));
    }),
  ];
  if (report.summary.errors > 0 && !operationalErrors.length) {
    operationalErrors.push({ viewport: 'Whole audit', error: 'The report records execution errors without further details.' });
  }
  const rawFindings = report.results.reduce((count, result) => count + (result.overflow?.hasOverflow ? 1 : 0)
    + result.consoleErrors.length + result.pageErrors.length + result.failedRequests.length, 0);
  const outcome = operationalErrors.length ? 'Execution error' : evaluation.passed ? 'Policy passed' : 'Policy blocked';
  const outcomeClass = operationalErrors.length ? 'error' : evaluation.passed ? 'passed' : 'failed';
  const tabs = report.results.map((result, index) => `<button class="tab" type="button" role="tab" id="tab-${index}" aria-controls="panel-${index}" aria-selected="${index === 0}" tabindex="${index === 0 ? 0 : -1}"><span class="tab-width">${result.viewport.width}px</span><span class="tab-status">${escapeHtml(result.status)} · ${result.viewport.height}px tall</span></button>`).join('');
  const panels = report.results.map((result, index) => `<section class="viewport-panel" role="tabpanel" id="panel-${index}" aria-labelledby="tab-${index}" tabindex="0"${index === 0 ? '' : ' hidden'}><div class="evidence-grid"><section class="card"><div class="card-header"><h3>${result.viewport.width} × ${result.viewport.height} capture</h3><p class="meta">${escapeHtml(result.finalUrl)}</p></div><div class="capture-stage">${screenshots[index] ? `<img src="${screenshots[index]}" alt="Page screenshot at ${result.viewport.width} by ${result.viewport.height} CSS pixels">` : '<p class="placeholder">Screenshot unavailable.<br>Audit findings remain available on this page.</p>'}</div></section><div class="detail-stack">${viewportDetails(result)}</div></div></section>`).join('');
  const critical = operationalErrors.length ? `<section class="card critical" id="execution-errors" aria-label="Execution errors"><div class="card-header"><h2>Execution errors · ${operationalErrors.length}</h2><p class="meta">These errors always block a successful audit, regardless of the selected policy.</p></div>${issueList(operationalErrors.map(({ viewport, error }) => `<p><strong>${escapeHtml(viewport)}</strong></p><p>${escapeHtml(error)}</p>`), '')}</section>` : '';
  const styleHash = createHash('sha256').update(STYLES).digest('base64');
  const scriptHash = createHash('sha256').update(INTERACTION).digest('base64');
  const csp = `default-src 'none'; img-src data:; style-src 'sha256-${styleHash}'; script-src 'sha256-${scriptHash}'; connect-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'; frame-src 'none'`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${escapeHtml(csp)}"><meta name="referrer" content="no-referrer"><title>Viewport Guard · Offline audit report</title><style>${STYLES}</style></head><body><div class="shell"><aside class="rail"><div class="wordmark">VIEWPORT<span>GUARD</span></div><p class="rail-note">A clear view, at every width.</p><nav class="rail-nav" aria-label="Report sections"><a class="rail-link" href="#overview">01 / Overview</a><a class="rail-link" href="#viewport-evidence">02 / Viewport evidence</a>${options.comparison ? '<a class="rail-link" href="#comparison">03 / Baseline comparison</a>' : ''}</nav><figure class="mascot">${mascot ? `<img src="${mascot}" alt="Blue-haired whale-girl maid project mascot">` : '<div class="mascot-fallback" role="img" aria-label="Whale mascot">🐋</div>'}<figcaption>Your quiet lookout.<br>Unofficial project artwork.</figcaption></figure></aside><main class="content" id="overview"><header class="hero"><div class="hero-copy"><p class="eyebrow">Offline audit / 审计报告</p><h1>Every viewport.<br>In view.</h1><p class="target">${escapeHtml(report.targetUrl)}</p><p class="meta">${escapeHtml(report.startedAt)} · ${escapeHtml(report.durationMs)}ms · schema ${escapeHtml(report.schemaVersion)}</p></div><span class="badge ${outcomeClass}">${outcome}</span></header><section class="summary" aria-label="Audit summary"><div class="stat"><strong>${report.results.length}</strong><span>Viewports inspected</span></div><div class="stat"><strong>${rawFindings}</strong><span>Raw findings · all categories</span></div><div class="stat"><strong>${evaluation.blockingViewports.length}</strong><span>Blocking viewports · selected policy</span></div><div class="stat"><strong>${operationalErrors.length}</strong><span>Execution errors · always blocking</span></div></section><section class="policy" aria-label="Failure policy"><p><strong>Fail on:</strong> ${escapeHtml(evaluation.failOn.length ? evaluation.failOn.join(', ') : 'none')}</p><p class="meta">Raw findings stay visible, including categories outside this policy.</p></section>${critical}${options.comparison ? comparisonSection(options.comparison) : ''}<section id="viewport-evidence"><div class="section-heading"><div><h2>Viewport evidence</h2><p class="meta">Select a width to inspect its capture and recorded findings.</p></div><label class="filter" for="issue-filter">Show details <select id="issue-filter"><option value="all">All categories</option><option value="overflow">Overflow</option><option value="console">Console errors</option><option value="pageerror">Page errors</option><option value="request">Network failures</option></select></label></div><div class="tabs" role="tablist" aria-label="Viewport widths">${tabs}</div>${panels || '<p class="empty">This report contains no viewport evidence.</p>'}</section><footer class="footer"><span>VIEWPORT GUARD / Local, self-contained report</span><span>Independent project · Unofficial character artwork</span></footer></main></div><script>${INTERACTION}</script></body></html>`;
  try {
    if ((await lstat(outputPath)).isSymbolicLink()) throw new Error('HTML output must not be a symbolic link');
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
  await mkdir(dirname(outputPath), { recursive: true });
  try {
    await writeFile(outputPath, html, { encoding: 'utf8', flag: options.overwrite ? 'w' : 'wx' });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST') {
      throw new Error('HTML output already exists; choose a new path or explicitly enable overwrite');
    }
    throw error;
  }
  return outputPath;
}
