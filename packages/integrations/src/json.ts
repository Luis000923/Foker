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
export function formatJson(value: Json): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
