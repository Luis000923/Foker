// Tests de contrato (FOKER-SPEC §19.1): las salidas del núcleo nativo validan contra los esquemas.
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openEngine } from '@foker/core';
import { formatIssues, validate } from '@foker/schemas';
import { describe, expect, it } from 'vitest';

describe('contrato del Project Map', () => {
  it.each(['monorepo-pnpm', 'edge-cases', 'resolution-cases'])(
    'exportMapJson de %s valida contra project-map.schema.json',
    async (name) => {
      const root = mkdtempSync(join(tmpdir(), `foker-contract-${name}-`));
      try {
        cpSync(new URL(`../../../fixtures/${name}/`, import.meta.url), root, {
          recursive: true,
          filter: (src) => !src.includes('/expected'),
        });
        const engine = await openEngine(root);
        await engine.refresh();
        const map: unknown = JSON.parse(await engine.exportMapJson());
        const result = validate('project-map', map);
        if (!result.ok) throw new Error(formatIssues(result.issues));
        expect(result.ok).toBe(true);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  );
});
