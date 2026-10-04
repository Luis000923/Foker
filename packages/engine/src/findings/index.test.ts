import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import type { FindingParser } from './index.js';
import { parseFindings, runProfileCheck } from './index.js';

vi.mock('@foker/policy', () => ({
  runCheck: vi.fn(async (_check, options) => {
    options.onOutput?.(`src/a.ts(1,2): error TS2322: Broken\n${'ok\n'.repeat(60)}`);
    return { findings: [], status: 'fail', output_tail: 'ok', exit_code: 1 };
  }),
}));
it.each(['tsc.txt', 'eslint.txt', 'eslint.json', 'vitest.txt', 'vitest.json', 'generic.txt'])('%s snapshot', (name) => {
  const output = readFileSync(new URL(`../../test/fixtures/findings/${name}`, import.meta.url), 'utf8');
  expect(parseFindings(name.split('.')[0] as FindingParser, output, { root: '/project' })).toMatchSnapshot();
});
it('ANSI, normalización y rutas exteriores sin ubicación', () => {
  const findings = parseFindings(
    'tsc',
    '\x1b[31m./src/../src/a.ts:2:3 - error TS2322: Bad\x1b[0m\n../outside.ts(1,2): error TS2345: Outside',
    { root: '/project' },
  );
  expect(findings).toEqual([
    { message: 'Outside' },
    { message: 'Bad', rule: 'tsc/TS2322', severity: 'error', code: 'TS2322', file: 'src/a.ts', line: 2, col: 3 },
  ]);
  expect(parseFindings('tsc', 'C:\\project\\src\\a.ts(1,2): error TS2322: Bad', { root: 'C:\\project' })[0]?.file).toBe(
    'src/a.ts',
  );
});
it('límites, orden y determinismo', () => {
  const output = Array.from({ length: 205 }, (_, i) => `src/a.ts(${205 - i},1): error TS2322: Bad`).join('\n');
  const findings = parseFindings('tsc', output, { root: '/project' });
  expect(findings).toHaveLength(200);
  expect(findings[0]?.line).toBe(1);
  expect(findings.at(-1)?.rule).toBe('foker/truncated');
  expect(parseFindings('tsc', output, { root: '/project' })).toEqual(findings);
  expect(parseFindings('generic', 'ERROR\n'.repeat(100), { root: '/project' })).toHaveLength(50);
});
it('integra el parser con salida completa y generic por defecto', async () => {
  expect((await runProfileCheck({ run: ['tsc'], parser: 'tsc' }, { root: '/project' })).findings[0]?.rule).toBe(
    'tsc/TS2322',
  );
  expect((await runProfileCheck({ run: ['tsc'] }, { root: '/project' })).findings[0]?.rule).toBe('generic/error');
});
it('reporters incompletos y JSON inesperado no provocan errores', () => {
  expect(parseFindings('eslint', '[null, {"messages": [null, {}]}]', { root: '/project' })).toEqual([]);
  expect(
    parseFindings('vitest', '{"testResults":[null,{}, {"assertionResults":[null]}]}', { root: '/project' }),
  ).toEqual([]);
  expect(parseFindings('tsc', 'C:\\outside\\a.ts(1,2): error TS2322: Outside', { root: '/project' })).toEqual([
    { message: 'Outside' },
  ]);
});

const fixture = (name: string) =>
  readFileSync(new URL(`../../test/fixtures/findings/${name}`, import.meta.url), 'utf8');

it('resuelve rutas contra cwd y conserva ids relativos al root', () => {
  const findings = parseFindings('tsc', fixture('tsc-cwd.txt'), { root: '/project', cwd: 'packages/app' });
  expect(findings).toEqual([
    { message: 'Outside' },
    {
      message: 'Local',
      rule: 'tsc/TS2322',
      severity: 'error',
      code: 'TS2322',
      file: 'packages/app/src/index.ts',
      line: 2,
      col: 3,
    },
    {
      message: 'Shared',
      rule: 'tsc/TS2345',
      severity: 'error',
      code: 'TS2345',
      file: 'packages/shared/x.ts',
      line: 4,
      col: 5,
    },
  ]);
  expect(parseFindings('tsc', fixture('tsc-cwd.txt'), { root: 'C:\\project', cwd: 'packages/app' })).toEqual(findings);
});

it('propaga el cwd del check al parser', async () => {
  const result = await runProfileCheck({ run: ['tsc'], parser: 'tsc', cwd: 'packages/app' }, { root: '/project' });
  expect(result.findings[0]?.file).toBe('packages/app/src/a.ts');
});

it('conserva diagnósticos globales de tsc sin ubicación', () => {
  expect(parseFindings('tsc', fixture('tsc-global.txt'), { root: '/project' })).toEqual([
    {
      message: "No inputs were found in config file 'tsconfig.json'.",
      rule: 'tsc/TS18003',
      severity: 'error',
      code: 'TS18003',
    },
    { message: "Unknown compiler option 'invalid'.", rule: 'tsc/TS5023', severity: 'error', code: 'TS5023' },
  ]);
});

it('conserva el primer frame dentro del root para cada fallo de vitest', () => {
  expect(parseFindings('vitest', fixture('vitest-frames.txt'), { root: '/project', cwd: 'packages/app' })).toEqual([
    {
      message: 'first failure',
      rule: 'vitest/fail',
      severity: 'error',
      file: 'packages/app/src/app.test.ts',
      line: 12,
      col: 8,
    },
    {
      message: 'second failure',
      rule: 'vitest/fail',
      severity: 'error',
      file: 'packages/app/src/other.test.ts',
      line: 30,
      col: 6,
    },
  ]);
});
