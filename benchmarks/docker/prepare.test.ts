import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';

it('prepare excluye dependencias en git local sin tocar archivos versionados', async () => {
  const source = (await readFile(new URL('./prepare.mjs', import.meta.url), 'utf8'))
    .replace(/^import .*;\n/gm, '')
    .split("if (process.argv[2] === 'foker')")[0];
  for (const gitExists of [true, false]) {
    const appendFileSync = vi.fn();
    const mkdirSync = vi.fn();
    const cpSync = vi.fn();
    runInNewContext(source ?? '', { appendFileSync, mkdirSync, cpSync, existsSync: () => gitExists });
    expect(appendFileSync.mock.calls).toEqual(gitExists ? [['/work/.git/info/exclude', '\nnode_modules/\n']] : []);
    expect(cpSync).toHaveBeenCalledTimes(2);
  }
});
