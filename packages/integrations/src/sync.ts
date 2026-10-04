import { antigravity } from './adapters/antigravity.js';
import { claudeCode } from './adapters/claude-code.js';
import { codex } from './adapters/codex.js';
import { opencode } from './adapters/opencode.js';
import { deleteAt, formatJson, getAt, isObject, type Json, type JsonObject, pointerString, setAt } from './json.js';
import { findBlock, removeBlock, upsertBlock } from './markdown.js';
import { canonical, hashText } from './text.js';
import { tomlBlockText, tomlConflict, tomlText } from './toml.js';
import type { Desired, HostAdapter, HostId, SyncInput } from './types.js';

/** Ruta del manifiesto versionado (REQ-PRJ-002). */
export const MANIFEST_PATH = 'foker/sync-manifest.json';

export const ADAPTERS: Record<HostId, HostAdapter> = {
  'claude-code': claudeCode,
  opencode,
  antigravity,
  codex,
};

/** Qué generó `sync` en cada archivo, para poder actualizarlo o retirarlo sin tocar lo del usuario. */
export type ManifestEntry =
  | { kind: 'file'; hash: string }
  | { kind: 'block'; hash: string }
  | {
      kind: 'json';
      /** Punteros cuyo valor completo es de Foker, con el hash del valor escrito. */
      owned: { pointer: string; hash: string }[];
      /** Elementos de listas añadidos por Foker (JSON canónico de cada uno). */
      arrays: { pointer: string; values: string[] }[];
    };

export interface SyncManifest {
  version: 1;
  files: Record<string, ManifestEntry>;
}

export interface Conflict {
  path: string;
  reason: string;
}

export interface SyncPlan {
  /** Escrituras (contenido completo) y borrados (`null`), ordenados por ruta. */
  writes: { path: string; content: string | Uint8Array | null }[];
  conflicts: Conflict[];
  manifest: SyncManifest;
}

export function emptyManifest(): SyncManifest {
  return { version: 1, files: {} };
}

/** Lee el manifiesto; uno inválido se trata como vacío (sync no sabrá qué es suyo y avisará conflictos). */
export function parseManifest(text: string | undefined): SyncManifest {
  if (!text) return emptyManifest();
  try {
    const parsed = JSON.parse(text) as SyncManifest;
    return parsed?.version === 1 && isObject(parsed.files as unknown) ? parsed : emptyManifest();
  } catch {
    return emptyManifest();
  }
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (isObject(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, sortKeys(value[k])]),
    );
  }
  return value;
}

export function formatManifest(manifest: SyncManifest): string {
  return formatJson(sortKeys(manifest) as Json);
}

function parsePointer(pointer: string): string[] {
  return pointer
    .split('/')
    .slice(1)
    .map((p) => p.replaceAll('~1', '/').replaceAll('~0', '~'));
}

/** Agrupa lo deseado por ruta: bloques y archivos deben coincidir; JSON se fusiona. */
function collect(targets: HostId[], input: SyncInput): Map<string, Desired> {
  const byPath = new Map<string, Desired>();
  for (const id of [...targets].sort()) {
    for (const item of ADAPTERS[id].plan(input)) {
      const previous = byPath.get(item.path);
      if (!previous) {
        byPath.set(item.path, structuredClone(item));
      } else if (previous.kind === 'json' && item.kind === 'json') {
        previous.set.push(...structuredClone(item.set));
        previous.arrays.push(...structuredClone(item.arrays));
      } else if (canonical(previous) !== canonical(item)) {
        throw new Error(`adaptadores incompatibles para ${item.path}`);
      }
    }
  }
  return byPath;
}

function asText(value: string | Uint8Array | undefined): string | undefined {
  return typeof value === 'string' || value === undefined ? value : Buffer.from(value).toString('utf8');
}

interface Io {
  read(path: string): string | Uint8Array | undefined;
}

function planFile(
  item: Extract<Desired, { kind: 'file' }>,
  current: string | Uint8Array | undefined,
  old: ManifestEntry | undefined,
  force: boolean,
) {
  const entry: ManifestEntry = { kind: 'file', hash: hashText(item.content) };
  if (current !== undefined && hashText(current) === entry.hash)
    return { content: undefined, entry, conflict: undefined };
  const ours = current === undefined || (old?.kind === 'file' && old.hash === hashText(current));
  if (!ours && !force) {
    return {
      content: undefined,
      entry: old,
      conflict: old ? 'modificado a mano desde el último sync' : 'existe y no lo generó foker sync',
    };
  }
  return { content: item.content, entry, conflict: undefined };
}

