/** Edición de JSON por punteros, preservando claves y entradas del usuario (REQ-PRJ-002). */

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };

export function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** `["a","b"]` → `/a/b` (RFC 6901). */
export function pointerString(path: readonly string[]): string {
  return path.map((p) => `/${p.replaceAll('~', '~0').replaceAll('/', '~1')}`).join('');
}

export function getAt(root: Json, path: readonly string[]): Json | undefined {
  let node: Json | undefined = root;
  for (const key of path) {
    if (!isObject(node)) return undefined;
    node = node[key];
  }
  return node;
}

/** Fija `value` en `path` creando objetos intermedios. Devuelve `false` si un intermedio no es objeto. */
export function setAt(root: JsonObject, path: readonly string[], value: Json): boolean {
  let node: JsonObject = root;
  for (const key of path.slice(0, -1)) {
    const next = node[key];
    if (next === undefined) node[key] = {};
    else if (!isObject(next)) return false;
    node = node[key] as JsonObject;
  }
  const last = path[path.length - 1];
  if (last === undefined) return false;
  node[last] = value;
  return true;
}

/** Borra `path` y los objetos intermedios que queden vacíos. */
export function deleteAt(root: JsonObject, path: readonly string[]): void {
  const parents: JsonObject[] = [root];
  let node: Json | undefined = root;
  for (const key of path.slice(0, -1)) {
    if (!isObject(node)) return;
    node = node[key];
    if (!isObject(node)) return;
    parents.push(node);
  }
  const last = path[path.length - 1];
  const parent = parents[parents.length - 1];
  if (last === undefined || !parent) return;
  delete parent[last];
  for (let i = parents.length - 1; i > 0; i--) {
    const current = parents[i];
    const key = path[i - 1];
    if (current && key !== undefined && Object.keys(current).length === 0) delete (parents[i - 1] as JsonObject)[key];
    else break;
  }
}

/** Formato estable: 2 espacios y salto de línea final. */
/** Ancho de línea de los formateadores habituales (Biome y Prettier, por defecto). */
const LINE_WIDTH = 80;

/**
 * JSON con sangría 2 como lo dejan Biome y Prettier por defecto: los objetos se expanden y un
 * array de primitivos va en una línea si cabe en 80 columnas. Así `foker sync` no genera archivos
 * que el formateador del propio proyecto rechaza.
 */
export function formatJson(value: Json): string {
  const render = (node: Json, indent: number, used: number): string => {
    if (node === null || typeof node !== 'object') return JSON.stringify(node);
    const pad = ' '.repeat(indent + 2);
    if (Array.isArray(node)) {
      if (node.length === 0) return '[]';
      if (node.every((item) => item === null || typeof item !== 'object')) {
        const inline = `[${node.map((item) => JSON.stringify(item)).join(', ')}]`;
        // +1 por la coma que puede seguir al valor.
        if (used + inline.length + 1 <= LINE_WIDTH) return inline;
      }
      const items = node.map((item) => `${pad}${render(item, indent + 2, pad.length)}`);
      return `[\n${items.join(',\n')}\n${' '.repeat(indent)}]`;
    }
    const entries = Object.entries(node);
    if (entries.length === 0) return '{}';
    const lines = entries.map(([key, item]) => {
      const head = `${pad}${JSON.stringify(key)}: `;
      return `${head}${render(item, indent + 2, head.length)}`;
    });
    return `{\n${lines.join(',\n')}\n${' '.repeat(indent)}}`;
  };
  return `${render(value, 0, 0)}\n`;
}
