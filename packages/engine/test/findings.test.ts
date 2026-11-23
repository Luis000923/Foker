import assert from 'node:assert/strict';
import { parseFindings } from '@foker/engine';
import { test } from 'vitest';

test('el parser genérico reconoce Biome y descarta los resúmenes', () => {
  const output = [
    'src/a.ts:3:7 lint/style/useConst  FIXABLE  ━━━━━━━━━━',
    '',
    '  × This let declares a variable that is only assigned once.',
    '',
    '.mcp.json format ━━━━━━━━━━━━',
    '  × Formatter would have printed the following content:',
    'Checked 3 files in 2ms. No fixes applied.',
    'Found 2 errors.',
    '× Some errors were emitted while running checks.',
  ].join('\n');
  assert.deepEqual(parseFindings('generic', output, { root: '/repo' }), [
    {
      message: 'Formatter would have printed the following content:',
      rule: 'biome/format',
      severity: 'error',
      file: '.mcp.json',
    },
    {
      message: 'This let declares a variable that is only assigned once.',
      rule: 'biome/lint/style/useConst',
      severity: 'error',
      file: 'src/a.ts',
      line: 3,
      col: 7,
    },
  ]);
});

test('el parser genérico reconoce errores de tsc con ubicación', () => {
  assert.deepEqual(
    parseFindings(
      'generic',
      "packages/a/src/x.ts(15,14): error TS2322: Type 'string' is not assignable to type 'number'.",
      {
        root: '/repo',
      },
    ),
    [
      {
        message: "Type 'string' is not assignable to type 'number'.",
        rule: 'tsc/TS2322',
        severity: 'error',
        code: 'TS2322',
        file: 'packages/a/src/x.ts',
        line: 15,
        col: 14,
      },
    ],
  );
});
