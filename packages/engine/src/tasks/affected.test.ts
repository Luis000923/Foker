import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { openEngine } from '@foker/core';
import { TrustStore } from '@foker/policy';
import { expect, it } from 'vitest';
import { stringify } from 'yaml';
import { loadConfig } from '../config.js';
import { validateProfile } from './gates.js';

const exec = promisify(execFile);
it.each([
  { paths: ['packages/web/src/index.ts'], deleted: false, expected: ['--filter=@repo/web'] },
  { paths: ['pnpm-lock.yaml'], deleted: false, expected: [] },
  { paths: ['pnpm-lock.yaml', 'packages/web/src/index.ts'], deleted: false, expected: [] },
  { paths: ['pnpm-lock.yaml', 'packages/web/src/index.ts'], deleted: true, expected: [] },
])('expande afectados $paths (borrado raíz: $deleted) a $expected', async ({ paths, deleted, expected }) => {
  const root = await mkdtemp(join(tmpdir(), 'foker-affected-105-'));
  const trustBaseDir = await mkdtemp(join(tmpdir(), 'foker-trust-105-'));
  try {
    await mkdir(join(root, 'packages/web/src'), { recursive: true });
    await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'foker-web-piloto', private: true }));
    await writeFile(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n');
    await writeFile(join(root, 'packages/web/package.json'), JSON.stringify({ name: '@repo/web' }));
    await writeFile(join(root, 'packages/web/src/index.ts'), 'export const value = 1;\n');
    await writeFile(join(root, 'pnpm-lock.yaml'), 'lockfileVersion: "9.0"\n');
    await writeFile(join(root, '.gitignore'), '.foker/\n');
    await writeFile(
      join(root, 'foker.config.yaml'),
      stringify({
        version: 1,
        validation: {
          profiles: { default: { checks: ['argv'] } },
          checks: {
            argv: {
              run: [
                process.execPath,
                '-e',
                "require('node:fs').writeFileSync('.foker/argv.json', JSON.stringify(process.argv.slice(1)))",
                '--',
                '${affected_packages}',
              ],
            },
          },
        },
      }),
    );
    await exec('git', ['init', '-q'], { cwd: root });
    await exec('git', ['add', '.'], { cwd: root });
    await exec('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '-qm', 'fixture'], {
      cwd: root,
    });
    await new TrustStore(trustBaseDir).approve(root, (await loadConfig(root)).commandsHash);
    // Guardar el mapa previo verifica también la unión con afectados de archivos borrados.
    await (await openEngine(root)).refresh();
    for (const path of paths) {
      if (deleted && path === 'pnpm-lock.yaml') await unlink(join(root, path));
      else await writeFile(join(root, path), `${await readFile(join(root, path), 'utf8')}\n// changed\n`);
    }
    const result = await validateProfile(root, { profile: 'default', changed: true, trustBaseDir });
    expect(result.status).toBe('pass');
    expect(JSON.parse(await readFile(join(root, '.foker/argv.json'), 'utf8'))).toEqual(expected);
  } finally {
    await Promise.all([root, trustBaseDir].map((path) => rm(path, { recursive: true, force: true })));
  }
});
