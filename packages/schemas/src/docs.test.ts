import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { parse } from 'yaml';
import { validate } from './index.js';

it('REQ-DOC-001: docs/configuration.md corresponde al esquema y los defaults reales', () => {
  const script = fileURLToPath(new URL('../scripts/gen-config-docs.mjs', import.meta.url));
  execFileSync(process.execPath, [script, ...(process.env['UPDATE_SNAPSHOTS'] === '1' ? [] : ['--check'])], {
    stdio: 'pipe',
  });
});

it('el ejemplo completo de configuración es válido según el esquema', () => {
  const markdown = readFileSync(new URL('../../../docs/configuration.md', import.meta.url), 'utf8');
  const yaml = markdown.match(/```yaml\n([\s\S]*?)```/)?.[1];
  expect(yaml).toBeDefined();
  expect(validate('foker-config', parse(yaml ?? '')).ok).toBe(true);
});
