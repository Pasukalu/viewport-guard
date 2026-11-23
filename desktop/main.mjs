import { createServer } from 'node:http';
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, shell } from 'electron';
import { ZodError } from 'zod';
import { parseWidths, SCAN_VIEWPORTS } from '../dist/config.js';
import { buildFixPrompt } from '../dist/prompt.js';
import { scan } from '../dist/scan.js';
import { startDemoServer } from '../scripts/demo-server.mjs';

const desktopDir = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(desktopDir, '..');

let mainWindow = null;
let demoServer = null;
let browserMode = 'Playwright Chromium (System Fallback Enabled)';

async function fileExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function configureDesktopBrowser() {
  process.env.VIEWPORT_GUARD_ALLOW_SYSTEM_BROWSER = '1';
  const candidateRoots = [
    join(process.resourcesPath ?? '', 'browsers'),
    join(appRoot, '.artifacts', 'desktop-browsers'),
  ];
  for (const root of candidateRoots) {
    if (!root) continue;
    const manifestPath = join(root, 'manifest.json');
    if (!(await fileExists(manifestPath))) continue;
    try {
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
      if (typeof manifest.executableRelativePath === 'string') {
        const exePath = join(root, ...manifest.executableRelativePath.split('/'));
        if (await fileExists(exePath)) {
          if (process.platform !== 'win32') {
            try { await chmod(exePath, 0o755); } catch { /* ignore read-only mount */ }
          }
          process.env.VIEWPORT_GUARD_BROWSER_PATH = exePath;
          browserMode = app.isPackaged
            ? `Bundled Chromium (${process.platform}/${process.arch} · Offline)`
            : `Staged Bundled Chromium (${process.platform}/${process.arch})`;
          return;
        }
      }
    } catch {
      // Ignore malformed manifest and fall back cleanly.
    }
  }
}

async function readMascotDataUrl() {
  const mascotPath = join(appRoot, 'assets', 'brand', 'mascot.png');
  try {
    const png = await readFile(mascotPath);
    return `data:image/png;base64,${png.toString('base64')}`;
  } catch {
    return null;
  }
}

function defaultReportPath() {
  let baseDir;
  try {
    baseDir = app.getPath('documents');
  } catch {
    baseDir = app.getPath('home');
  }
  return join(baseDir, 'ViewportGuard', 'report.html');
}

function formatError(error) {
  if (error instanceof ZodError) {
    return `Invalid input: ${error.issues.map((issue) => `${issue.path.join('.') || 'input'}: ${issue.message}`).join('; ')}`;
  }
  return error instanceof Error ? error.message : String(error);
}

async function ensureDemoRunning() {
  if (!demoServer) {
    demoServer = await startDemoServer(0, join(appRoot, 'demo'));
  }
  return {
    running: true,
    url: demoServer.url,
    brokenUrl: demoServer.brokenUrl,
    fixedUrl: demoServer.fixedUrl,
  };
}

async function stopDemoIfRunning() {
  if (demoServer) {
    const active = demoServer;
    demoServer = null;
    try {
      await active.close();
    } catch {
      // Ignore close errors during shutdown.
    }
  }
}

function configureAppMenu() {
  if (process.platform === 'darwin') {
    const template = [
      {
        label: app.name,
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' },
        ],
      },
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'selectAll' },
        ],
      },
      {
        label: 'Window',
        submenu: [
          { role: 'minimize' },
          { role: 'zoom' },
          { role: 'close' },
        ],
      },
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  } else {
    Menu.setApplicationMenu(null);
  }
}

