// Genera artefactos derivados de los esquemas (FKR-004):
//   - src/generated/types.ts: tipos TypeScript de todos los documentos y herramientas MCP.
//   - ../core/src/error-codes.generated.ts: tabla de recuperabilidad para @foker/core (FOKER-SPEC §7.4).
//
// Uso: node scripts/generate.mjs [--check]
// Con --check no escribe: sale con código 1 si algún archivo generado está desactualizado.

import { readFileSync, writeFileSync } from 'node:fs';
import './gen-config-docs.mjs';
import { compile } from 'json-schema-to-typescript';

const pkgDir = new URL('../', import.meta.url);
const schemasDir = new URL('schemas/', pkgDir);
const check = process.argv.includes('--check');

const files = {
  common: 'common.schema.json',
  'project-map': 'project-map.schema.json',
  'context-pack': 'context-pack.schema.json',
  task: 'task.schema.json',
  'foker-config': 'foker-config.schema.json',
  'foker-skill': 'foker-skill.schema.json',
  'foker-md': 'foker-md.schema.json',
  'design-tokens': 'design-tokens.schema.json',
  'cli-output': 'cli-output.schema.json',
  'benchmark-result': 'benchmark-result.schema.json',
  'benchmark-manifest': 'benchmark-manifest.schema.json',
  'mcp-tools': 'mcp-tools.json',
};

/** Nombres TypeScript de cada documento y de los $defs que chocarían con globales (File, Symbol, Event…). */
const TYPE_NAMES = {
  'project-map': { '': 'ProjectMap', file: 'MapFile', symbol: 'MapSymbol', edge: 'MapEdge', package: 'MapPackage' },
  'context-pack': {
    '': 'ContextPack',
    request: 'NormalizedContextRequest',
    section: 'PackSection',
    level: 'RenderLevel',
  },
  task: {
    '': 'TaskRecord',
    event: 'TaskEvent',
    evidence: 'TaskEvidence',
    state: 'TaskState',
    scope: 'TaskScope',
    change: 'TaskChange',
    approval: 'TaskApproval',
    baseline: 'TaskBaseline',
  },
  'foker-config': { '': 'FokerConfig', check: 'CheckConfig', policy: 'PolicyConfig' },
  'foker-skill': { '': 'FokerSkill' },
  'foker-md': { '': 'FokerMdFrontmatter' },
  'design-tokens': { '': 'DesignTokens' },
  'cli-output': { '': 'CliOutput' },
  'benchmark-result': { '': 'BenchmarkResult' },
  'benchmark-manifest': { '': 'BenchmarkManifest' },
  common: {},
  'mcp-tools': {},
};

const pascal = (/** @type {string} */ key) => key.replace(/(^|[-_])([a-z])/g, (_, __, c) => c.toUpperCase());

/**
 * Prepara un documento para el generador: títulos = nombres TS y sin `description` junto a `$ref`
 * (el generador crearía tipos duplicados como `Scope1`).
 * @param {keyof typeof files} name
 * @param {any} schema
 */
function prepare(name, schema) {
  const names = /** @type {Record<string, string>} */ (TYPE_NAMES[name]);
  if (names['']) schema.title = names[''];
  for (const [key, def] of Object.entries(schema.$defs ?? {})) def.title = names[key] ?? pascal(key);
  /** @param {any} node */
  const strip = (node) => {
    if (Array.isArray(node)) return node.forEach(strip);
    if (node === null || typeof node !== 'object') return;
    if (typeof node.$ref === 'string') delete node.description;
    Object.values(node).forEach(strip);
  };
  strip(schema);
  return schema;
}

/** @param {string} url */
function readById(url) {
  const match = /^https:\/\/foker\.dev\/schemas\/([a-z-]+)\/v1\.json$/.exec(url.split('#')[0] ?? '');
  const name = /** @type {keyof typeof files | undefined} */ (match?.[1]);
  const file = name ? files[name] : undefined;
  if (!name || !file) throw new Error(`esquema desconocido: ${url}`);
  return JSON.stringify(prepare(name, JSON.parse(readFileSync(new URL(file, schemasDir), 'utf8'))));
}