function planBlock(
  item: Extract<Desired, { kind: 'block' }>,
  current: string | undefined,
  old: ManifestEntry | undefined,
  force: boolean,
) {
  const isToml = item.syntax === 'toml';
  const original = current;
  if (isToml && current !== undefined) {
    current = tomlBlockText(current);
    const outside = removeBlock(current);
    const conflict = tomlConflict(original ?? '', outside);
    if (conflict) return { content: undefined, entry: old, conflict };
  }
  const entry: ManifestEntry = { kind: 'block', hash: hashText(item.body) };
  const found = current === undefined ? null : findBlock(current);
  if (found && old?.kind === 'block' && hashText(found.body) !== old.hash && !force) {
    return { content: undefined, entry: old, conflict: 'bloque gestionado modificado a mano' };
  }
  const block = upsertBlock(current, item.body, item.header);
  const next = isToml ? tomlText(block) : block;
  return { content: next === original ? undefined : next, entry, conflict: undefined };
}

function planJson(
  item: Extract<Desired, { kind: 'json' }>,
  current: string | undefined,
  old: ManifestEntry | undefined,
  force: boolean,
) {
  let doc: JsonObject;
  try {
    const parsed: unknown = current === undefined ? {} : JSON.parse(current);
    if (!isObject(parsed)) throw new Error('no es un objeto');
    doc = parsed;
  } catch {
    return { content: undefined, entry: old, conflict: 'JSON no válido (¿comentarios?); corrígelo o usa --force' };
  }
  const previous = old?.kind === 'json' ? old : { kind: 'json' as const, owned: [], arrays: [] };
  const conflicts: string[] = [];
  const owned = new Map(previous.owned.map((o) => [o.pointer, o.hash]));
  const wanted = new Set(item.set.map((s) => pointerString(s.pointer)));

  // Retirar valores propios que ya no se desean (si el usuario no los cambió).
  for (const [pointer, hash] of owned) {
    if (wanted.has(pointer)) continue;
    const path = parsePointer(pointer);
    const value = getAt(doc, path);
    if (value === undefined) continue;
    if (hashText(canonical(value)) === hash || force) deleteAt(doc, path);
    else conflicts.push(`${pointer} modificado a mano`);
  }
  for (const { pointer, value } of item.set) {
    const key = pointerString(pointer);
    const existing = getAt(doc, pointer);
    if (existing !== undefined && canonical(existing) !== canonical(value)) {
      const ours = owned.get(key) === hashText(canonical(existing));
      if (!ours && !force) {
        conflicts.push(`${key} ya existe con otro valor`);
        continue;
      }
    }
    // Un permiso de OpenCode puede ser una acción ("ask"): se convierte en {"*": acción} sin cambiar su efecto.
    const parentPath = pointer.slice(0, -1);
    const parent = getAt(doc, parentPath);
    if (typeof parent === 'string' && parentPath.length > 0) setAt(doc, parentPath, { '*': parent });
    if (!setAt(doc, pointer, value)) conflicts.push(`${key}: un tramo intermedio no es un objeto`);
  }
  const arrays: { pointer: string; values: string[] }[] = [];
  const previousArrays = new Map(previous.arrays.map((a) => [a.pointer, new Set(a.values)]));
  const desiredArrays = new Map<string, Json[]>();
  for (const a of item.arrays) {
    const key = pointerString(a.pointer);
    desiredArrays.set(key, [...(desiredArrays.get(key) ?? []), ...a.values]);
  }
  for (const pointer of new Set([...previousArrays.keys(), ...desiredArrays.keys()])) {
    const path = parsePointer(pointer);
    const values = desiredArrays.get(pointer) ?? [];
    const wantedValues = new Set(values.map(canonical));
    const ownedBefore = previousArrays.get(pointer) ?? new Set<string>();
    const existing = getAt(doc, path);
    if (existing !== undefined && !Array.isArray(existing)) {
      conflicts.push(`${pointer} no es una lista`);
      continue;
    }
    const list = ((existing as Json[] | undefined) ?? []).filter((v) => {
      const c = canonical(v);
      return !(ownedBefore.has(c) && !wantedValues.has(c));
    });
    const present = new Set(list.map(canonical));
    const ownedNow = new Set([...ownedBefore].filter((v) => wantedValues.has(v)));
    for (const value of values) {
      const key = canonical(value);
      if (!present.has(key)) {
        list.push(value);
        present.add(key);
        ownedNow.add(key);
      }
    }
    if (list.length) {
      if (!setAt(doc, path, list)) conflicts.push(`${pointer}: un tramo intermedio no es un objeto`);
    } else if (existing !== undefined) deleteAt(doc, path);
    if (ownedNow.size) arrays.push({ pointer, values: [...ownedNow].sort() });
  }
  if (conflicts.length) return { content: undefined, entry: old, conflict: conflicts.join('; ') };
  const entry: ManifestEntry = {
    kind: 'json',
    owned: item.set
      .map((s) => ({ pointer: pointerString(s.pointer), hash: hashText(canonical(s.value)) }))
      .sort((a, b) => (a.pointer < b.pointer ? -1 : a.pointer > b.pointer ? 1 : 0)),
    arrays: arrays.sort((a, b) => (a.pointer < b.pointer ? -1 : 1)),
  };
  const empty = Object.keys(doc).length === 0;
  const next = empty && current === undefined ? undefined : formatJson(doc);
  return { content: next === current ? undefined : next, entry, conflict: undefined };
}

