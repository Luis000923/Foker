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

it('sin L3 antepone L1/L2 con señal directa a hubs alcanzados solo por el grafo (ADR-032)', () => {
  const files = [
    file('packages/catalog/src/index.ts', 'L2', 0.09),
    file('packages/users/src/index.ts', 'L2', 0.065),
    file('packages/cart/src/index.ts', 'L2', 0.054),
    file('packages/users/src/isAdmin.ts', 'L2', 0.059, ['LEXICAL:consulta']),
    file('packages/ui/src/search.ts', 'L2', 0.045, ['DEPENDENT_OF:x', 'SYMBOL_MENTION']),
    file('packages/orders/src/staff.ts', 'L1', 0.5, ['LEXICAL:staff']),
  ];
  expect(deriveScopePaths({ files })).toEqual([
    'packages/orders/src/**',
    'packages/ui/src/**',
    'packages/users/src/**',
  ]);
  expect(deriveScopePaths({ files: files.reverse() })).toEqual([
    'packages/orders/src/**',
    'packages/ui/src/**',
    'packages/users/src/**',
  ]);
});

it('un archivo de la raíz se acota a sí mismo, no a ** (siempre protegido) (ADR-032)', () => {
  const files = [
    file('vitest.config.ts', 'L2', 0.9, ['LEXICAL:test']),
    file('packages/orders/src/a.ts', 'L2', 0.5, ['LEXICAL:x']),
  ];
  expect(deriveScopePaths({ files })).toEqual(['packages/orders/src/**', 'vitest.config.ts']);
});

it('ordena señales L1/L2 por puntuación descendente e id ascendente; L0 nunca entra', () => {
  const files = [
    file('z/a.ts', 'L1', 2, ['PATH_MENTION']),
    file('b/a.ts', 'L2', 2, ['SYMBOL_MENTION']),
    file('a/a.ts', 'L1', 2, ['LEXICAL:a']),
    file('c/a.ts', 'L1', 3, ['ANCHOR']),
    file('root.ts', 'L0', 99, ['ANCHOR']),
    file('hub/a.ts', 'L2', 99),
  ];
  expect(deriveScopePaths({ files })).toEqual(['a/**', 'b/**', 'c/**']);
  expect(deriveScopePaths({ files: files.reverse() })).toEqual(['a/**', 'b/**', 'c/**']);
  expect(deriveScopePaths({ files: [file('root.ts', 'L0', 99, ['ANCHOR'])] })).toEqual([]);
});

it('completa las señales L1 con L2 sin señal, excluyendo L1 del grafo', () => {
  expect(
    deriveScopePaths({
      files: [
        file('direct/a.ts', 'L1', 0.1, ['LEXICAL:a']),
        file('a/a.ts', 'L2', 2),
        file('a/b.ts', 'L2', 2),
        file('b/a.ts', 'L2', 1),
        file('hub/a.ts', 'L1', 99),
      ],
    }),
  ).toEqual(['a/**', 'direct/**']);
});

const packages = [
  { name: '@repo/ui', path: 'packages/ui' },
  { name: '@repo/web', path: 'apps/web' },
  { name: '@repo/root', path: '.' },
  { name: '@repo/api', path: 'packages/api' },
];

it('D6 permite crear Badge en el paquete nombrado de la web piloto', () => {
  expect(
    deriveScopePaths(
      { files: [file('apps/web/app/page.tsx', 'L3', 1)] },
      'Añade al paquete @repo/ui un componente Badge y úsalo en la página de inicio de apps/web',
      packages,
    ),
  ).toEqual(['apps/web/app/**', 'packages/ui/**']);
});

it('D6 respeta límites npm, excluye raíz y descarta más de dos paquetes', () => {
  const pack = { files: [file('apps/web/app/page.tsx', 'L3', 1)] };
  for (const task of ['@repo/ui-kit', 'x@repo/ui', '@repo/ui/foo', '@repo/root', '@repo/ui @repo/web @repo/api'])
    expect(deriveScopePaths(pack, task, packages)).toEqual(['apps/web/app/**']);
  expect(deriveScopePaths(pack, '(@repo/ui), @repo/web @repo/ui @repo/root', packages)).toEqual([
    'apps/web/**',
    'apps/web/app/**',
    'packages/ui/**',
  ]);
  expect(deriveScopePaths({ files: [file('packages/ui/badge.tsx', 'L3', 1)] }, '@repo/ui', packages)).toEqual([
    'packages/ui/**',
  ]);
});
