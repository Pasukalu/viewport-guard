import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { systemBinaryPathsForPlatform, systemChannelsForPlatform } from '../src/browser.js';
// @ts-expect-error ESM build helper without .d.ts
import { findPlaywrightBrowser, headlessShellCandidatesFor } from '../scripts/prepare-desktop-browser.mjs';

describe('cross-platform desktop browser staging & fallback helpers', () => {
  let rootDir: string;

  beforeAll(async () => {
    rootDir = await mkdtemp(join(tmpdir(), 'vg-platform-test-'));
  });

  afterAll(async () => {
    if (rootDir) await rm(rootDir, { recursive: true, force: true });
  });

  it('returns OS- and architecture-appropriate headless shell candidates', () => {
    expect(headlessShellCandidatesFor('win32', 'x64')[0]).toEqual([
      'chrome-headless-shell-win64',
      'chrome-headless-shell.exe',
    ]);
    expect(headlessShellCandidatesFor('darwin', 'arm64')[0]).toEqual([
      'chrome-headless-shell-mac-arm64',
      'chrome-headless-shell',
    ]);
    expect(headlessShellCandidatesFor('darwin', 'x64')[0]).toEqual([
      'chrome-headless-shell-mac-x64',
      'chrome-headless-shell',
    ]);
    expect(headlessShellCandidatesFor('linux', 'x64')[0]).toEqual([
      'chrome-headless-shell-linux64',
      'chrome-headless-shell',
    ]);
    expect(headlessShellCandidatesFor('linux', 'arm64')[0]).toEqual([
      'chrome-headless-shell-linux-arm64',
      'chrome-headless-shell',
    ]);
  });

  it('locates staged macOS arm64, Linux x64, and Windows x64 headless shell binaries from Playwright cache layout', async () => {
    const cacheRoot = join(rootDir, 'ms-playwright');

    // Simulate macOS arm64 cache layout
    const macFull = join(cacheRoot, 'chromium-1254', 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing');
    const macHeadless = join(cacheRoot, 'chromium_headless_shell-1254', 'chrome-headless-shell-mac-arm64', 'chrome-headless-shell');
    await mkdir(join(cacheRoot, 'chromium-1254', 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS'), { recursive: true });
    await mkdir(join(cacheRoot, 'chromium_headless_shell-1254', 'chrome-headless-shell-mac-arm64'), { recursive: true });
    await writeFile(macFull, 'stub', 'utf8');
    await writeFile(macHeadless, 'stub', 'utf8');

    const macFound = await findPlaywrightBrowser(macFull, 'darwin', 'arm64');
    expect(macFound.executableRelativePath).toBe('chrome-headless-shell');
    expect(macFound.sourceDir.replaceAll('\\', '/')).toMatch(/chromium_headless_shell-1254\/chrome-headless-shell-mac-arm64$/);

    // Simulate Linux x64 cache layout
    const linuxFull = join(cacheRoot, 'chromium-1254', 'chrome-linux64', 'chrome');
    const linuxHeadless = join(cacheRoot, 'chromium_headless_shell-1254', 'chrome-headless-shell-linux64', 'chrome-headless-shell');
    await mkdir(join(cacheRoot, 'chromium-1254', 'chrome-linux64'), { recursive: true });
    await mkdir(join(cacheRoot, 'chromium_headless_shell-1254', 'chrome-headless-shell-linux64'), { recursive: true });
    await writeFile(linuxFull, 'stub', 'utf8');
    await writeFile(linuxHeadless, 'stub', 'utf8');

    const linuxFound = await findPlaywrightBrowser(linuxFull, 'linux', 'x64');
    expect(linuxFound.executableRelativePath).toBe('chrome-headless-shell');
    expect(linuxFound.sourceDir.replaceAll('\\', '/')).toMatch(/chromium_headless_shell-1254\/chrome-headless-shell-linux64$/);

    // Simulate macOS .app fallback when headless shell directory does not exist
    const macOnlyRoot = join(rootDir, 'mac-only-cache');
    const macOnlyExe = join(macOnlyRoot, 'chromium-1254', 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing');
    await mkdir(join(macOnlyRoot, 'chromium-1254', 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS'), { recursive: true });
    await writeFile(macOnlyExe, 'stub', 'utf8');
    const macFallback = await findPlaywrightBrowser(macOnlyExe, 'darwin', 'arm64');
    expect(macFallback.executableRelativePath).toBe('Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
  });

  it('orders system fallback channels and binary paths per operating system', () => {
    expect(systemChannelsForPlatform('win32')).toEqual(['msedge', 'chrome']);
    expect(systemChannelsForPlatform('darwin')).toEqual(['chrome', 'msedge']);
    expect(systemChannelsForPlatform('linux')).toEqual(['chrome', 'msedge']);
    expect(systemBinaryPathsForPlatform('darwin').some((p) => p.includes('Google Chrome.app'))).toBe(true);
    expect(systemBinaryPathsForPlatform('linux')).toContain('/usr/bin/chromium');
    expect(systemBinaryPathsForPlatform('win32')).toEqual([]);
  });
});
