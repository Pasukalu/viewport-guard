import { cp, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const projectDir = fileURLToPath(new URL('..', import.meta.url));
const stageRoot = join(projectDir, '.artifacts', 'desktop-browsers');
const targetDir = join(stageRoot, 'chromium');

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function findPlaywrightHeadlessShell() {
  const fullExe = chromium.executablePath();
  // e.g. ...\ms-playwright\chromium-1254\chrome-win64\chrome.exe
  const browserCacheRoot = resolve(dirname(fullExe), '..', '..');
  if (await exists(browserCacheRoot)) {
    const entries = await readdir(browserCacheRoot, { withFileTypes: true });
    const headlessDirs = entries
      .filter((entry) => entry.isDirectory() && entry.name.startsWith('chromium_headless_shell-'))
      .map((entry) => entry.name)
      .sort()
      .reverse();
    for (const dirName of headlessDirs) {
      const candidateWin = join(browserCacheRoot, dirName, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe');
      if (await exists(candidateWin)) {
        return { sourceDir: dirname(candidateWin), executableRelativePath: 'chrome-headless-shell.exe' };
      }
      const candidateWinLegacy = join(browserCacheRoot, dirName, 'chrome-win', 'headless_shell.exe');
      if (await exists(candidateWinLegacy)) {
        return { sourceDir: dirname(candidateWinLegacy), executableRelativePath: 'headless_shell.exe' };
      }
    }
  }
  if (await exists(fullExe)) {
    return {
      sourceDir: dirname(fullExe),
      executableRelativePath: fullExe.slice(dirname(fullExe).length + 1),
    };
  }
  throw new Error('Playwright Chromium is not installed. Run "npx playwright install chromium" first.');
}

const found = await findPlaywrightHeadlessShell();
await rm(targetDir, { recursive: true, force: true });
await mkdir(stageRoot, { recursive: true });
await cp(found.sourceDir, targetDir, { recursive: true });
await writeFile(
  join(stageRoot, 'manifest.json'),
  `${JSON.stringify({ executableRelativePath: `chromium/${found.executableRelativePath}` }, null, 2)}\n`,
  'utf8',
);
console.log(`Staged standalone Chromium browser from ${found.sourceDir} -> ${targetDir}`);
