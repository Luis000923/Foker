import type { ContextPack } from '@foker/schemas';
import { expect, it } from 'vitest';
import { deriveScopePaths } from './scope.js';

const file = (
  id: string,
  level: ContextPack['files'][number]['level'],
  score: number,
  reasons: [string, ...string[]] = ['CORE'],
): ContextPack['files'][number] => ({
  id,
  level,
  score,
  tokens: 1,
  reasons,
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

it('sin L3 antepone L2 con señal directa a hubs alcanzados solo por el grafo (ADR-032)', () => {
  const files = [
    file('packages/catalog/src/index.ts', 'L2', 0.09),
    file('packages/users/src/index.ts', 'L2', 0.065),
    file('packages/cart/src/index.ts', 'L2', 0.054),
    file('packages/users/src/isAdmin.ts', 'L2', 0.059, ['LEXICAL:consulta']),
    file('packages/ui/src/search.ts', 'L2', 0.045, ['DEPENDENT_OF:x', 'SYMBOL_MENTION']),
    file('packages/orders/src/staff.ts', 'L1', 0.5, ['LEXICAL:staff']),
  ];
  expect(deriveScopePaths({ files })).toEqual([
    'packages/catalog/src/**',
    'packages/ui/src/**',
    'packages/users/src/**',
  ]);
  expect(deriveScopePaths({ files: files.reverse() })).toEqual([
    'packages/catalog/src/**',
    'packages/ui/src/**',
    'packages/users/src/**',
  ]);
});
