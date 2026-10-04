import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Engine, FokerError, openEngine } from './index.js';

const fixture = new URL('../../../fixtures/monorepo-pnpm/', import.meta.url);
const expectedHash = readFileSync(new URL('expected/content_hash.txt', fixture), 'utf8').trim();

let root: string;
let engine: Engine;

beforeAll(async () => {
  // Copia: el motor escribe .foker/ y los fixtures no deben modificarse.
  root = mkdtempSync(join(tmpdir(), 'foker-engine-'));
  cpSync(fixture, root, { recursive: true, filter: (src) => !src.includes('/expected') });
  engine = await openEngine(root);
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('FokerEngine desde Node', () => {
  it('construye el mismo mapa que el dorado de Rust (REQ-MAP-002)', async () => {
    expect(engine.status().files).toBe(0);
    const report = await engine.refresh();
    expect(report.rebuilt).toBe(true);
    expect(report.contentHash).toBe(expectedHash);
    expect(report.added).toHaveLength(13);
    const again = await engine.refresh();
    expect(again.unchanged).toBe(true);
    expect(engine.status()).toMatchObject({ contentHash: expectedHash, files: 13, staleFiles: 0, schemaVersion: 1 });
  });

  it('consulta búsqueda, archivo, símbolo e impacto', () => {
    expect(engine.search({ query: 'formatPrice', limit: 1 })[0]).toMatchObject({
      id: 'apps/web/src/lib/format.ts#formatPrice',
      kind: 'symbol',
      score: 1,
    });
    const info = engine.fileInfo('./packages/ui/src/button.tsx');
    expect(info?.importedBy).toEqual(['packages/ui/src/index.ts']);
    expect(engine.fileInfo('no/existe.ts')).toBeNull();
    expect(engine.symbolInfo('packages/core/src/cart/cart.ts#Cart.add')).toMatchObject({
      kind: 'method',
      parent: 'packages/core/src/cart/cart.ts#Cart',
      file: 'packages/core/src/cart/cart.ts',
    });
    const impact = engine.impact({ files: ['packages/core/src/cart/types.ts'], depth: 1 });
    expect(impact.nodes.map((n) => n.id)).toEqual([
      'packages/core/src/cart/types.ts',
      'packages/core/src/cart/cart.ts',
      'packages/core/src/index.ts',
    ]);
  });

  it('valida entradas con FKR-INP-001 y rutas con FKR-POL-001', () => {
    expect(() => engine.search({ query: '' })).toThrowError(expect.objectContaining({ code: 'FKR-INP-001' }));
    expect(() => engine.search({ query: 'x', limit: 51 })).toThrowError(
      expect.objectContaining({ code: 'FKR-INP-001' }),
    );
    expect(() => engine.impact({})).toThrowError(expect.objectContaining({ code: 'FKR-INP-001' }));
    expect(() => engine.impact({ files: ['a.ts'], direction: 'sideways' })).toThrowError(
      expect.objectContaining({ code: 'FKR-INP-001' }),
    );
    expect(() => engine.fileInfo('../fuera.ts')).toThrowError(expect.objectContaining({ code: 'FKR-POL-001' }));
  });

  it('guarda, reabre y detecta un mapa corrupto (FKR-MAP-005)', async () => {
    const saved = await engine.save();
    expect(saved).toMatchObject({ path: '.foker/project-map.json', contentHash: expectedHash });
    const reopened = await openEngine(root);
    expect(reopened.status().contentHash).toBe(expectedHash);
    expect(await reopened.checkStale()).toBe(0);
    expect(JSON.parse(await reopened.exportMapJson()).content_hash).toBe(expectedHash);

    writeFileSync(join(root, '.foker', 'project-map.json'), '{ roto');
    const corrupt = await openEngine(root);
    expect(corrupt.loadDiagnostics().map((d) => d.code)).toEqual(['FKR-MAP-005']);
    await expect(corrupt.exportMapJson()).rejects.toMatchObject({ code: 'FKR-INP-001' });
  });

  it('rechaza roots inexistentes con FKR-CFG-002', async () => {
    const error = await openEngine(join(root, 'no-existe')).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FokerError);
    expect(error).toMatchObject({ code: 'FKR-CFG-002', recoverable: false });
  });
});
