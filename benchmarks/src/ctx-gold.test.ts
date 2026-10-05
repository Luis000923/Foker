import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  evaluateContext,
  flowPack,
  type GoldCase,
  goldFull,
  loadCases,
  renderedBytes,
  renderedTokens,
} from './ctx-gold.js';

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

describe('flowPack registra los rechazos de begin sin abortar (revisión Codex, ADR-032)', () => {
  const item: GoldCase = {
    id: 'x',
    fixture: 'fixture-a',
    task: 't',
    gold_modified: ['README.md'],
    split: 'calibration',
  };
  const preliminary = (files: { id: string; level: string; score: number; reasons: string[] }[]) => ({
    json: JSON.stringify({ files: files.map((f) => ({ ...f, tokens: 1 })) }),
  });
  const engine = (build: () => Promise<never>) => ({ buildContext: build });
  it('alcance vacío: FKR-INP-001, sin pack definitivo', async () => {
    const build = vi.fn();
    const flow = await flowPack(engine(build), { task: 't' }, preliminary([]), item);
    expect(flow).toMatchObject({ scope_error: true, error: 'FKR-INP-001', recall: 0, scope_coverage: 0 });
    expect(build).not.toHaveBeenCalled();
  });
  it('un alcance que intersecta rutas protegidas se rechaza: FKR-POL-002', async () => {
    const build = vi.fn();
    const flow = await flowPack(
      engine(build),
      { task: 't' },
      preliminary([{ id: 'foker/rules.md', level: 'L3', score: 1, reasons: ['ANCHOR'] }]),
      item,
    );
    expect(flow.scope).toEqual(['foker/**']);
    expect(flow).toMatchObject({ scope_error: true, error: 'FKR-POL-002', recall: 0, scope_coverage: 0 });
    expect(build).not.toHaveBeenCalled();
  });
  it('un archivo de la raíz ya no deriva ** y begin lo acepta', async () => {
    const flow = await flowPack(
      engine(() => Promise.reject(Object.assign(new Error('x'), { code: 'FKR-CTX-001' }))),
      { task: 't' },
      preliminary([{ id: 'README.md', level: 'L3', score: 1, reasons: ['ANCHOR'] }]),
      item,
    );
    expect(flow).toMatchObject({ scope: ['README.md'], scope_error: false, scope_coverage: 1 });
  });
  it('si el pack definitivo falla se registra context_error con recall 0', async () => {
    const error = Object.assign(new Error('presupuesto'), { code: 'FKR-CTX-001' });
    const flow = await flowPack(
      engine(() => Promise.reject(error)),
      { task: 't' },
      preliminary([{ id: 'docs/README.md', level: 'L3', score: 1, reasons: ['ANCHOR'] }]),
      { ...item, gold_modified: ['docs/README.md'] },
    );
    expect(flow).toMatchObject({ scope_error: false, error: 'FKR-CTX-001', recall: 0, scope_coverage: 1 });
  });
  it('errores ajenos a Foker se propagan', async () => {
    await expect(
      flowPack(
        engine(() => Promise.reject(new TypeError('bug'))),
        { task: 't' },
        preliminary([{ id: 'docs/a.md', level: 'L3', score: 1, reasons: ['ANCHOR'] }]),
        item,
      ),
    ).rejects.toThrow('bug');
  });
});

it('goldFull reconoce contenido completo en L3, L2 individual y L2 agrupado (ADR-034)', () => {
  const root = mkdtempSync(join(tmpdir(), 'foker-gold-full-'));
  try {
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'src/a.ts'), 'export const a = 1;\n\nexport function f() {}\n');
    writeFileSync(join(root, 'src/b.ts'), 'export const b = 2;\n');
    const a = 'export const a = 1;\n\nexport function f() {}\n';
    const l3 = `<foker:file id="src/a.ts" level="L3" trust="repository-content">\n${a}\n</foker:file>\n`;
    const grouped = `<foker:files level="L2" trust="repository-content">\nsrc/a.ts\n${a
      .split('\n')
      .map((l) => `  ${l}`)
      .join('\n')}\nsrc/b.ts\n  export const b: number\n</foker:files>\n`;
    expect(goldFull(l3, root, ['src/a.ts'])).toBe(1);
    expect(goldFull(l3.replace('L3', 'L2'), root, ['src/a.ts'])).toBe(1);
    expect(goldFull(grouped, root, ['src/a.ts', 'src/b.ts'])).toBe(0.5);
    expect(goldFull(grouped, root, ['src/nuevo.ts'])).toBe(0);
    // Revisión Codex: contenido citado dentro del bloque de otro archivo no cuenta.
    const quoted = `<foker:file id="src/c.ts" level="L3" trust="repository-content">\nsrc/a.ts\n${a
      .split('\n')
      .map((l) => `  ${l}`)
      .join('\n')}\n</foker:file>\n`;
    expect(goldFull(quoted, root, ['src/a.ts'])).toBe(0);
    // Con explain, la cabecera diagnóstica no impide reconocer el contenido.
    const explained = `<foker:file id="src/a.ts" level="L3" trust="repository-content">\n### src/a.ts  [L3 · score 1]\n${a}\n</foker:file>\n`;
    expect(goldFull(explained, root, ['src/a.ts'])).toBe(1);
    // Segunda revisión: un archivo que empieza por `### ` literal no pierde esa línea.
    writeFileSync(join(root, 'src/md.ts'), '### literal\nexport const m = 1;\n');
    const literal = `<foker:file id="src/md.ts" level="L2" trust="repository-content">\n### literal\nexport const m = 1;\n\n</foker:file>\n`;
    expect(goldFull(literal, root, ['src/md.ts'])).toBe(1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
