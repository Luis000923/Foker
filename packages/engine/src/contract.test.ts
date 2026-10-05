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

it('buildContext valida el esquema y conserva packHash al repetir la petición', async () => {
  const root = mkdtempSync(join(tmpdir(), 'foker-context-contract-'));
  try {
    cpSync(new URL('../../../fixtures/monorepo-pnpm/', import.meta.url), root, {
      recursive: true,
      filter: (src) => !src.includes('/expected'),
    });
    const engine = await openEngine(root, { readOnly: true });
    const request = { task: 'Añade la variante danger al botón', anchors: { files: ['packages/ui/src/button.tsx'] } };
    const pack = await engine.buildContext(request);
    expect(pack.packVersion).toBe(2);
    expect(JSON.parse(pack.json).pack_version).toBe(2);
    expect(pack.rendered).not.toContain('###');
    expect(new Set(pack.files.map((file) => file.id)).size).toBe(pack.files.length);
    const enriched = await engine.buildContext({
      ...request,
      intent: 'add',
      explain: true,
      rules: 'Respeta las convenciones.',
      skill: {
        name: 'button',
        body: 'Añade variantes.',
        requiredFiles: ['packages/ui/src/button.tsx'],
        requiredSymbols: [],
      },
      taskScope: {
        taskId: 'tsk_01ARZ3NDEKTSV4RRFFQ69G5FAV',
        description: 'Actualiza el botón',
        paths: ['packages/ui/**'],
        checks: ['tests'],
      },
      dirtyFiles: ['packages/ui/src/button.tsx'],
    });
    const enrichedJson = JSON.parse(enriched.json);
    expect(validate('context-pack', enrichedJson).ok).toBe(true);
    expect(enrichedJson.request).toMatchObject({
      skill: 'button',
      task_id: 'tsk_01ARZ3NDEKTSV4RRFFQ69G5FAV',
      intent: 'add',
      explain: true,
    });
    expect(enriched.rendered).toContain('Respeta las convenciones.');
    expect(enriched.intentSource).toBe('request');
    expect(enriched.files).toEqual(enrichedJson.files);
    expect(enriched.sections).toEqual(enrichedJson.sections);
    const result = validate('context-pack', JSON.parse(pack.json));
    if (!result.ok) throw new Error(formatIssues(result.issues));
    expect((await engine.buildContext(request)).packHash).toBe(pack.packHash);
    // Un mapa persistido no contiene MapState: buildContext debe reconstruirlo.
    const writable = await openEngine(root);
    await writable.refresh();
    await writable.save();
    const reopened = await openEngine(root, { readOnly: true });
    expect((await reopened.buildContext(request)).packHash).toBe(pack.packHash);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
