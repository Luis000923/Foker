import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BenchmarkResult } from '@foker/schemas';
import { expect, it } from 'vitest';
import { analyze, markdown } from './src/analysis/report.js';
import { bootstrap, mean, wilcoxon } from './src/analysis/statistics.js';
import { main as report } from './src/bench-report.js';
import { ROOT } from './src/harness/index.js';

it('Wilcoxon exacto: tablas bilaterales n=5 W=0 p=.0625; n=6 p=.03125', () => {
  expect(wilcoxon([1, 2, 3, 4, 5]).p).toBe(0.0625);
  expect(wilcoxon([1, 2, 3, 4, 5, 6]).p).toBe(0.03125);
  expect(wilcoxon([1, -2, 3, -4]).p).toBe(0.875);
  expect(wilcoxon([1, 1, 1]).p).toBe(0.25);
  expect(wilcoxon([0, 0]).p).toBe(1);
  expect(wilcoxon(Array.from({ length: 30 }, () => 1)).p).toBeLessThan(0.00001);
});
it('bootstrap estable y población constante', () => {
  expect(bootstrap([2, 2, 2], mean)).toEqual([2, 2]);
  expect(bootstrap([1, 2, 3, 4], mean, 42)).toEqual(bootstrap([1, 2, 3, 4], mean, 42));
  expect(bootstrap([1, 2, 3, 4], mean, 42)).toEqual([1.5, 3.5]);
});
function synthetic(failure = false) {
  const template = JSON.parse(
    readFileSync(join(ROOT, 'packages/schemas/examples/benchmark-result.json'), 'utf8'),
  ) as BenchmarkResult;
  return Array.from({ length: 10 }, (_, i) =>
    (['control', 'foker'] as const).flatMap((arm) =>
      Array.from({ length: 3 }, (_, j) => ({
        ...structuredClone(template),
        task_id: `task-${i}`,
        arm,
        repetition: j + 1,
        success: !(failure && arm === 'foker'),
        metrics: {
          ...template.metrics,
          input_tokens_total: arm === 'control' ? 1000 : 600,
          exposure_precision: arm === 'control' ? 0.2 : 0.8,
          out_of_scope_edits: arm === 'control' ? 2 : 0,
        },
      })),
    ),
  ).flat();
}
it('H1 reducción 40%, IC constante, H2 y éxito no inferior', () => {
  const rows = synthetic();
  const result = analyze(rows);
  expect(result.h1).toBe(true);
  expect(result.h2).toBe(true);
  expect(result.reductionCI).toEqual([0.4, 0.4]);
  expect(result.successCI).toEqual([0, 0]);
  expect(markdown(rows)).toContain('GENERADO');
  expect(markdown(rows)).toContain('Por tipo');
  const failed = analyze(synthetic(true));
  expect(failed.h1).toBe(false);
  expect(failed.paired).toBe(0);
  expect(failed.successCI).toEqual([-1, -1]);
});

it('CLI report combina shards y genera Markdown idéntico al repetir', () => {
  const dir = mkdtempSync(join(tmpdir(), 'foker-report-test-'));
  const id = 'bench-synthetic-report-test';
  const destination = join(ROOT, 'benchmarks/reports', `${id}.md`);
  try {
    const rows = synthetic().map((r) => ({ ...r, run_id: id }));
    const a = join(dir, 'a.jsonl'),
      b = join(dir, 'b.jsonl');
    writeFileSync(
      a,
      rows
        .slice(0, 30)
        .map((r) => JSON.stringify(r))
        .join('\n'),
    );
    writeFileSync(
      b,
      rows
        .slice(30)
        .map((r) => JSON.stringify(r))
        .join('\n'),
    );
    report([a, b]);
    const first = readFileSync(destination, 'utf8');
    report([a, b]);
    expect(readFileSync(destination, 'utf8')).toBe(first);
    expect(first).toContain('H1: confirmada');
    expect(() => report([a, a])).toThrow('duplicada');
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(destination, { force: true });
  }
});