function createWindow(show = true) {
  const iconFile = process.platform === 'win32' ? 'icon.ico' : 'icon.png';
  const iconPath = join(desktopDir, 'assets', iconFile);
  const win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 960,
    minHeight: 680,
    show,
    backgroundColor: '#071726',
    title: 'Viewport Guard — Responsive Overflow Scanner',
    icon: iconPath,
    webPreferences: {
      preload: join(desktopDir, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  if (process.platform !== 'darwin') {
    win.setMenuBarVisibility(false);
  }
  win.loadFile(join(desktopDir, 'index.html'));
  return win;
}

function registerIpcHandlers() {
  ipcMain.handle('app:info', async () => ({
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    isPackaged: app.isPackaged,
    browserMode,
    defaultOutputPath: defaultReportPath(),
    mascotDataUrl: await readMascotDataUrl(),
    defaultViewports: SCAN_VIEWPORTS,
    demo: demoServer
      ? { running: true, url: demoServer.url, brokenUrl: demoServer.brokenUrl, fixedUrl: demoServer.fixedUrl }
      : { running: false },
  }));

  ipcMain.handle('demo:start', async () => ensureDemoRunning());

  ipcMain.handle('demo:stop', async () => {
    await stopDemoIfRunning();
    return { running: false };
  });

  ipcMain.handle('dialog:save-report', async (_event, currentPath) => {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Save Viewport Guard HTML Report',
      defaultPath: typeof currentPath === 'string' && currentPath.trim() ? currentPath.trim() : defaultReportPath(),
      filters: [{ name: 'HTML Report', extensions: ['html'] }],
    });
    if (result.canceled || !result.filePath) return null;
    return /\.html$/i.test(result.filePath) ? result.filePath : `${result.filePath}.html`;
  });

  ipcMain.handle('scan:run', async (event, payload) => {
    try {
      const url = typeof payload?.url === 'string' ? payload.url : '';
      const outputPath = typeof payload?.outputPath === 'string' && payload.outputPath.trim()
        ? payload.outputPath.trim()
        : defaultReportPath();
      const options = { outputPath };

      if (typeof payload?.widthsText === 'string' && payload.widthsText.trim().length > 0) {
        options.widths = parseWidths(payload.widthsText);
      }
      if (typeof payload?.timeoutMs === 'number' && Number.isFinite(payload.timeoutMs)) {
        options.timeoutMs = Math.trunc(payload.timeoutMs);
      }
      if (typeof payload?.waitMs === 'number' && Number.isFinite(payload.waitMs)) {
        options.waitMs = Math.trunc(payload.waitMs);
      }
      if (typeof payload?.waitForSelector === 'string' && payload.waitForSelector.trim().length > 0) {
        options.waitForSelector = payload.waitForSelector.trim();
      }

      const run = await scan(url, options, (progress) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send('scan:progress', progress);
        }
      });

      return {
        ok: true,
        htmlPath: run.htmlPath,
        report: run.report,
        hasOverflow: run.hasOverflow,
        operationalErrors: run.operationalErrors,
        screenshotDataUrls: run.screenshotDataUrls,
        fixPrompt: buildFixPrompt(run.report, 5),
      };
    } catch (error) {
      return {
        ok: false,
        error: formatError(error),
      };
    }
  });

  ipcMain.handle('report:open', async (_event, htmlPath) => {
    if (typeof htmlPath !== 'string' || !htmlPath.trim()) return { ok: false, error: 'Missing report path' };
    const err = await shell.openPath(htmlPath);
    return err ? { ok: false, error: err } : { ok: true };
  });

  ipcMain.handle('report:reveal', async (_event, htmlPath) => {
    if (typeof htmlPath !== 'string' || !htmlPath.trim()) return { ok: false, error: 'Missing report path' };
    shell.showItemInFolder(htmlPath);
    return { ok: true };
  });

  ipcMain.handle('report:save-copy', async (_event, sourcePath) => {
    if (typeof sourcePath !== 'string' || !sourcePath.trim()) {
      return { ok: false, error: 'No report generated yet' };
    }
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Save Standalone HTML Copy',
      defaultPath: join(app.getPath('desktop'), 'viewport-guard-report.html'),
      filters: [{ name: 'HTML Report', extensions: ['html'] }],
    });
    if (result.canceled || !result.filePath) return { ok: false, canceled: true };
    const dest = /\.html$/i.test(result.filePath) ? result.filePath : `${result.filePath}.html`;
    await copyFile(sourcePath, dest);
    return { ok: true, destinationPath: dest };
  });

  ipcMain.handle('clipboard:write', async (_event, text) => {
    if (typeof text !== 'string') return { ok: false };
    clipboard.writeText(text);
    return { ok: true };
  });

  ipcMain.handle('external:open', async (_event, url) => {
    if (typeof url !== 'string') return { ok: false };
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { ok: false, error: 'Only http:// and https:// URLs can be opened' };
    }
    await shell.openExternal(parsed.href);
    return { ok: true };
  });
}

