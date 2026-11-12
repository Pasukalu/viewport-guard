import { link, mkdtemp, readFile, rm, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { assertOutputIsNotInput, readJsonFile, writeJsonOutput } from '../src/files.js';

describe('bounded JSON files and output protection', () => {
  let root: string;
  beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'viewport-guard-files-')); });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });

  it('reads UTF-8 JSON including a BOM and refuses non-JSON input', async () => {
    const path = join(root, 'input.json');
    await writeFile(path, '\uFEFF{"ok":true}');
    expect(await readJsonFile(path, 100)).toEqual({ ok: true });
    await writeFile(path, 'not JSON');
    await expect(readJsonFile(path, 100)).rejects.toThrow('Invalid JSON');
  });

  it('rejects oversized files and directory input before parsing', async () => {
    const path = join(root, 'large.json');
    await writeFile(path, '{}');
    await truncate(path, 101);
    await expect(readJsonFile(path, 100)).rejects.toThrow('exceeds');
    await expect(readJsonFile(root, 100)).rejects.toThrow('regular file');
  });

  it('does not overwrite existing output without an explicit force value', async () => {
    const output = join(root, 'output.json');
    await writeJsonOutput(output, { revision: 1 });
    await expect(writeJsonOutput(output, { revision: 2 })).rejects.toMatchObject({ code: 'EEXIST' });
    expect(JSON.parse(await readFile(output, 'utf8'))).toEqual({ revision: 1 });
    await writeJsonOutput(output, { revision: 2 }, true);
    expect(JSON.parse(await readFile(output, 'utf8'))).toEqual({ revision: 2 });
  });

  it('protects source files including aliases through hard links', async () => {
    const input = join(root, 'input.json');
    const alias = join(root, 'alias.json');
    await writeFile(input, '{}');
    await expect(assertOutputIsNotInput(input, [input])).rejects.toThrow('input file');
    await link(input, alias);
    await expect(assertOutputIsNotInput(alias, [input])).rejects.toThrow('hard link');
    await expect(assertOutputIsNotInput(join(root, 'new-output.json'), [input])).resolves.toBeUndefined();
  });
});
