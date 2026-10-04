import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { FokerError, hashBytes, hashCanonicalJson, matchGlobs, normalizePath } from '@foker/core';
import { DEFAULT_POLICY } from '@foker/policy';
import type { TaskBaseline, TaskChange, TaskRecord } from '@foker/schemas';
import { gitDirtyFiles, gitRead } from '../git.js';
import { atomicJson } from './storage.js';
export interface BaselineSnapshot {
  snapshot: Record<string, string>;
  tree: Record<string, string>;
}
export class BaselineTamperedError extends Error {
  constructor() {
    super('Baseline alterado o ilegible');
    this.name = 'BaselineTamperedError';
  }
}
const hash = (value: unknown) => hashCanonicalJson(JSON.stringify(value));
/** Recorre archivos regulares sin seguir enlaces; excluye estado interno y secretos. */
async function treeSnapshot(root: string): Promise<Record<string, string>> {
  const tree: Record<string, string> = {};
  let count = 0;
  async function walk(directory: string) {
    for (const entry of await readdir(join(root, directory), { withFileTypes: true })) {
      if (['.git', '.foker', 'node_modules'].includes(entry.name)) continue;
      const path = directory ? `${directory}/${entry.name}` : entry.name;
      if (matchGlobs(path, DEFAULT_POLICY.secret_globs)) continue;
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) {
        if (count++ >= 50000) throw new FokerError('FKR-MAP-003', 'Baseline supera 50000 archivos');
        tree[path] = hashBytes(await readFile(join(root, normalizePath(root, path))));
      }
    }
  }
  await walk('');
  return tree;
}
export async function captureBaseline(root: string, id: string, paths: string[]): Promise<TaskBaseline> {
  const git_head = (await gitRead(root, ['rev-parse', 'HEAD']))?.trim() ?? null;
  const dirty_files = await gitDirtyFiles(root, true);
  const tree = await treeSnapshot(root);
  const snapshot = Object.fromEntries(
    Object.entries(tree).filter(([path]) => matchGlobs(path, paths) || dirty_files.includes(path)),
  );
  await atomicJson(join(root, '.foker/tasks', `${id}.baseline.json`), { snapshot, tree });
  return { git_head, dirty_files, snapshot_hash: hash({ snapshot, tree }) };
}
export async function diffSinceBaseline(root: string, task: TaskRecord): Promise<TaskChange[]> {
  let baseline: BaselineSnapshot;
  try {
    baseline = JSON.parse(
      await readFile(join(root, '.foker/tasks', `${task.task_id}.baseline.json`), 'utf8'),
    ) as BaselineSnapshot;
    if (
      !baseline?.snapshot ||
      !baseline.tree ||
      hash({ snapshot: baseline.snapshot, tree: baseline.tree }) !== task.baseline.snapshot_hash
    )
      throw new BaselineTamperedError();
  } catch {
    throw new BaselineTamperedError();
  }
  const current = await treeSnapshot(root);
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
