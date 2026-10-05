import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, expect, test } from 'vitest';
import { EXCLUDE, mine, TEST } from './mine.mjs';

const exec = promisify(execFile);

const path = mkdtempSync(join(tmpdir(), 'fixture-b-'));
const git = async (...args: string[]) => (await exec('git', ['-C', path, ...args], { encoding: 'utf8' })).stdout.trim();
const write = (name: string, content: string) => {
  mkdirSync(dirname(join(path, name)), { recursive: true });
  writeFileSync(join(path, name), content);
};
let sequence = 0;
const commit = async (subject: string, changes: Record<string, string>, date = '2026-06-01T00:00:00Z') => {
  for (const [name, content] of Object.entries(changes)) write(name, content);
  await git('add', '.');
  await exec('git', ['-C', path, 'commit', '-qm', subject], {
    env: { ...process.env, GIT_AUTHOR_DATE: '2025-01-01T00:00:00Z', GIT_COMMITTER_DATE: date },
  });
  sequence++;
  return await git('rev-parse', 'HEAD');
};
const sourceAndTest = () => ({ 'src/a.ts': `export const a = ${sequence};`, 'tests/a.ts': `// test ${sequence}` });
afterAll(() => rmSync(path, { recursive: true, force: true }));

test('reglas 1–6, primer motivo, fechas de commit, renombres y orden reproducible', async () => {
  await git('init', '-q');
  await git('config', 'user.email', 'fixture@example.invalid');
  await git('config', 'user.name', 'Fixture sintético');
  await git('config', 'commit.gpgsign', 'false');
  const root = await commit(
    'fix: raíz',
    { 'src/a.ts': 'export const a = 0;', 'tests/a.ts': '// initial' },
    '2026-04-01T00:00:00Z',
  );
  const accepted = [await commit('fix(core): válido', { ...sourceAndTest(), 'src/new.ts': '// new' })];
  const expected = new Map<string, string>([[root, 'merge']]);
  for (const subject of [
    'chore(core): limpieza',
    'ci: x',
    'docs: x',
    'build: x',
    'release: x',
    'test: x',
    'style: x',
    'revert: x',
    'fix(deps): x',
    'fix: dependency',
    'fix: bump',
    'fix: renovate',
    'fix: update dependency',
  ]) {
    expected.set(await commit(subject, { [`other/${sequence}.txt`]: 'x' }), 'subject');
  }
  expected.set(await commit('feat: solo añade', { 'src/added.ts': 'x', 'tests/added.ts': 'x' }), 'src_count');
  const addedCandidate = await commit('fix: una modificación y cinco añadidos', {
    ...sourceAndTest(),
    ...Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`src/n${i}.ts`, 'initial'])),
  });
  accepted.push(addedCandidate);
  expected.set(
    await commit('fix: seis modificaciones', {
      ...sourceAndTest(),
      ...Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`src/n${i}.ts`, 'modified'])),
    }),
    'src_count',
  );
  expected.set(await commit('fix: sin test', { 'src/a.ts': `${sequence}`, 'package.json': '{}' }), 'no_test');
  for (const name of [
    'package.json',
    'pnpm-lock.yaml',
    'package-lock.json',
    'yarn.lock',
    'bun.lock',
    'bun.lockb',
    'pnpm-workspace.yaml',
    '.nvmrc',
    'tsconfig.base.json',
    'vitest.unit.config.ts',
  ]) {
    expected.set(await commit('fix: configuración', { ...sourceAndTest(), [`nested/${name}`]: 'x' }), 'forbidden_file');
  }
  expected.set(
    await commit('fix: demasiados y prohibido', {
      ...sourceAndTest(),
      'tsconfig.json': '{}',
      ...Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`extra/${i}`, 'x'])),
    }),
    'forbidden_file',
  );
  expected.set(
    await commit('fix: demasiados', {
      ...sourceAndTest(),
      ...Object.fromEntries(Array.from({ length: 19 }, (_, i) => [`extra/${i}`, 'y'])),
    }),
    'too_many_files',
  );
  expected.set(
    await commit('fix: exclusiones', { 'fixtures/a.ts': 'x', 'src/a.d.ts': 'x', 'tests/a.ts': `${sequence}` }),
    'src_count',
  );
  // `src/a.test.ts` es test por sufijo (como en eligibility.py): candidato válido.
  accepted.push(await commit('fix: test por sufijo', { 'src/a.ts': `${sequence}`, 'src/a.test.ts': 'x' }));
  await git('mv', 'src/a.ts', 'src/renamed.ts');
  expected.set(await commit('fix: renombre', { 'tests/a.ts': `${sequence}` }), 'src_count');
  await git('mv', 'src/renamed.ts', 'src/a.ts');
  expected.set(await commit('fix: restaura nombre', { 'tests/a.ts': `${sequence}` }), 'src_count');
  accepted.push(await commit('perf: límite inferior', sourceAndTest(), '2026-04-01T00:00:00Z'));
  accepted.push(await commit('refactor!: límite superior', sourceAndTest(), '2026-09-30T23:59:59Z'));
  const outside = await commit('fix: fuera', sourceAndTest(), '2026-10-01T00:00:00Z');
  // Fecha no monótona: el commit anterior fuera de ventana no debe podar ancestros.
  const fork = await git('rev-parse', 'HEAD');
  await git('checkout', '-qb', 'side');
  const side = await commit('fix: lateral', { 'side.ts': 'x' });
  await git('checkout', '-q', '-');
  accepted.push(
    await commit('feat: cinco fuentes y veinte archivos', {
      ...sourceAndTest(),
      ...Object.fromEntries(Array.from({ length: 4 }, (_, i) => [`src/n${i}.ts`, 'final'])),
      ...Object.fromEntries(Array.from({ length: 14 }, (_, i) => [`limit/${i}`, 'x'])),
    }),
  );
  await exec('git', ['-C', path, 'merge', '--no-ff', '-qm', 'chore: merge', side], {
    env: { ...process.env, GIT_COMMITTER_DATE: '2026-06-01T00:00:00Z' },
  });
  const identity = await git('rev-parse', 'HEAD');
  expected.set(identity, 'merge');
  const result = await mine('synthetic', path, identity);
  expect(result.rejected.map((r) => [r.commit, r.reason]).sort()).toEqual([...expected.entries()].sort());
  const key = (sha: string) => createHash('sha256').update(`fixture-b-42:${sha}`).digest('hex');
  expect(result.candidates.map((c) => c.commit)).toEqual(accepted.sort((a, b) => key(a).localeCompare(key(b))));
  expect(result.candidates.every((c) => c.base.length === 40)).toBe(true);
  expect(result.candidates.some((c) => c.src_added.includes('src/new.ts'))).toBe(true);
  expect(result.candidates.map((c) => c.type).sort()).toEqual(['feat', 'fix', 'fix', 'fix', 'perf', 'refactor']);
  expect(JSON.stringify(await mine('synthetic', path, identity))).toBe(JSON.stringify(result));
  expect([...result.candidates, ...result.rejected].some((c) => [outside, side, fork].includes(c.commit))).toBe(false);
});

test('regex idénticas en conducta a eligibility.py (un solo escape)', () => {
  expect(EXCLUDE.test('docs/a.ts')).toBe(true);
  expect(EXCLUDE.test('.github/a.ts')).toBe(true);
  expect(EXCLUDE.test('src/github.ts')).toBe(false);
  expect(TEST.test('tests/a.ts')).toBe(true);
  expect(TEST.test('src/a.test.ts')).toBe(true);
  expect(TEST.test('packages/treeshake/bundle-size.test.ts')).toBe(true);
  expect(TEST.test('src/a.spec.mts')).toBe(true);
  expect(TEST.test('src/latest.ts')).toBe(false);
});
