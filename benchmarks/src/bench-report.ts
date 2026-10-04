import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { hashCanonicalJson } from '@foker/core';
import { type BenchmarkResult, formatIssues, validate } from '@foker/schemas';
import { markdown } from './analysis/report.js';
import { ROOT } from './harness/index.js';
import { readManifest } from './validate-manifest.js';
export function main(args: string[]): void {
  const files = args.filter((a) => a !== '--');
  if (!files.length) throw new Error('Uso: bench:report <results.jsonl...>');
  const rows = files.flatMap((file) =>
    readFileSync(file, 'utf8')
      .trim()
      .split('\n')
      .map((line) => {
        const result = validate<BenchmarkResult>('benchmark-result', JSON.parse(line));
        if (!result.ok) throw new Error(formatIssues(result.issues));
        return result.value;
      }),
  );
  const keys = new Set<string>();
  for (const row of rows) {
    const key = `${row.task_id}:${row.arm}:${row.repetition}`;
    if (keys.has(key)) throw new Error('Repetición duplicada');
    keys.add(key);
  }
  if (new Set(rows.map((r) => `${r.run_id}:${r.manifest_hash}:${r.model}:${r.host.name}:${r.host.version}`)).size !== 1)
    throw new Error('No mezclar experimentos o modelos en un informe');
  const id = rows[0]?.run_id;
  if (!id) throw new Error('Resultados vacíos');
  const commits = new Map<string, string>();
  for (const row of rows) {
    if (commits.has(row.repo.name) && commits.get(row.repo.name) !== row.repo.commit)
      throw new Error('Commits distintos para el mismo repo');
    commits.set(row.repo.name, row.repo.commit);
  }
  if (!/^[a-zA-Z0-9_.-]+$/.test(id)) throw new Error('run_id inválido');
  const dir = join(ROOT, 'benchmarks/reports');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${id}.md`);
  const manifestPath = join(ROOT, 'benchmarks/generated', id, 'manifest.json');
  let seed = 42;
  if (existsSync(manifestPath)) {
    const manifest = readManifest(manifestPath);
    if (hashCanonicalJson(JSON.stringify(manifest)) !== rows[0]?.manifest_hash)
      throw new Error('Manifiesto no coincide con resultados');
    seed = manifest.seeds.bootstrap;
  }
  writeFileSync(path, markdown(rows, seed));
  console.log(path);
}
