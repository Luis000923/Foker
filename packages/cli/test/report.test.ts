import assert from 'node:assert/strict';
import { formatValidation, usefulTail } from '@foker/cli';
import { test } from 'vitest';

const check = (over: Record<string, unknown>) => ({
  check: 'lint',
  status: 'pass',
  exit_code: 0,
  duration_ms: 500,
  findings: [],
  output_tail: '',
  ...over,
});

test('éxito: una línea con estado, checks y tiempo', () => {
  const text = formatValidation('validate', {
    status: 'pass',
    checks: [check({}), check({ check: 'typecheck' })] as never,
  });
  assert.equal(text, 'validate: pass (2/2 checks, 1.0s)\n');
});

test('fallo: archivo:línea, regla y mensaje; remite a --json si hay demasiados', () => {
  const findings = Array.from({ length: 22 }, (_, i) => ({
    file: `src/f${i}.ts`,
    line: i + 1,
    rule: 'tsc/TS2322',
    message: 'Tipo incompatible.\nDetalle',
  }));
  const text = formatValidation('check-security', {
    status: 'fail',
    checks: [check({ check: 'typecheck', status: 'fail', exit_code: 2, findings })] as never,
  });
  const lines = text.trimEnd().split('\n');
  assert.equal(lines[0], 'check-security: fail (1/1 checks fallan, 0.5s)');
  assert.equal(lines[1], '- typecheck: fail (exit 2)');
  assert.equal(lines[2], '  src/f0.ts:1 tsc/TS2322 Tipo incompatible.');
  assert.equal(lines.at(-1), '  (+2 más; check-security --json para el detalle)');
});

test('sin ubicación: cola útil sin adornos, pila de node_modules ni duplicados', () => {
  const tail = usefulTail(
    [
      '\u001b[31mError: falla\u001b[0m',
      '    at run (/repo/node_modules/.pnpm/x/index.js:1:1)',
      '━━━━━━━━━━━━',
      'Error: falla',
      '[ELIFECYCLE] Command failed with exit code 1.',
      'detalle útil',
    ].join('\n'),
  );
  assert.deepEqual(tail, ['Error: falla', 'detalle útil']);
});
