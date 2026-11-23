import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const projectDir = fileURLToPath(new URL('..', import.meta.url));
const mascotPath = join(projectDir, 'assets', 'brand', 'mascot.png');
const outDir = join(projectDir, 'desktop', 'assets');
await mkdir(outDir, { recursive: true });

const mascotDataUrl = `data:image/png;base64,${(await readFile(mascotPath)).toString('base64')}`;

function wrapPngAsIco(pngBuffers) {
  const count = pngBuffers.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // icon type
  header.writeUInt16LE(count, 4);

  const entries = [];
  let offset = 6 + count * 16;
  for (const { size, data } of pngBuffers) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += data.length;
  }
  return Buffer.concat([header, ...entries, ...pngBuffers.map((item) => item.data)]);
}

const browser = await chromium.launch({ headless: true });
try {
  // 512px PNG for macOS (.icns auto-conversion) & Linux AppImage/deb; 256..16px frames for Windows .ico.
  const sizes = [512, 256, 64, 48, 32, 16];
  const rendered = [];
  for (const size of sizes) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await page.setContent(`<!doctype html><html><body style="margin:0;width:${size}px;height:${size}px;overflow:hidden;background:transparent">
      <div style="width:${size}px;height:${size}px;border-radius:${Math.round(size * 0.22)}px;background:radial-gradient(circle at 30% 20%,#163b5a,#071726 78%);border:${Math.max(1, Math.round(size * 0.03))}px solid #75e3e8;box-sizing:border-box;display:flex;align-items:flex-end;justify-content:center;overflow:hidden">
        <img src="${mascotDataUrl}" style="width:94%;height:94%;object-fit:contain;object-position:center bottom;display:block">
      </div>
    </body></html>`);
    const png = await page.screenshot({ type: 'png', omitBackground: true });
    rendered.push({ size, data: png });
    await page.close();
  }
  await writeFile(join(outDir, 'icon.png'), rendered[0].data);
  await writeFile(join(outDir, 'icon.ico'), wrapPngAsIco(rendered.filter((item) => item.size <= 256)));
  console.log(`Generated ${join(outDir, 'icon.png')} (512x512) and ${join(outDir, 'icon.ico')} (16-256px)`);
} finally {
  await browser.close();
}
