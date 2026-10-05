import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it, vi } from 'vitest';
import { evaluateContext, loadCases, renderedBytes, renderedTokens } from './ctx-gold.js';

it('particiona cada byte del render incluso con cabeceras literales y UTF-8', () => {
  const text =
    '## related\n<foker:file id="a.ts" level="L3" trust="repository-content">\n## request\né\n</foker:file>\n## request [fix]\nRepara é\n';
  const bytes = renderedBytes(text);
  expect(Object.values(bytes).reduce((sum, value) => sum + value, 0)).toBe(Buffer.byteLength(text));
  expect(bytes.bodies).toBe(Buffer.byteLength('## request\né\n'));
  expect(bytes.request).toBe(Buffer.byteLength('Repara é\n'));
  expect(renderedTokens(text)).toBe(Math.ceil(Buffer.byteLength(text) / 3.2));
});

it('distingue rutas completas y firmas inline con rangos naturales', () => {
  const text =
    '## related\n<foker:files level="L1" trust="repository-content">\npackages/shop/src/entry-{0..21}.ts: export function entry{N}(id: string): Entity\n</foker:files>\n';
  const bytes = renderedBytes(text);
  expect(Object.values(bytes).reduce((sum, value) => sum + value, 0)).toBe(Buffer.byteLength(text));
  expect(bytes.paths).toBe(Buffer.byteLength('packages/shop/src/entry-{0..21}.ts: '));
  expect(bytes.signatures).toBe(Buffer.byteLength('export function entry{N}(id: string): Entity\n'));
});

it('el desglose suma la mediana y el volcado conserva cada rendered exacto', async () => {
  const repo = fileURLToPath(new URL('../../', import.meta.url));
  const cases = loadCases(readFileSync(new URL('../ctx-gold/cases.jsonl', import.meta.url), 'utf8'));
  const calibration = cases.find((c) => c.split === 'calibration');
  const validation = cases.find((c) => c.split === 'validation');
  if (!calibration || !validation) throw new Error('Split ausente');
  const dump = mkdtempSync(join(tmpdir(), 'foker-ctx-gold-dump-'));
  const dir = join(dump, 'rendered');
  vi.stubEnv('FOKER_CTX_GOLD_DUMP', dir);
  try {
    const report = await evaluateContext([calibration, validation], repo);
    expect(readdirSync(dir).sort()).toEqual([`${calibration.id}.txt`, `${validation.id}.txt`].sort());
    for (const row of report.rows) {
      expect(readFileSync(join(dir, `${row.id}.txt`), 'utf8')).toBe(row.rendered);
    }
    for (const metrics of [report, report.splits['calibration'], report.splits['validation']]) {
      if (!metrics) throw new Error('Métricas ausentes');
      expect(metrics.bytes_at_median?.case_ids.length).toBe(metrics.cases);
      expect(Object.values(metrics.bytes_at_median?.parts ?? {}).reduce((sum, bytes) => sum + bytes, 0)).toBe(
        metrics.median_rendered_bytes,
      );
    }
    for (const row of report.rows) {
      expect(Object.values(row.bytes).reduce((sum, bytes) => sum + bytes, 0)).toBe(row.rendered_bytes);
      expect(row.rendered_bytes).toBe(Buffer.byteLength(row.rendered));
    }
  } finally {
    vi.unstubAllEnvs();
    rmSync(dump, { recursive: true, force: true });
  }
});

it('rechaza ids que permitirían salir del directorio de volcado', async () => {
  vi.stubEnv('FOKER_CTX_GOLD_DUMP', join(tmpdir(), 'foker-ctx-gold-unsafe'));
  try {
    await expect(
      evaluateContext(
        [{ id: '../escape', fixture: 'fixture-a', task: 'fix', split: 'calibration', gold_modified: ['a.ts'] }],
        fileURLToPath(new URL('../../', import.meta.url)),
      ),
    ).rejects.toThrow('Id inválido para FOKER_CTX_GOLD_DUMP');
  } finally {
    vi.unstubAllEnvs();
  }
});

it('el flujo begin deriva alcance, usa taskScope y mide cobertura de alcance', async () => {
  const repo = fileURLToPath(new URL('../../', import.meta.url));
  const cases = loadCases(readFileSync(new URL('../ctx-gold/cases.jsonl', import.meta.url), 'utf8'));
  const item = cases.find((c) => c.id === 'a-02');
  if (!item) throw new Error('Caso ausente');
  const report = await evaluateContext([item], repo);
  const flow = report.rows[0]?.flow;
  if (!flow) throw new Error('Flujo ausente');
  expect(flow.scope_error).toBe(false);
  expect(flow.scope.length).toBeGreaterThan(0);
  expect(flow.scope.every((glob) => glob.endsWith('/**'))).toBe(true);
  expect(flow.scope_coverage).toBeGreaterThanOrEqual(0);
  expect(flow.scope_coverage).toBeLessThanOrEqual(1);
  expect(flow.rendered_tokens).toBeGreaterThan(0);
  expect(report.flow?.recall).toBe(flow.recall);
  expect(report.flow?.scope_errors).toBe(0);
});