async function runSelfTest(outputJsonPath) {
  const workDir = await mkdtemp(join(tmpdir(), 'vg-desktop-selftest-'));
  const summary = {
    isPackaged: app.isPackaged,
    browserMode,
    browserPath: process.env.VIEWPORT_GUARD_BROWSER_PATH ?? null,
    passed: false,
    checks: {},
  };
  try {
    const win = createWindow(false);
    await new Promise((resolveReady, rejectReady) => {
      const timer = setTimeout(() => rejectReady(new Error('Desktop renderer load timed out')), 15_000);
      win.webContents.once('did-finish-load', () => {
        clearTimeout(timer);
        resolveReady();
      });
      win.webContents.once('did-fail-load', (_event, code, description) => {
        clearTimeout(timer);
        rejectReady(new Error(`Renderer failed to load: ${code} ${description}`));
      });
    });
    const uiCheck = await win.webContents.executeJavaScript(`({
      title: document.title,
      hasApi: typeof window.viewportGuard === 'object' && typeof window.viewportGuard.runScan === 'function',
      hasUrlInput: Boolean(document.getElementById('url-input')),
      hasScanBtn: Boolean(document.getElementById('scan-btn')),
    })`);
    if (!uiCheck.hasApi || !uiCheck.hasUrlInput || !uiCheck.hasScanBtn) {
      throw new Error(`Desktop UI check failed: ${JSON.stringify(uiCheck)}`);
    }
    summary.checks.ui = uiCheck;

    const demo = await ensureDemoRunning();
    const brokenOut = join(workDir, 'broken.html');
    const brokenRun = await scan(demo.brokenUrl, { outputPath: brokenOut, waitMs: 50 });
    const brokenDeltas = brokenRun.report.results.map((r) => r.overflow?.overflowPx);
    const brokenSelectors = brokenRun.report.results.slice(0, 2).map((r) => r.overflow?.elements[0]?.selector);
    if (JSON.stringify(brokenDeltas) !== JSON.stringify([185, 170, 0])) {
      throw new Error(`Unexpected broken deltas: ${JSON.stringify(brokenDeltas)}`);
    }
    if (JSON.stringify(brokenSelectors) !== JSON.stringify(['.offer-row', '.offer-row'])) {
      throw new Error(`Unexpected broken selectors: ${JSON.stringify(brokenSelectors)}`);
    }
    summary.checks.brokenDemo = { deltas: brokenDeltas, selectors: brokenSelectors, htmlPath: brokenOut };

    const fixedOut = join(workDir, 'fixed.html');
    const fixedRun = await scan(demo.fixedUrl, { outputPath: fixedOut, waitMs: 50 });
    const fixedDeltas = fixedRun.report.results.map((r) => r.overflow?.overflowPx);
    if (JSON.stringify(fixedDeltas) !== JSON.stringify([0, 0, 0])) {
      throw new Error(`Unexpected fixed deltas: ${JSON.stringify(fixedDeltas)}`);
    }
    const copiedDir = join(workDir, 'copied');
    const copiedHtml = join(copiedDir, 'standalone.html');
    await mkdir(copiedDir, { recursive: true });
    await copyFile(fixedOut, copiedHtml);
    const copiedContent = await readFile(copiedHtml, 'utf8');
    if (!copiedContent.includes('data:image/png;base64,') || !copiedContent.includes('id="fix-prompt"')) {
      throw new Error('Copied standalone HTML missing embedded PNG or fix prompt');
    }
    summary.checks.fixedDemo = { deltas: fixedDeltas, copiedPortableOk: true };

    const closed = createServer();
    await new Promise((r) => closed.listen(0, '127.0.0.1', r));
    const closedPort = closed.address().port;
    await new Promise((r) => closed.close(() => r()));

    let unreachableError = '';
    try {
      await scan(`http://127.0.0.1:${closedPort}/unreachable`, {
        outputPath: join(workDir, 'unreachable.html'),
        timeoutMs: 3000,
        waitMs: 0,
      });
      throw new Error('Expected unreachable URL to fail');
    } catch (error) {
      unreachableError = formatError(error);
      if (!/Unable to load/i.test(unreachableError)) throw error;
    }
    summary.checks.unreachable = { error: unreachableError };
    summary.passed = true;

    if (outputJsonPath) {
      await writeFile(outputJsonPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
    }
    console.log(JSON.stringify(summary, null, 2));
    win.destroy();
  } catch (error) {
    summary.error = formatError(error);
    if (outputJsonPath) {
      await writeFile(outputJsonPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
    }
    console.error(JSON.stringify(summary, null, 2));
    await stopDemoIfRunning();
    await rm(workDir, { recursive: true, force: true });
    app.exit(1);
    return;
  }
  await stopDemoIfRunning();
  await rm(workDir, { recursive: true, force: true });
  app.exit(0);
}

app.whenReady().then(async () => {
  configureAppMenu();
  await configureDesktopBrowser();
  registerIpcHandlers();

  const selfTestArg = process.argv.find((arg) => arg === '--self-test' || arg.startsWith('--self-test='));
  if (selfTestArg) {
    const outJson = selfTestArg.includes('=') ? selfTestArg.slice('--self-test='.length) : undefined;
    await runSelfTest(outJson);
    return;
  }

  mainWindow = createWindow(true);
  mainWindow.on('closed', () => { mainWindow = null; });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow(true);
      mainWindow.on('closed', () => { mainWindow = null; });
    }
  });
});

app.on('before-quit', async () => {
  await stopDemoIfRunning();
});

app.on('window-all-closed', async () => {
  if (process.platform !== 'darwin') {
    await stopDemoIfRunning();
    app.quit();
  }
});
