import { mkdir, open, realpath, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { reportSchema, type AuditReport } from './report.js';

export async function readJsonFile(path: string, maxBytes: number): Promise<unknown> {
  const handle = await open(path, 'r');
  try {
    const info = await handle.stat();
    if (!info.isFile()) throw new Error(`Not a regular file: ${path}`);
    if (info.size > maxBytes) throw new Error(`JSON file exceeds ${maxBytes} bytes: ${path}`);
    const bytes = Buffer.alloc(maxBytes + 1);
    let offset = 0;
    while (offset < bytes.length) {
      const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, null);
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    if (offset > maxBytes) throw new Error(`JSON file exceeds ${maxBytes} bytes: ${path}`);
    try {
      return JSON.parse(bytes.subarray(0, offset).toString('utf8').replace(/^\uFEFF/, '')) as unknown;
    } catch {
      throw new Error(`Invalid JSON: ${path}`);
    }
  } finally {
    await handle.close();
  }
}

export async function readReportFile(path: string): Promise<AuditReport> {
  return reportSchema.parse(await readJsonFile(path, 16 * 1024 * 1024));
}

export async function assertOutputIsNotInput(output: string, inputs: string[]): Promise<void> {
  const outputPath = resolve(output);
  const outputReal = await realpath(outputPath).catch((error: unknown) => {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') return outputPath;
    throw error;
  });
  const outputInfo = await stat(outputPath, { bigint: true }).catch((error: unknown) => {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') return undefined;
    throw error;
  });
  for (const input of inputs) {
    const inputPath = resolve(input);
    const inputReal = await realpath(inputPath);
    if (outputPath === inputPath || outputReal === inputReal) throw new Error('Output must not overwrite an input file');
    const inputInfo = await stat(inputReal, { bigint: true });
    if (outputInfo && outputInfo.ino !== 0n && outputInfo.ino === inputInfo.ino && outputInfo.dev === inputInfo.dev) {
      throw new Error('Output must not overwrite an input file through a hard link');
    }
  }
}

export async function writeJsonOutput(path: string, value: unknown, overwrite = false): Promise<string> {
  const output = resolve(path);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: overwrite ? 'w' : 'wx' });
  return output;
}
