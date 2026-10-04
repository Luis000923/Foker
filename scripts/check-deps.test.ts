import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cargoDependencies, checkDependencies, closure, importSpecifiers, TS_GRAPH } from './check-deps.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

let root: string;

function write(path: string, content: string): void {
  const full = join(root, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}

function pkg(dir: string, name: string, deps: string[] = []): void {
  const dependencies = Object.fromEntries(deps.map((d) => [d, 'workspace:*']));
  write(`packages/${dir}/package.json`, JSON.stringify({ name, dependencies }));
}

function crate(dir: string, deps: string[] = []): void {
  const lines = deps.map((d) => `${d}.workspace = true`).join('\n');
  write(`crates/${dir}/Cargo.toml`, `[package]\nname = "${dir}"\n\n[dependencies]\n${lines}\n`);
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'foker-deps-'));
  pkg('schemas', '@foker/schemas');
  pkg('policy', '@foker/policy', ['@foker/schemas']);
  pkg('engine', '@foker/engine', ['@foker/policy', '@foker/schemas']);
  pkg('mcp', '@foker/mcp', ['@foker/engine']);
  crate('foker-map');
  crate('foker-context', ['foker-map']);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('REQ-REPO-001', () => {
  it('el repositorio real cumple el grafo', () => {
    expect(checkDependencies(repoRoot)).toEqual([]);
  });

  it('acepta imports permitidos, incluidos los transitivos', () => {
    write('packages/engine/src/index.ts', "import { x } from '@foker/schemas';\nexport * from './a.js';\n");
    write('packages/mcp/src/index.ts', "import { e } from '@foker/engine';\n");
    expect(checkDependencies(root)).toEqual([]);
  });

  it('rechaza un import hacia la derecha del grafo', () => {
    write('packages/policy/src/index.ts', "import { run } from '@foker/engine';\n");
    expect(checkDependencies(root)).toEqual([
      'packages/policy/src/index.ts: "@foker/policy" no puede importar "@foker/engine"',
    ]);
  });

  it('rechaza una dependencia prohibida en package.json', () => {
    pkg('schemas', '@foker/schemas', ['@foker/policy']);
    expect(checkDependencies(root)).toEqual([
      'packages/schemas/package.json: "@foker/schemas" no puede depender de "@foker/policy"',
    ]);
  });

  it('rechaza imports permitidos pero no declarados', () => {
    write('packages/mcp/src/x.ts', "const p = await import('@foker/policy');\n");
    expect(checkDependencies(root)).toEqual([
      'packages/mcp/src/x.ts: importa "@foker/policy" sin declararlo en package.json',
    ]);
  });

  it('rechaza imports relativos que salen del paquete', () => {
    write('packages/policy/src/index.ts', "import { x } from '../../engine/src/index.js';\n");
    expect(checkDependencies(root)).toEqual([
      'packages/policy/src/index.ts: import relativo "../../engine/src/index.js" sale del paquete "@foker/policy"',
    ]);
  });

  it('rechaza paquetes fuera del grafo', () => {
    pkg('extra', '@foker/extra');
    expect(checkDependencies(root)).toEqual([
      'packages/extra/package.json: paquete "@foker/extra" no figura en el grafo de FOKER-SPEC §4.2',
    ]);
  });

  it('verifica benchmarks, imports transitivos y dependencias prohibidas', () => {
    write(
      'benchmarks/package.json',
      JSON.stringify({
        name: '@foker/benchmarks',
        dependencies: { '@foker/engine': 'workspace:*', '@foker/policy': 'workspace:*' },
      }),
    );
    write('benchmarks/src/check.ts', "import { runCheck } from '@foker/policy';\n");
    expect(checkDependencies(root)).toEqual([]);
    write('benchmarks/src/check.ts', "import { mcp } from '@foker/mcp';\n");
    expect(checkDependencies(root)[0]).toContain('no puede importar');
    write(
      'benchmarks/package.json',
      JSON.stringify({ name: '@foker/benchmarks', dependencies: { '@foker/mcp': 'workspace:*' } }),
    );
    expect(checkDependencies(root)[0]).toContain('no puede depender');
  });

  it('rechaza crates que dependen hacia la derecha', () => {
    crate('foker-map', ['foker-context']);
    expect(checkDependencies(root)).toEqual([
      'crates/foker-map/Cargo.toml: "foker-map" no puede depender de "foker-context"',
    ]);
  });

  it('ignora imports dentro de comentarios', () => {
    write('packages/policy/src/index.ts', "// import { run } from '@foker/engine';\n/* require('@foker/mcp') */\n");
    expect(checkDependencies(root)).toEqual([]);
  });
});

describe('utilidades', () => {
  it('el grafo permitido es acíclico y transitivo', () => {
    const reach = closure(TS_GRAPH);
    expect([...(reach.get('foker') ?? [])].sort()).toEqual([
      '@foker/core',
      '@foker/engine',
      '@foker/integrations',
      '@foker/mcp',
      '@foker/policy',
      '@foker/schemas',
    ]);
    expect(() => closure({ a: ['b'], b: ['a'] })).toThrow(/ciclo/);
  });

  it('extrae especificadores de todas las formas de import', () => {
    const source = [
      "import a from 'a';",
      "import type { B } from 'b';",
      "export * from 'c';",
      "import 'd';",
      "const e = await import('e');",
      "const f = require('f');",
      "const url = 'https://x.dev'; // import 'g'",
    ].join('\n');
    expect(importSpecifiers(source).sort()).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });

  it('lee dependencias de Cargo.toml en sus distintas formas', () => {
    const toml = [
      '[dependencies]',
      'foker-map.workspace = true',
      'serde = { version = "1" }',
      '',
      '[dev-dependencies]',
      'insta = "1"',
      '',
      '[dependencies.foker-context]',
      'path = "../foker-context"',
    ].join('\n');
    expect(cargoDependencies(toml)).toEqual(['foker-map', 'serde', 'insta', 'foker-context']);
  });
});