const mcp = JSON.parse(readById('https://foker.dev/schemas/mcp-tools/v1.json'));
const ref = (/** @type {string} */ name, fragment = '') => ({
  $ref: `https://foker.dev/schemas/${name}/v1.json${fragment}`,
});

/** Raíz sintética: un único archivo de tipos sin duplicados. */
const root = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://foker.dev/schemas/types/v1.json',
  title: 'FokerSchemaTypes',
  type: 'object',
  additionalProperties: false,
  properties: {
    projectMap: ref('project-map'),
    contextPack: ref('context-pack'),
    contextRequest: ref('context-pack', '#/$defs/contextRequest'),
    taskRecord: ref('task'),
    taskEvent: ref('task', '#/$defs/event'),
    taskEvidence: ref('task', '#/$defs/evidence'),
    fokerConfig: ref('foker-config'),
    fokerSkill: ref('foker-skill'),
    fokerMd: ref('foker-md'),
    designTokens: ref('design-tokens'),
    cliOutput: ref('cli-output'),
    benchmarkResult: ref('benchmark-result'),
    benchmarkManifest: ref('benchmark-manifest'),
    ...Object.fromEntries(
      mcp.tools.flatMap((/** @type {{name: string}} */ tool, /** @type {number} */ i) => [
        [`${tool.name}_input`, ref('mcp-tools', `#/tools/${i}/inputSchema`)],
        [`${tool.name}_output`, ref('mcp-tools', `#/tools/${i}/outputSchema`)],
      ]),
    ),
  },
};

const banner = '/* Generado por packages/schemas/scripts/generate.mjs desde schemas/*.json. No editar. */';

const types = await compile(/** @type {any} */ (root), 'FokerSchemaTypes', {
  bannerComment: banner,
  additionalProperties: false,
  unreachableDefinitions: false,
  strictIndexSignatures: true,
  format: false,
  $refOptions: {
    resolve: {
      foker: {
        order: 1,
        canRead: /^https:\/\/foker\.dev\//,
        read: (/** @type {{url: string}} */ f) => readById(f.url),
      },
      http: false,
      https: false,
    },
  },
});

const codes = JSON.parse(readFileSync(new URL('data/error-codes.json', pkgDir), 'utf8')).codes;
const errorTable = [
  banner.replace('schemas/*.json', 'packages/schemas/data/error-codes.json'),
  '',
  '/** Códigos de error de FOKER-SPEC §18 (sin diagnósticos 1xx) y si el agente puede recuperarse. */',
  'export const ERROR_RECOVERABLE = {',
  ...codes
    .filter((/** @type {{recoverable: string}} */ c) => c.recoverable !== 'diagnostic')
    .map(
      (/** @type {{code: string, recoverable: string}} */ c) =>
        `  '${c.code}': ${c.recoverable === 'yes' || c.recoverable === 'partial'},`,
    ),
  '} as const;',
  '',
  'export type FokerErrorCode = keyof typeof ERROR_RECOVERABLE;',
  '',
].join('\n');

const outputs = [
  [new URL('src/generated/types.ts', pkgDir), types.replace(/[ \t]+$/gm, '')],
  [new URL('../core/src/error-codes.generated.ts', pkgDir), errorTable],
];

let stale = 0;
for (const [url, content] of outputs) {
  let current = '';
  try {
    current = readFileSync(url, 'utf8');
  } catch {}
  if (current === content) continue;
  if (check) {
    console.error(`desactualizado: ${url.pathname}`);
    stale++;
  } else {
    writeFileSync(url, content);
    console.log(`escrito: ${url.pathname}`);
  }
}
if (stale > 0) {
  console.error('Ejecuta: pnpm --filter @foker/schemas run generate');
  process.exit(1);
}
