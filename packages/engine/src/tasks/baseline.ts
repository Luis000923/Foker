import { readdir, readFile, readlink } from 'node:fs/promises';
import { join } from 'node:path';
import { FokerError, hashBytes, hashCanonicalJson, matchGlobs } from '@foker/core';
import { DEFAULT_POLICY } from '@foker/policy';
import type { TaskBaseline, TaskChange, TaskRecord } from '@foker/schemas';
import { loadConfig } from '../config.js';
import { type GitIgnored, gitDirtyFiles, gitIgnoredPaths, gitRead } from '../git.js';
import { atomicJson } from './storage.js';
export interface BaselineSnapshot {
  snapshot: Record<string, string>;
  tree: Record<string, string>;
  mode?: 'git' | 'none';
  exclusions?: { files: string[]; directories: string[] };
}
export class BaselineTamperedError extends Error {
  constructor() {
    super('Baseline alterado o ilegible');
    this.name = 'BaselineTamperedError';
  }
}
const hash = (value: unknown) => hashCanonicalJson(JSON.stringify(value));
/**
 * Globs que un archivo ignorado debe seguir respetando (ADR-037 punto 1): rutas protegidas y
 * secretos. Se calculan con la política efectiva; si la configuración no se puede leer, los
 * valores por defecto bastan para que G2 siga viendo `.env` y `foker.config.yaml`.
 */
async function sensitiveGlobs(root: string, configPath?: string): Promise<string[]> {
  try {
    const loaded = await loadConfig(root, configPath ? { configPath } : {});
    return [...new Set([...loaded.policy.protected_paths, ...loaded.policy.secret_globs])];
  } catch {
    return [...new Set([...DEFAULT_POLICY.protected_paths, ...DEFAULT_POLICY.secret_globs])];
  }
}
/**
 * Recorre archivos regulares sin seguir enlaces; excluye estado interno y, con git disponible
 * (ADR-037), los ignorados salvo los que casan con rutas protegidas o globs de secretos.
 */
export async function treeSnapshot(
  root: string,
  exclusions?: GitIgnored | null,
  configPath?: string,
): Promise<Record<string, string>> {
  const ignored = exclusions === undefined ? await gitIgnoredPaths(root) : exclusions;
  const globs = await sensitiveGlobs(root, configPath);
  const tree: Record<string, string> = {};
  let count = 0;
  async function walk(directory: string, hidden = false) {
    for (const entry of await readdir(join(root, directory), { withFileTypes: true })) {
      if (['.git', '.foker', 'node_modules'].includes(entry.name)) continue;
      const path = directory ? `${directory}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(path, hidden || !!ignored?.directories.has(path));
      } else if (entry.isFile() || entry.isSymbolicLink()) {
        if ((hidden || ignored?.files.has(path)) && entry.name !== '.gitignore' && !matchGlobs(path, globs)) continue;
        if (count++ >= 50000) throw new FokerError('FKR-MAP-003', 'Baseline supera 50000 archivos');
        // La marca distingue un enlace de un archivo cuyos bytes sean iguales al destino.
        tree[path] = entry.isSymbolicLink()
          ? `symlink:${hashBytes(Buffer.from(await readlink(join(root, path))))}`
          : hashBytes(await readFile(join(root, path)));
      }
    }
  }
  await walk('');
  return tree;
}
export async function captureBaseline(
  root: string,
  id: string,
  paths: string[],
  configPath?: string,
): Promise<TaskBaseline> {
  const git_head = (await gitRead(root, ['rev-parse', 'HEAD']))?.trim() ?? null;
  const dirty_files = await gitDirtyFiles(root, true);
  const ignored = await gitIgnoredPaths(root);
  const tree = await treeSnapshot(root, ignored, configPath);
  const snapshot = Object.fromEntries(
    Object.entries(tree).filter(([path]) => matchGlobs(path, paths) || dirty_files.includes(path)),
  );
  const baseline: BaselineSnapshot = {
    snapshot,
    tree,
    mode: ignored ? 'git' : 'none',
    exclusions: { files: [...(ignored?.files ?? [])].sort(), directories: [...(ignored?.directories ?? [])].sort() },
  };
  await atomicJson(join(root, '.foker/tasks', `${id}.baseline.json`), baseline);
  return { git_head, dirty_files, snapshot_hash: hash(baseline) };
}
export async function diffSinceBaseline(root: string, task: TaskRecord, configPath?: string): Promise<TaskChange[]> {
  let baseline: BaselineSnapshot;
  try {
    baseline = JSON.parse(
      await readFile(join(root, '.foker/tasks', `${task.task_id}.baseline.json`), 'utf8'),
    ) as BaselineSnapshot;
    if (
      !baseline?.snapshot ||
      !baseline.tree ||
      hash(baseline.mode === undefined ? { snapshot: baseline.snapshot, tree: baseline.tree } : baseline) !==
        task.baseline.snapshot_hash
    )
      throw new BaselineTamperedError();
  } catch {
    throw new BaselineTamperedError();
  }
  if (
    baseline.mode !== undefined &&
    (!['git', 'none'].includes(baseline.mode) ||
      !Array.isArray(baseline.exclusions?.files) ||
      !Array.isArray(baseline.exclusions?.directories))
  )
    throw new BaselineTamperedError();
  const ignored =
    baseline.mode === 'git'
      ? ((await gitIgnoredPaths(root)) ?? {
          files: new Set(baseline.exclusions?.files),
          directories: new Set(baseline.exclusions?.directories),
        })
      : null;
  const current = await treeSnapshot(root, ignored, configPath);
  // También consulta git: incluye renombres y cambios desde HEAD; el hash decide si hubo cambio tras begin.
  await gitDirtyFiles(root, true);
  if (task.baseline.git_head) await gitRead(root, ['diff', '--name-status', task.baseline.git_head, '--', '.']);
  return [...new Set([...Object.keys(baseline.tree), ...Object.keys(current)])].sort().flatMap((path): TaskChange[] =>
    baseline.tree[path] === current[path]
      ? []
      : [
          {
            path,
            change: baseline.tree[path] === undefined ? 'added' : current[path] === undefined ? 'deleted' : 'modified',
          },
        ],
  );
}
