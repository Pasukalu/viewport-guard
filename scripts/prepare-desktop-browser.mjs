import { chmod, cp, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
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

/** Return ordered headless-shell candidate relative paths inside a Playwright chromium_headless_shell-* folder. */
export function headlessShellCandidatesFor(platform = process.platform, arch = process.arch) {
  if (platform === 'win32') {
    return [
      ['chrome-headless-shell-win64', 'chrome-headless-shell.exe'],
      ['chrome-headless-shell-win32', 'chrome-headless-shell.exe'],
      ['chrome-win', 'headless_shell.exe'],
    ];
  }
  if (platform === 'darwin') {
    const preferred = arch === 'arm64'
      ? [
          ['chrome-headless-shell-mac-arm64', 'chrome-headless-shell'],
          ['chrome-headless-shell-mac-x64', 'chrome-headless-shell'],
        ]
      : [
          ['chrome-headless-shell-mac-x64', 'chrome-headless-shell'],
          ['chrome-headless-shell-mac-arm64', 'chrome-headless-shell'],
        ];
    return [
      ...preferred,
      ['chrome-mac', 'headless_shell'],
    ];
  }
  if (platform === 'linux') {
    const preferred = arch === 'arm64'
      ? [
          ['chrome-headless-shell-linux-arm64', 'chrome-headless-shell'],
          ['chrome-headless-shell-linux64', 'chrome-headless-shell'],
        ]
      : [
          ['chrome-headless-shell-linux64', 'chrome-headless-shell'],
          ['chrome-headless-shell-linux-arm64', 'chrome-headless-shell'],
        ];
    return [
      ...preferred,
      ['chrome-linux', 'headless_shell'],
    ];
  }
  return [];
}

/** Locate the Playwright headless shell (or full Chromium bundle fallback) for the current OS & arch. */
export async function findPlaywrightBrowser(
  fullExe = chromium.executablePath(),
  platform = process.platform,
  arch = process.arch,
) {
  // Typical fullExe layouts:
  //   win:   .../ms-playwright/chromium-1254/chrome-win64/chrome.exe
  //   linux: .../ms-playwright/chromium-1254/chrome-linux64/chrome
  //   mac:   .../ms-playwright/chromium-1254/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing
  const segments = fullExe.replaceAll('\\', '/').split('/');
  const chromiumRevIdx = segments.findIndex((segment) => /^chromium-\d+$/.test(segment));
  const browserCacheRoot = chromiumRevIdx > 0
    ? resolve(segments.slice(0, chromiumRevIdx).join('/'))
    : resolve(dirname(fullExe), '..', '..');

  if (await exists(browserCacheRoot)) {
    const entries = await readdir(browserCacheRoot, { withFileTypes: true });
    const headlessDirs = entries
      .filter((entry) => entry.isDirectory() && entry.name.startsWith('chromium_headless_shell-'))
      .map((entry) => entry.name)
      .sort()
      .reverse();

    const candidates = headlessShellCandidatesFor(platform, arch);
    for (const dirName of headlessDirs) {
      for (const [subDir, exeName] of candidates) {
        const candidateExe = join(browserCacheRoot, dirName, subDir, exeName);
        if (await exists(candidateExe)) {
          return {
            sourceDir: dirname(candidateExe),
            executableRelativePath: exeName,
          };
        }
      }
    }
  }

  if (await exists(fullExe)) {
    // On macOS, a full .app bundle must be copied from the parent of *.app so frameworks stay intact.
    if (platform === 'darwin') {
      const appIdx = segments.findIndex((segment) => segment.endsWith('.app'));
      if (appIdx > 0) {
        const sourceDir = resolve(segments.slice(0, appIdx).join('/'));
        return {
          sourceDir,
          executableRelativePath: relative(sourceDir, fullExe).replaceAll('\\', '/'),
        };
      }
    }
    return {
      sourceDir: dirname(fullExe),
      executableRelativePath: relative(dirname(fullExe), fullExe).replaceAll('\\', '/'),
    };
  }

  throw new Error('Playwright Chromium is not installed. Run "npx playwright install chromium" first.');
}

async function stageDesktopBrowser() {
  const found = await findPlaywrightBrowser(chromium.executablePath(), process.platform, process.arch);
  await rm(targetDir, { recursive: true, force: true });
  await mkdir(stageRoot, { recursive: true });
  await cp(found.sourceDir, targetDir, { recursive: true, verbatimSymlinks: true });

  const stagedExe = join(targetDir, ...found.executableRelativePath.split('/'));
  if (process.platform !== 'win32') {
    await chmod(stagedExe, 0o755);
  }

  const manifest = {
    platform: process.platform,
    arch: process.arch,
    executableRelativePath: `chromium/${found.executableRelativePath}`,
  };
  await writeFile(join(stageRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`Staged standalone Chromium (${process.platform}/${process.arch}) from ${found.sourceDir} -> ${targetDir}`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await stageDesktopBrowser();
}
