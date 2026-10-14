import { readFileSync } from 'node:fs';

/** Nombre corto de cada documento de esquema publicado por `@foker/schemas`. */
export const SCHEMA_NAMES = [
  'common',
  'project-map',
  'context-pack',
  'task',
  'foker-config',
  'foker-skill',
  'foker-md',
  'design-tokens',
  'cli-output',
  'benchmark-result',
  'benchmark-manifest',
  'mcp-tools',
] as const;

export type SchemaName = (typeof SCHEMA_NAMES)[number];

/** Esquema JSON tal como se lee del disco. */
export type JsonSchema = { [key: string]: unknown };

const FILES: Record<SchemaName, string> = {
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

/** Base de los `$id`: `https://foker.dev/schemas/<nombre>/v1.json`. */
export const SCHEMA_BASE_URL = 'https://foker.dev/schemas/';

/** `$id` de un esquema. */
export function schemaId(name: SchemaName): string {
  return `${SCHEMA_BASE_URL}${name}/v1.json`;
}

/** Directorio con los `.json`; funciona igual desde `src/` (tests) y desde `dist/` (paquete publicado). */
const SCHEMAS_DIR = new URL('../schemas/', import.meta.url);

const cache = new Map<SchemaName, JsonSchema>();

/** Devuelve una copia profunda del esquema, para que nadie mute la caché compartida. */
export function getSchema(name: SchemaName): JsonSchema {
  let schema = cache.get(name);
  if (!schema) {
    schema = JSON.parse(readFileSync(new URL(FILES[name], SCHEMAS_DIR), 'utf8')) as JsonSchema;
    if (schema['$id'] !== schemaId(name)) {
      throw new Error(`${FILES[name]}: $id ${String(schema['$id'])} no coincide con ${schemaId(name)}`);
    }
    cache.set(name, schema);
  }
  return structuredClone(schema);
}

/** Nombre de archivo de un esquema dentro de `schemas/`. */
export function schemaFile(name: SchemaName): string {
  return FILES[name];
}
