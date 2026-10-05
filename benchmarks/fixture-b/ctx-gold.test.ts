import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { DEFAULT_POLICY } from '@foker/policy';
import { afterAll, expect, test } from 'vitest';
import { splitFor } from '../ctx-gold/foker-self/generate.mjs';
import { buildCases, serialize } from './ctx-gold.mjs';

const exec = promisify(execFile);
const temp = mkdtempSync(join(tmpdir(), 'fixture-b-ctx-gold-'));
const repos = join(temp, 'repos');
const clone = join(repos, 'syn');
afterAll(() => rmSync(temp, { recursive: true, force: true }));

const git = async (...args: string[]) =>
  (await exec('git', ['-C', clone, ...args], { encoding: 'utf8' })).stdout.trim();
const commit = async (subject: string, changes: Record<string, string>) => {
  for (const [name, content] of Object.entries(changes)) {
    mkdirSync(dirname(join(clone, name)), { recursive: true });
    writeFileSync(join(clone, name), content);
  }
  await git('add', '.');
  await git('commit', '-qm', subject);
  return await git('rev-parse', 'HEAD');
};
const SOURCE = [
  'export function foo(a: number): number {',
  '  const doubled = a * 2;',
  '  return doubled + 1;',
  '}',
  '',
  'export class Box {',
  '  size = 1;',
  '  grow(): number {',
  '    return this.size + 1;',
  '  }',
  '}',
  '',
].join('\n');

test('árbol de B, gold_modified, gold_symbols del símbolo más interno, split y determinismo', async () => {
  mkdirSync(clone, { recursive: true });
  await git('init', '-q');
  await git('config', 'user.email', 'fixture@example.invalid');
  await git('config', 'user.name', 'Fixture sintético');
  await git('config', 'commit.gpgsign', 'false');
  const base = await commit('feat: base', {
    'src/a.ts': SOURCE,
    'src/b.ts': 'export const b = 1;\n',
    'docs/guide.ts': 'export const g = 1;\n',
    'tests/a.test.ts': '// test\n',
  });
  const change = await commit('fix: cambia foo y grow', {
    'src/a.ts': SOURCE.replace('a * 2', 'a * 3').replace('this.size + 1', 'this.size + 2'),
    'src/b.ts': 'export const b = 2;\n',
    'src/new.ts': 'export const n = 1;\n',
    'docs/guide.ts': 'export const g = 2;\n',
    'tests/a.test.ts': '// test 2\n',
  });
  const tasksFile = join(temp, 'tasks.jsonl');
  const task = (id: string, extra: object = {}) =>
    JSON.stringify({
      id,
      repo: 'syn',
      base,
      commit: change,
      statement: `Enunciado ${id}`,
      tests_changed: ['tests/a.test.ts'],
      ...extra,
    });
  writeFileSync(tasksFile, `${task('syn-2')}\n${task('syn-1')}\n`);
  const trees = join(temp, 'trees');
  const first = await buildCases(tasksFile, repos, trees);
  expect(first.rows.map((r) => r.id)).toEqual(['syn-1', 'syn-2']);
  const row = first.rows[0];
  expect(row).toEqual({
    id: 'syn-1',
    fixture: 'fixture-b',
    repo: 'syn',
    base,
    task: 'Enunciado syn-1',
    // Sin docs/ (EXCLUDE), sin tests ni archivos añadidos (solo estado M).
    gold_modified: ['src/a.ts', 'src/b.ts'],
    gold_symbols: expect.any(Array),
    split: splitFor('syn-1'),
  });
  // Símbolo más interno: el método grow, no la clase Box; foo y la constante b.
  expect(row?.gold_symbols).toHaveLength(3);
  expect(row?.gold_symbols.some((s) => s.startsWith('src/a.ts#') && s.includes('foo'))).toBe(true);
  expect(row?.gold_symbols.some((s) => s.startsWith('src/a.ts#') && s.includes('grow'))).toBe(true);
  expect(row?.gold_symbols.some((s) => s.includes('Box') && !s.includes('grow'))).toBe(false);
  expect(row?.gold_symbols.some((s) => s.startsWith('src/b.ts#'))).toBe(true);
  // El árbol es B exacto, sin historial ni caché del motor.
  const tree = join(trees, 'syn-1');
  expect(readFileSync(join(tree, 'src/a.ts'), 'utf8')).toBe(SOURCE);
  expect(existsSync(join(tree, 'src/new.ts'))).toBe(false);
  expect(existsSync(join(tree, '.git'))).toBe(false);
  expect(existsSync(join(tree, '.foker'))).toBe(false);
  // Determinista: misma salida byte a byte al regenerar sobre árboles existentes.
  const second = await buildCases(tasksFile, repos, trees);
  expect(serialize(second.rows)).toBe(serialize(first.rows));
  // La base debe ser el padre del commit; ids no pueden escapar de <trees>.
  writeFileSync(tasksFile, `${task('syn-3', { base: change, commit: change })}\n`);
  await expect(buildCases(tasksFile, repos, trees)).rejects.toThrow('base no es el padre');
  writeFileSync(tasksFile, `${task('../fuera')}\n`);
  await expect(buildCases(tasksFile, repos, trees)).rejects.toThrow('Tarea inválida');
}, 60_000);

test('rutas protegidas del evaluador Rust = DEFAULT_POLICY.protected_paths', () => {
  const source = readFileSync(
    new URL('../../crates/foker-context/examples/support/fixture_b.rs', import.meta.url),
    'utf8',
  );
  const block = /pub const DEFAULT_PROTECTED: \[&str; \d+\] = \[([\s\S]*?)\];/.exec(source)?.[1] ?? '';
  const paths = [...block.matchAll(/"([^"]*)"/g)].map((m) => m[1]);
  expect(paths).toEqual(DEFAULT_POLICY.protected_paths);
});
