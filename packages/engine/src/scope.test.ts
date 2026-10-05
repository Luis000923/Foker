import { mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { assertUnprotectedScope, nonexistentScopePaths, protectedPathsInScope } from './scope.js';

for (const path of ['.git/**', '.agents/**', '.foker/**', 'foker/skills/**'])
  it(`detecta ${path} sin archivos en el mapa`, () => {
    expect(protectedPathsInScope([path], [path])).toEqual([path]);
    expect(() => assertUnprotectedScope([path], [path])).toThrowError(
      expect.objectContaining({ code: 'FKR-POL-002', message: expect.stringContaining('protected_paths_in_scope') }),
    );
  });
it('detecta prefijos y representantes en ambos sentidos y archivos reales', () => {
  expect(protectedPathsInScope(['.git/objects/**'], ['.git/**'])).toEqual(['.git/**']);
  expect(protectedPathsInScope(['foker/**'], ['foker/skills/**'])).toEqual(['foker/skills/**']);
  expect(protectedPathsInScope(['**/skills/**'], ['foker/skills/**'])).toEqual(['foker/skills/**']);
  expect(protectedPathsInScope(['src/*.ts'], ['**/private.ts'], ['src/private.ts'])).toContain('src/private.ts');
  expect(protectedPathsInScope(['src/**'], ['.git/**', 'foker/skills/**'])).toEqual([]);
  expect(protectedPathsInScope(['foker/skills-other/**'], ['foker/skills/**'])).toEqual([]);
});

it('acepta archivos del mapa y directorios existentes para archivos nuevos; rechaza directorios inventados', async () => {
  const root = await mkdtemp(join(tmpdir(), 'foker-scope-'));
  try {
    await mkdir(join(root, 'packages/catalog/src/empty'), { recursive: true });
    await symlink(join(root, 'packages/catalog/src'), join(root, 'linked'));
    const paths = [
      'mapped.ts',
      'packages/catalog/src/**',
      'packages/*/src/**/*.ts',
      'packages/catalog/src/new.ts',
      'packages/catalog/src/empty/*.ts',
      'src/**',
      'packages/missing/src/**',
      'packages/catalog/missing/*.ts',
      'linked/**',
    ];
    expect(await nonexistentScopePaths(root, paths, ['mapped.ts'])).toEqual([
      'src/**',
      'packages/missing/src/**',
      'packages/catalog/missing/*.ts',
      'linked/**',
    ]);
    await expect(nonexistentScopePaths(root, ['../outside/**'], [])).rejects.toMatchObject({ code: 'FKR-POL-001' });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
