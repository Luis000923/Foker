import { getSchema, type JsonSchema, SCHEMA_BASE_URL, SCHEMA_NAMES, type SchemaName, schemaId } from './registry.js';

const documents = new Map<string, JsonSchema>();

const ANNOTATIONS = new Set(['title', 'description', 'default', 'examples', '$comment', 'deprecated']);

function documentById(id: string): JsonSchema {
  let doc = documents.get(id);
  if (!doc) {
    const name = SCHEMA_NAMES.find((n) => schemaId(n) === id);
    if (!name) throw new Error(`$ref a un documento desconocido: ${id}`);
    doc = getSchema(name);
    documents.set(id, doc);
  }
  return doc;
}

function pointer(doc: JsonSchema, fragment: string): unknown {
  if (fragment === '' || fragment === '/') return doc;
  let node: unknown = doc;
  for (const raw of fragment.replace(/^\//, '').split('/')) {
    const key = decodeURIComponent(raw).replace(/~1/g, '/').replace(/~0/g, '~');
    if (node === null || typeof node !== 'object' || !(key in node)) {
      throw new Error(`fragmento inexistente: #${fragment}`);
    }
    node = (node as Record<string, unknown>)[key];
  }
  return node;
}

/** Palabras clave cuyo valor es un mapa nombre → esquema (sus claves no son palabras clave). */
const SCHEMA_MAPS = new Set(['properties', 'patternProperties', '$defs', 'dependentSchemas']);

function inline(node: unknown, base: string, stack: string[]): unknown {
  if (Array.isArray(node)) return node.map((n) => inline(n, base, stack));
  if (node === null || typeof node !== 'object') return node;
  const obj = node as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === '$ref' || key === '$id' || key === '$schema') continue;
    result[key] = SCHEMA_MAPS.has(key) ? inlineMap(value, base, stack) : inline(value, base, stack);
  }
  const ref = obj['$ref'];
  if (typeof ref !== 'string') return result;

  const target = new URL(ref, base);
  const fragment = target.hash.replace(/^#/, '');
  target.hash = '';
  const docId = target.href;
  const key = `${docId}#${fragment}`;
  if (stack.includes(key)) throw new Error(`$ref cíclico: ${[...stack, key].join(' → ')}`);
  const resolved = inline(pointer(documentById(docId), fragment), docId, [...stack, key]) as Record<string, unknown>;
  // Hermanos que solo anotan se fusionan; cualquier otro conserva la semántica de 2020-12 mediante allOf.
  if (Object.keys(result).every((k) => ANNOTATIONS.has(k))) return { ...resolved, ...result };
  return { ...result, allOf: [resolved] };
}

function inlineMap(map: unknown, base: string, stack: string[]): unknown {
  if (map === null || typeof map !== 'object') return map;
  return Object.fromEntries(Object.entries(map).map(([name, schema]) => [name, inline(schema, base, stack)]));
}

/**
 * Devuelve un esquema autocontenido (sin `$ref`) a partir de un esquema de Foker o de un fragmento.
 * Lo necesitan los clientes MCP, que no resuelven referencias externas.
 */
export function bundleSchema(name: SchemaName, fragment = ''): JsonSchema {
  const id = schemaId(name);
  const resolved = inline(pointer(documentById(id), fragment), id, [`${id}#${fragment}`]) as JsonSchema;
  if (fragment === '') {
    delete resolved['$defs'];
    delete resolved['tools'];
    delete resolved['foker_mcp_api'];
  }
  return { $schema: 'https://json-schema.org/draft/2020-12/schema', ...resolved };
}

/** Anotaciones MCP de una herramienta. */
export interface ToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

/** Herramienta MCP con esquemas autocontenidos, lista para `tools/list`. */
export interface McpToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  annotations: ToolAnnotations;
  /** Timeout de la herramienta en segundos (FOKER-SPEC §10.3). */
  timeoutS: number;
}

interface RawTool {
  name: string;
  title: string;
  description: string;
  annotations: ToolAnnotations;
  timeout_s: number;
}

/** Versión de la API MCP de Foker (`foker_mcp_api`, FOKER-SPEC §17). */
export function mcpApiVersion(): number {
  return getSchema('mcp-tools')['foker_mcp_api'] as number;
}

/** Las 8 herramientas MCP en orden alfabético, con esquemas autocontenidos. */
export function mcpTools(): McpToolDefinition[] {
  const tools = getSchema('mcp-tools')['tools'] as RawTool[];
  return tools.map((tool, i) => ({
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: bundleSchema('mcp-tools', `/tools/${i}/inputSchema`),
    outputSchema: bundleSchema('mcp-tools', `/tools/${i}/outputSchema`),
    annotations: tool.annotations,
    timeoutS: tool.timeout_s,
  }));
}

export { SCHEMA_BASE_URL };
