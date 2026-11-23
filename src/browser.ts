import { chromium, type Browser } from 'playwright';

/** Launch headless Chromium, supporting bundled desktop browser paths and optional system fallback. */
export async function launchChromium(): Promise<Browser> {
  const customExecutable = process.env.VIEWPORT_GUARD_BROWSER_PATH?.trim();
  if (customExecutable) {
    return chromium.launch({ headless: true, executablePath: customExecutable });
  }
  try {
    return await chromium.launch({ headless: true });
  } catch (primaryError) {
    if (process.env.VIEWPORT_GUARD_ALLOW_SYSTEM_BROWSER !== '1') {
      throw primaryError;
    }
    for (const channel of ['msedge', 'chrome'] as const) {
      try {
        return await chromium.launch({ headless: true, channel });
      } catch {
        // Try next available system Chromium channel.
      }
    }
    throw primaryError;
  }
}
