import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type ContextRequest, openEngine } from '@foker/core';
import { generate } from '../fixtures/fixture-a/generate.mjs';

export interface GoldCase {
  id: string;
  fixture: 'fixture-a' | 'monorepo-pnpm';
  task: string;
  anchors?: ContextRequest['anchors'];
  gold_modified: string[];
  gold_read?: string[];
}
export function score(exposed: string[], gold: string[], goldRead: string[] = []) {
  const pack = new Set(exposed);
  const modified = new Set(gold);
  const relevant = new Set([...gold, ...goldRead]);
  if (!modified.size) throw new Error('gold_modified vacío');
  return {
    recall: [...modified].filter((p) => pack.has(p)).length / modified.size,
    precision: pack.size ? [...pack].filter((p) => relevant.has(p)).length / pack.size : 0,
  };
}
export async function evaluateContext(cases: GoldCase[], repo: string, budget = 8000) {
  const temp = mkdtempSync(join(tmpdir(), 'foker-ctx-gold-'));
  try {
    const synthetic = join(temp, 'fixture-a');
    generate(synthetic);
    const mono = join(temp, 'monorepo-pnpm');
    cpSync(join(repo, 'fixtures/monorepo-pnpm'), mono, { recursive: true });
    const engines = { 'fixture-a': await openEngine(synthetic), 'monorepo-pnpm': await openEngine(mono) };
    for (const engine of Object.values(engines)) await engine.refresh();
    const rows = [];
    for (const item of cases) {
      const engine = engines[item.fixture];
      if (!engine || !item.id || !item.task) throw new Error('Caso ctx-gold inválido');
      const pack = await engine.buildContext({
        task: item.task,
        budgetTokens: budget,
        ...(item.anchors ? { anchors: item.anchors } : {}),
      });
      const exposed = pack.files.filter((f) => f.level !== 'L0').map((f) => f.id);
      rows.push({
        id: item.id,
        fixture: item.fixture,
        ...score(exposed, item.gold_modified, item.gold_read),
        tokens: pack.budget.used,
        exposed,
        gold_modified: item.gold_modified,
      });
    }
    if (!rows.length) throw new Error('Suite vacía');
    const tokens = rows.map((r) => r.tokens).sort((a, b) => a - b);
    const mid = Math.floor(tokens.length / 2);
    const median =
      tokens.length % 2 ? (tokens[mid] as number) : ((tokens[mid - 1] as number) + (tokens[mid] as number)) / 2;
    const recall = rows.reduce((sum, r) => sum + r.recall, 0) / rows.length;
    return {
      budget,
      cases: rows.length,
      recall,
      precision: rows.reduce((sum, r) => sum + r.precision, 0) / rows.length,
      median_tokens: median,
      target: recall >= 0.8 && median <= 8000,
      blocks_m3: recall < 0.6,
      rows,
    };
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}
export async function main(args: string[]): Promise<void> {
  const repo = fileURLToPath(new URL('../../', import.meta.url));
  const source = resolve(args[0] ?? join(repo, 'benchmarks/ctx-gold/cases.jsonl'));
  const budget = Number(args[1] ?? 8000);
  if (!Number.isInteger(budget) || budget <= 0) throw new Error('Presupuesto inválido');
  const cases = readFileSync(source, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as GoldCase);
  const report = await evaluateContext(cases, repo, budget);
  const date = new Date().toISOString().slice(0, 10);
  const base = join(repo, `benchmarks/reports/ctx-gold-${date}`);
  mkdirSync(join(repo, 'benchmarks/reports'), { recursive: true });
  writeFileSync(`${base}.json`, `${JSON.stringify(report, null, 2)}\n`);
  const summary = `Casos: ${report.cases}; recall@pack: ${report.recall.toFixed(4)}; precisión: ${report.precision.toFixed(4)}; mediana tokens: ${report.median_tokens}.\n\nREQ-CTX-003 TARGET recall ≥ 0,80: ${report.recall >= 0.8 ? 'SÍ' : 'NO'}; mediana ≤ 8000: ${report.median_tokens <= 8000 ? 'SÍ' : 'NO'}; recall < 0,6 bloquea M3: ${report.blocks_m3 ? 'SÍ' : 'NO'}.`;
  writeFileSync(
    `${base}.md`,
    `# ctx-gold · ${date}\n\n${summary}\n\nMedia macro por caso. Fixture A: anclas solo si están declaradas; monorepo-pnpm: casos con anclas. Los tests nuevos aún ausentes del mapa cuentan como misses.\n\n| Caso | Recall | Precisión | Tokens |\n|---|---:|---:|---:|\n${report.rows.map((r) => `| ${r.id} | ${r.recall.toFixed(3)} | ${r.precision.toFixed(3)} | ${r.tokens} |`).join('\n')}\n`,
  );
  console.log(summary);
  console.log(`Informes: ${base}.{json,md}`);
}
