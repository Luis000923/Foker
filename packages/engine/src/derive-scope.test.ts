import type { ContextPack } from '@foker/schemas';
import { expect, it } from 'vitest';
import { deriveScopePaths } from './scope.js';

const file = (
  id: string,
  level: ContextPack['files'][number]['level'],
  score: number,
): ContextPack['files'][number] => ({
  id,
  level,
  score,
  tokens: 1,
  reasons: ['test'],
});

it('deriva todos los L3, deduplica y ordena directorios sin añadir L2', () => {
  expect(
    deriveScopePaths({
      files: [
        file('packages/z/src/a.ts', 'L3', 1),
        file('packages/z/src/b.ts', 'L3', 2),
        file('packages/a/test/a.ts', 'L3', 0),
        file('packages/b/src/a.ts', 'L2', 9),
      ],
    }),
  ).toEqual(['packages/a/test/**', 'packages/z/src/**']);
});

it('sin L3 usa los tres primeros L2 por puntuación e id, antes de deduplicar', () => {
  const files = [
    file('packages/z/src/a.ts', 'L2', 1),
    file('packages/a/src/b.ts', 'L2', 2),
    file('packages/b/src/a.ts', 'L2', 1),
    file('packages/a/src/a.ts', 'L2', 2),
    file('packages/c/src/a.ts', 'L1', 9),
  ];
  const expected = ['packages/a/src/**', 'packages/b/src/**'];
  expect(deriveScopePaths({ files })).toEqual(expected);
  expect(deriveScopePaths({ files: files.reverse() })).toEqual(expected);
  expect(deriveScopePaths({ files: [file('index.ts', 'L0', 1)] })).toEqual([]);
});
