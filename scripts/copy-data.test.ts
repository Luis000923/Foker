import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, it } from 'vitest';
import { copyData } from './copy-data.mjs';

it('empaqueta .gitignore de cualquier plantilla y nivel sin modificar el origen', async () => {
  const work = await mkdtemp(join(tmpdir(), 'foker-copy-'));
  try {
    const source = join(work, 'source');
    const target = join(work, 'target');
    for (const prefix of ['nextjs-turbo', 'otra/apps/web']) {
      await mkdir(join(source, prefix), { recursive: true });
      await writeFile(join(source, prefix, '.gitignore'), 'node_modules/\n');
      await writeFile(join(source, prefix, 'keep.txt'), 'conservar');
    }
    await copyData(pathToFileURL(source), pathToFileURL(target));
    for (const prefix of ['nextjs-turbo', 'otra/apps/web']) {
      expect((await readdir(join(target, prefix))).sort()).toEqual(['_gitignore', 'keep.txt']);
      expect(await readFile(join(target, prefix, '_gitignore'), 'utf8')).toBe('node_modules/\n');
      expect(await readFile(join(source, prefix, '.gitignore'), 'utf8')).toBe('node_modules/\n');
    }
    await writeFile(join(source, 'nextjs-turbo', '_gitignore'), 'colisión');
    await expect(copyData(pathToFileURL(source), pathToFileURL(target))).rejects.toThrow('Nombre reservado');
  } finally {
    await rm(work, { recursive: true, force: true });
  }
});
