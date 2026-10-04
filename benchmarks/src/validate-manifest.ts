import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { formatIssues, validate } from '@foker/schemas';
import type { BenchmarkManifest } from './types.js';

// JSON es un subconjunto de YAML; el manifiesto usa este formato con comentarios de línea iniciales.
export function readManifest(path: string): BenchmarkManifest {
  const text = readFileSync(path, 'utf8').replace(/^#.*$/gm, '');
  const result = validate<BenchmarkManifest>('benchmark-manifest', JSON.parse(text));
  if (!result.ok) throw new Error(formatIssues(result.issues));
  const manifest = result.value;
  const repos = new Set(manifest.repos.map((r) => r.name));
  const ids = new Set(manifest.tasks.map((t) => t.id));
  if (repos.size !== manifest.repos.length || ids.size !== manifest.tasks.length) throw new Error('IDs duplicados');
  for (const task of manifest.tasks) if (!repos.has(task.repo)) throw new Error(`Repo desconocido: ${task.repo}`);
  for (const suite of Object.values(manifest.suites))
    for (const id of suite) if (!ids.has(id)) throw new Error(`Tarea desconocida: ${id}`);
  return manifest;
}
export function main(args: string[]): void {
  const path = resolve(args[0] ?? new URL('../manifest.yaml', import.meta.url).pathname);
  const manifest = readManifest(path);
  console.log(`Manifiesto válido: ${manifest.tasks.length} tareas`);
}
