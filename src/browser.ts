import { access, constants } from 'node:fs/promises';
import { chromium, type Browser, type LaunchOptions } from 'playwright';

const SYSTEM_BROWSER_PATHS: Readonly<Record<string, readonly string[]>> = {
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ],
  linux: [
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/microsoft-edge',
    '/usr/bin/microsoft-edge-stable',
  ],
};

export function systemChannelsForPlatform(platform: NodeJS.Platform): readonly ('msedge' | 'chrome')[] {
  return platform === 'win32' ? ['msedge', 'chrome'] : ['chrome', 'msedge'];
}

export function systemBinaryPathsForPlatform(platform: NodeJS.Platform): readonly string[] {
  return SYSTEM_BROWSER_PATHS[platform] ?? [];
}

function isLinuxSandboxError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /sandbox|zygote|SUID|setuid|operation not permitted/i.test(message);
}

async function launchWithOptionalLinuxSandboxFallback(
  options: LaunchOptions,
  allowFallback: boolean,
): Promise<Browser> {
  try {
    return await chromium.launch(options);
  } catch (error) {
    if (allowFallback && process.platform === 'linux' && isLinuxSandboxError(error)) {
      const existingArgs = options.args ?? [];
      if (!existingArgs.includes('--no-sandbox')) {
        return chromium.launch({ ...options, args: [...existingArgs, '--no-sandbox'] });
      }
    }
    throw error;
  }
}

async function isExecutable(path: string): Promise<boolean> {
  try {
    await access(path, process.platform === 'win32' ? constants.F_OK : constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** Launch headless Chromium, supporting bundled desktop browser paths and optional cross-platform system fallback. */
export async function launchChromium(): Promise<Browser> {
  const allowFallback = process.env.VIEWPORT_GUARD_ALLOW_SYSTEM_BROWSER === '1';
  const customExecutable = process.env.VIEWPORT_GUARD_BROWSER_PATH?.trim();
  if (customExecutable) {
    return launchWithOptionalLinuxSandboxFallback(
      { headless: true, executablePath: customExecutable },
      allowFallback,
    );
  }
  try {
    return await launchWithOptionalLinuxSandboxFallback({ headless: true }, allowFallback);
  } catch (primaryError) {
    if (!allowFallback) {
      throw primaryError;
    }
    for (const channel of systemChannelsForPlatform(process.platform)) {
      try {
        return await launchWithOptionalLinuxSandboxFallback({ headless: true, channel }, true);
      } catch {
        // Try next available system Chromium channel.
      }
    }
    for (const binaryPath of systemBinaryPathsForPlatform(process.platform)) {
      if (!(await isExecutable(binaryPath))) continue;
      try {
        return await launchWithOptionalLinuxSandboxFallback(
          { headless: true, executablePath: binaryPath },
          true,
        );
      } catch {
        // Try next installed system binary path.
      }
    }
    throw primaryError;
  }
}
