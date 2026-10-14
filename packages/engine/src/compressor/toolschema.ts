// Derivado, con cambios, de JuliusBrussee/caveman (engine/compressors/toolschema.go,
// Apache-2.0, Copyright 2026 Julius Brussee). Reescrito en TypeScript con otra estructura;
// ver NOTICE y docs/adr/ADR-040-compresor-catalogo-herramientas.md. Cambios: sin recuperación
// por CCR, el JSON se reserializa (no conserva bytes ni `cache_control`) y la lista de
// marcadores de restricción es propia.

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };

/** Metadatos de esquema que no cambian cómo se construye una llamada. */
const DROPPED = new Set(['examples', 'example', '$comment', 'title', '$schema']);
/** Significado de construcción de argumentos: se conserva sin tocar. */
const VERBATIM = new Set(['enum', 'required', 'default', 'const']);
/** Objetos cuyas claves son nombres definidos por el usuario (una propiedad «title» no es metadato). */
const NAME_MAPS = new Set([
  'properties',
  '$defs',
  'definitions',
  'patternProperties',
  'dependentSchemas',
  'dependentRequired',
  'dependencies',
]);
/** Campos de una herramienta cuyo valor es un JSON Schema. */
const SCHEMA_FIELDS = new Set(['input_schema', 'inputSchema', 'parameters']);
/** Campos que envuelven otra herramienta (forma de función de OpenAI). */
const NESTED_TOOL_FIELDS = new Set(['function']);

const LEAD_MAX = 80;
/** Por debajo de este tamaño la descripción se conserva entera. */
const WHOLE_MAX = LEAD_MAX * 2;

/** Marcadores de restricción. Sobre-conservar es barato; perder una restricción provoca llamadas inválidas. */
const CONSTRAINT = new RegExp(
  `\\b(?:${[
    'must',
    'cannot',
    "can't",
    'shall',
    'requir\\w*',
    'reject\\w*',
    'disallow\\w*',
    'forbidden',
    'invalid',
    'not (?:allowed|permitted)',
    'exactly one',
    'one of',
    'at (?:least|most)',
    'mutually exclusive',
    'only',
    'unique',
    'case[- ]?sensitive',
    'max\\w*',
    'min\\w*',
    'range',
    'between',
    '(?:greater|less|more|fewer) than',
    'no (?:more|less) than',
    'over',
    'above',
    'below',
    'under',
    'beyond',
    'exceed\\w*',
    'format\\w*',
    'iso[- ]?\\d*',
    'rfc[- ]?\\d*',
    'absolute',
  ].join('|')})\\b`,
  'i',
);

const ABBREVIATIONS = new Set(['e.g', 'i.e', 'etc', 'vs', 'cf', 'al', 'approx', 'no', 'fig', 'dr', 'mr', 'ms', 'inc']);

/** Parte en frases: punto + espacio + mayúscula, salvo abreviaturas e iniciales. */
function sentences(text: string): string[] {
  const out: string[] = [];
  let start = 0;
  for (const m of text.matchAll(/\.(\s+)(?=\p{Lu})/gu)) {
    const end = (m.index ?? 0) + 1;
    const word = /[A-Za-z.]*$/.exec(text.slice(0, end - 1))?.[0].toLowerCase() ?? '';
    if (word.length === 1 || word.includes('.') || ABBREVIATIONS.has(word)) continue;
    out.push(text.slice(start, end).trim());
    start = end + (m[1]?.length ?? 0);
  }
  const rest = text.slice(start).trim();
  if (rest) out.push(rest);
  return out;
}

function capLead(text: string): string {
  const chars = [...text];
  if (chars.length <= LEAD_MAX) return text;
  const cut = chars.slice(0, LEAD_MAX).join('');
  const space = cut.lastIndexOf(' ');
  return (space > LEAD_MAX / 2 ? cut.slice(0, space) : cut).trimEnd();
}

/** Descripción corta entera; larga: primera frase sin restricción (acotada) más cada frase con restricción. */
export function reduceDescription(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= WHOLE_MAX) return trimmed;
  let leadTaken = false;
  const kept: string[] = [];
  for (const sentence of sentences(trimmed)) {
    if (CONSTRAINT.test(sentence)) kept.push(sentence);
    else if (!leadTaken) {
      kept.push(capLead(sentence));
      leadTaken = true;
    }
  }
  return kept.join(' ');
}

const isObject = (v: Json | undefined): v is JsonObject => typeof v === 'object' && v !== null && !Array.isArray(v);

function schema(node: Json, userNames = false): Json {
  if (Array.isArray(node)) return node.map((n) => schema(n));
  if (!isObject(node)) return node;
  const out: JsonObject = {};
  for (const [key, value] of Object.entries(node)) {
    if (userNames) out[key] = schema(value);
    else if (DROPPED.has(key)) continue;
    else if (key === 'description') out[key] = typeof value === 'string' ? reduceDescription(value) : schema(value);
    else if (VERBATIM.has(key)) out[key] = value;
    else out[key] = schema(value, NAME_MAPS.has(key));
  }
  return out;
}

function tool(node: Json): Json {
  if (Array.isArray(node)) return node.map(tool);
  if (!isObject(node)) return node;
  const out: JsonObject = { ...node };
  for (const [key, value] of Object.entries(node)) {
    if (SCHEMA_FIELDS.has(key)) out[key] = schema(value);
    else if (NESTED_TOOL_FIELDS.has(key)) out[key] = tool(value);
    else if (key === 'description' && typeof value === 'string') out[key] = reduceDescription(value);
  }
  return out;
}

export interface ToolCatalogResult {
  text: string;
  /** `false` si la entrada no era un único documento JSON: se devuelve intacta. */
  compressed: boolean;
  originalChars: number;
  shrunkChars: number;
}

/**
 * Comprime un catálogo de herramientas MCP/OpenAI (o un JSON Schema): quita metadatos, reduce
 * descripciones largas conservando las frases con restricciones y deja intactos nombres, tipos,
 * `enum`, `required`, `default`, `const` y `$ref`. Es con pérdida y visible para el modelo: no
 * garantiza que el modelo elija la misma herramienta. Falla abierto: ante un error devuelve el texto.
 */
export function shrinkToolCatalog(text: string): ToolCatalogResult {
  const original = text.length;
  try {
    const parsed = JSON.parse(text) as Json;
    const body = isObject(parsed)
      ? 'tools' in parsed
        ? { ...parsed, tools: tool(parsed['tools'] as Json) }
        : 'name' in parsed || [...SCHEMA_FIELDS, ...NESTED_TOOL_FIELDS].some((k) => k in parsed)
          ? tool(parsed)
          : schema(parsed)
      : Array.isArray(parsed)
        ? tool(parsed)
        : parsed;
    const out = JSON.stringify(body);
    if (out.length < original) return { text: out, compressed: true, originalChars: original, shrunkChars: out.length };
  } catch {
    // entrada no válida: pasa sin cambios
  }
  return { text, compressed: false, originalChars: original, shrunkChars: original };
}