/** Retira lo que un sync anterior generó y ya no corresponde. */
function planRemoval(path: string, current: string | Uint8Array | undefined, old: ManifestEntry, force: boolean) {
  if (current === undefined) return { content: undefined, conflict: undefined };
  if (old.kind === 'file') {
    if (hashText(current) === old.hash || force) return { content: null, conflict: undefined };
    return { content: undefined, conflict: 'ya no se genera pero fue modificado a mano' };
  }
  current = asText(current) ?? '';
  if (old.kind === 'block') {
    const isToml = path === '.codex/config.toml';
    if (isToml) current = tomlBlockText(current);
    const found = findBlock(current);
    if (!found) return { content: undefined, conflict: undefined };
    if (hashText(found.body) !== old.hash && !force) {
      return { content: undefined, conflict: 'bloque gestionado modificado a mano' };
    }
    const removed = removeBlock(current);
    const next = isToml ? tomlText(removed) : removed;
    return { content: next.trim().length === 0 ? null : next, conflict: undefined };
  }
  const result = planJson({ kind: 'json', path, set: [], arrays: [] }, current, old, force);
  // Si solo quedaba lo de Foker, el archivo se borra en vez de dejar `{}`.
  return { content: result.content === '{}\n' ? null : result.content, conflict: result.conflict };
}

/**
 * Calcula, sin escribir nada, qué archivos de integración cambiar (FOKER-SPEC §14, REQ-PRJ-001…003).
 * Es una función pura de la entrada y del contenido actual: dos ejecuciones seguidas no producen cambios.
 */
export function planSync(input: SyncInput, io: Io, options: { force?: boolean } = {}): SyncPlan {
  const force = options.force ?? false;
  const oldManifest = parseManifest(asText(io.read(MANIFEST_PATH)));
  const desired = collect(input.targets, input);
  const writes = new Map<string, string | Uint8Array | null>();
  const conflicts: Conflict[] = [];
  const files: Record<string, ManifestEntry> = {};

  for (const path of [...desired.keys()].sort()) {
    const item = desired.get(path) as Desired;
    const current = io.read(path);
    const old = oldManifest.files[path];
    const result =
      item.kind === 'file'
        ? planFile(item, current, old, force)
        : item.kind === 'block'
          ? planBlock(item, asText(current), old, force)
          : planJson(item, asText(current), old, force);
    if (result.conflict) conflicts.push({ path, reason: result.conflict });
    if (result.content !== undefined) writes.set(path, result.content);
    if (result.entry) files[path] = result.entry;
  }
  for (const path of Object.keys(oldManifest.files).sort()) {
    if (desired.has(path)) continue;
    const old = oldManifest.files[path] as ManifestEntry;
    const result = planRemoval(path, io.read(path), old, force);
    if (result.conflict) {
      conflicts.push({ path, reason: result.conflict });
      files[path] = old;
    } else if (result.content !== undefined) {
      writes.set(path, result.content);
    }
  }
  const manifest: SyncManifest = { version: 1, files };
  const manifestText = formatManifest(manifest);
  if (asText(io.read(MANIFEST_PATH)) !== manifestText) writes.set(MANIFEST_PATH, manifestText);
  return {
    writes: [...writes.entries()]
      .map(([path, content]) => ({ path, content }))
      .sort((a, b) => (a.path < b.path ? -1 : 1)),
    conflicts: conflicts.sort((a, b) => (a.path < b.path ? -1 : 1)),
    manifest,
  };
}

/** Anfitriones detectados en el proyecto (para `foker init --targets` por defecto y `doctor`). */
export function detectHosts(exists: (path: string) => boolean): HostId[] {
  return (Object.keys(ADAPTERS) as HostId[]).filter((id) => ADAPTERS[id].detect(exists)).sort();
}
