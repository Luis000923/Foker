import { expect, it } from 'vitest';
import { assertUnprotectedScope, protectedPathsInScope } from './scope.js';

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
