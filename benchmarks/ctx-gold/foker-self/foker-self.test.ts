import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { assignLines, isSource, materialize, oldLines, parentMap } from './generate.mjs';

interface Case {
  id: string;
  fixture: string;
  commit: string;
  source_commit: string;
  task: string;
  gold_modified: string[];
  gold_symbols: string[];
  unassigned_lines: Record<string, number[]>;
  file_lines: Record<string, number>;
  split: string;
}
const cases: Case[] = readFileSync(new URL('./cases.jsonl', import.meta.url), 'utf8')
  .trim()
  .split('\n')
  .map((line) => JSON.parse(line));
const sortedUnique = (items: string[]) => [...new Set(items)].sort();

it('valida cada fila, ids únicos, orden y split calculado independientemente', () => {
  expect(cases.length).toBeGreaterThanOrEqual(2);
  expect(cases.map((c) => c.id)).toEqual(sortedUnique(cases.map((c) => c.id)));
  const discarded: { id: string; source_commit: string; commit: string | null; reason: string }[] = readFileSync(
    new URL('./discarded.jsonl', import.meta.url),
    'utf8',
  )
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  expect(discarded.map((c) => c.id)).toEqual(sortedUnique(discarded.map((c) => c.id)));
  const retained = new Set(cases.map((c) => c.id));
  for (const c of discarded) {
    expect(Object.keys(c).sort()).toEqual(['commit', 'id', 'reason', 'source_commit']);
    expect(c.source_commit).toMatch(/^[a-f0-9]{40}$/);
    expect(c.id).toBe(`fs-${c.source_commit.slice(0, 8)}`);
    expect(retained.has(c.id)).toBe(false);
    expect(['numero_archivos', 'sin_archivo_300_lineas', 'gold_symbols_vacio', 'sin_padre']).toContain(c.reason);
    if (c.reason === 'sin_padre') expect(c.commit).toBeNull();
    else expect(c.commit).toMatch(/^[a-f0-9]{40}$/);
  }
  for (const c of cases) {
    expect(Object.keys(c).sort()).toEqual(
      [
        'id',
        'fixture',
        'commit',
        'source_commit',
        'task',
        'gold_modified',
        'gold_symbols',
        'unassigned_lines',
        'file_lines',
        'split',
      ].sort(),
    );
    expect(c.fixture).toBe('foker-self');
    expect(c.commit).toMatch(/^[a-f0-9]{40}$/);
    expect(c.source_commit).toMatch(/^[a-f0-9]{40}$/);
    expect(c.id).toBe(`fs-${c.source_commit.slice(0, 8)}`);
    expect(typeof c.task).toBe('string');
    expect(c.task.trim().length).toBeGreaterThan(0);
    expect(c.split).toBe(
      createHash('sha256').update(c.id).digest().readUInt8(0) % 2 === 0 ? 'calibration' : 'validation',
    );
    expect(c.gold_modified.length).toBeGreaterThanOrEqual(1);
    expect(c.gold_modified.length).toBeLessThanOrEqual(3);
    expect(c.gold_modified).toEqual(sortedUnique(c.gold_modified));
    expect(c.gold_modified.every(isSource)).toBe(true);
    expect(Object.keys(c.file_lines).sort()).toEqual(c.gold_modified);
    expect(Object.keys(c.unassigned_lines).sort()).toEqual(c.gold_modified);
    expect(Object.values(c.file_lines).some((n) => n >= 300)).toBe(true);
    for (const path of c.gold_modified) {
      const count = c.file_lines[path];
      if (count === undefined) throw new Error(`Tamaño ausente: ${path}`);
      expect(Number.isInteger(count) && count >= 0).toBe(true);
      const lines = c.unassigned_lines[path];
      if (!lines) throw new Error(`Líneas ausentes: ${path}`);
      expect(lines).toEqual([...new Set(lines)].sort((a, b) => a - b));
      expect(lines.every((n) => Number.isInteger(n) && n >= 0 && n <= count)).toBe(true);
    }
    expect(c.gold_symbols.length).toBeGreaterThan(0);
    expect(c.gold_symbols).toEqual(sortedUnique(c.gold_symbols));
    expect(c.gold_symbols.every((s) => c.gold_modified.some((p) => s.startsWith(`${p}#`)))).toBe(true);
  }
});

it('todos los símbolos gold existen en los mapas de dos padres materializados', async () => {
  for (const c of cases.slice(0, 2)) {
    const dir = mkdtempSync(join(tmpdir(), 'foker-self-test-'));
    try {
      await materialize(c.commit, dir);
      const map = await parentMap(dir);
      const ids = new Set(map.symbols.map((s: { id: string }) => s.id));
      for (const id of c.gold_symbols) expect(ids.has(id), id).toBe(true);
      if (c.id === 'fs-02814430') {
        const symbol = map.symbols.find((s: { id: string }) => s.id === 'packages/core/binding.d.cts#ContextParams');
        const lines = readFileSync(join(dir, 'packages/core/binding.d.cts'), 'utf8').split('\n');
        expect(lines.indexOf('export interface ContextParams {')).toBe(96);
        expect(symbol.range.start.line).toBe(96);
      }
      for (const path of c.gold_modified) {
        const text = readFileSync(join(dir, path), 'utf8');
        expect(text.split('\n').length - Number(text.endsWith('\n'))).toBe(c.file_lines[path]);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

it('verifica base 0 del mapa real y asigna hunks al símbolo más interno', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'foker-self-lines-'));
  try {
    writeFileSync(join(dir, 'sample.ts'), '// cabecera\nexport class Outer {\n  method() {\n    return 1;\n  }\n}\n');
    const map = await parentMap(dir);
    const outer = map.symbols.find((s: { id: string }) => s.id === 'sample.ts#Outer');
    const method = map.symbols.find((s: { parent: string }) => s.parent === outer.id);
    expect(outer.range.start.line).toBe(1); // Declaración en la segunda línea física.
    expect(method.range.start.line).toBe(2);
    const diff =
      '@@ -1 +1 @@\n-// cabecera\n+// cambio\n@@ -4 +4 @@\n-    return 1;\n+    return 2;\n@@ -5,0 +6 @@\n+  // inserción\n';
    expect(oldLines(diff)).toEqual([1, 4, 5]);
    expect(assignLines(map.symbols, oldLines(diff))).toEqual({ gold_symbols: [method.id], unassigned_lines: [1] });
    expect(assignLines(map.symbols, [2, 6]).gold_symbols).toEqual([outer.id]);
    expect(oldLines('@@ -0,0 +1 @@\n+// inicio\n@@ -3,2 +3,0 @@\n-x\n-y\n')).toEqual([0, 3, 4]);
    expect(assignLines(map.symbols, [0]).unassigned_lines).toEqual([0]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
