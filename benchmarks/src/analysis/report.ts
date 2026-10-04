import type { BenchmarkResult } from '../types.js';
import { bootstrap, mean, wilcoxon } from './statistics.js';
export function median(values: number[]): number {
  if (!values.length) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? (sorted[middle] as number)
    : ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
}
export function analyze(rows: BenchmarkResult[], seed = 42) {
  const tasks = [...new Set(rows.map((r) => r.task_id))].sort();
  const groups = tasks.map((id) => {
    const arms = (['control', 'foker'] as const).map((arm) => {
      const all = rows.filter((r) => r.task_id === id && r.arm === arm),
        success = all.filter((r) => r.success);
      return {
        arm,
        n: all.length,
        successes: success.length,
        successRate: all.length ? success.length / all.length : null,
        tokens: success.length
          ? mean(success.flatMap((r) => (r.metrics.input_tokens_total === null ? [] : [r.metrics.input_tokens_total])))
          : null,
        cost: success.length
          ? mean(success.flatMap((r) => (r.metrics.cost_usd === null ? [] : [r.metrics.cost_usd])))
          : null,
        precision: mean(
          all.flatMap((r) => (r.metrics.exposure_precision === null ? [] : [r.metrics.exposure_precision])),
        ),
        outOfScope: mean(all.map((r) => r.metrics.out_of_scope_edits)),
        ccr: mean(all.flatMap((r) => (r.metrics.ccr_relevante == null ? [] : [r.metrics.ccr_relevante]))),
      };
    });
    return {
      id,
      type: rows.find((r) => r.task_id === id)?.task_type ?? 'unknown',
      control: arms[0] as (typeof arms)[number],
      foker: arms[1] as (typeof arms)[number],
    };
  });
  const paired = groups.filter(
    (g) =>
      g.control.tokens !== null &&
      g.foker.tokens !== null &&
      Number.isFinite(g.control.tokens) &&
      Number.isFinite(g.foker.tokens),
  );
  const successPairs = groups.filter((g) => g.control.n && g.foker.n);
  const difference = (sample: typeof paired) =>
    mean(sample.map((g) => (g.control.tokens as number) - (g.foker.tokens as number)));
  const reduction = (sample: typeof paired) => {
    const control = mean(sample.map((g) => g.control.tokens as number));
    return control > 0 ? difference(sample) / control : 0;
  };
  const successDifference = (sample: typeof successPairs) =>
    mean(sample.map((g) => (g.foker.successRate as number) - (g.control.successRate as number)));
  const reductionCI = bootstrap(paired, reduction, seed),
    successCI = bootstrap(successPairs, successDifference, seed);
  return {
    groups,
    paired: paired.length,
    unpaired: groups.filter((g) => !paired.includes(g)).map((g) => g.id),
    difference: paired.length ? difference(paired) : null,
    differenceCI: bootstrap(paired, difference, seed),
    reduction: paired.length ? reduction(paired) : null,
    reductionCI,
    successDifference: successPairs.length ? successDifference(successPairs) : null,
    successCI,
    wilcoxon: wilcoxon(paired.map((g) => (g.control.tokens as number) - (g.foker.tokens as number))),
    h1:
      paired.length > 0 &&
      reduction(paired) >= 0.3 &&
      reductionCI !== null &&
      reductionCI[0] > 0 &&
      successCI !== null &&
      successCI[0] >= -0.05,
    h2:
      successPairs.length > 0 &&
      successPairs.every((g) => Number.isFinite(g.foker.precision) && Number.isFinite(g.control.precision))
        ? mean(successPairs.map((g) => g.foker.precision - g.control.precision)) > 0 &&
          mean(successPairs.map((g) => g.foker.outOfScope - g.control.outOfScope)) < 0
        : null,
    rates: (['control', 'foker'] as const).map((arm) => ({
      arm,
      rate: mean(rows.filter((r) => r.arm === arm).map((r) => Number(r.success))),
      medianExposed: median(rows.filter((r) => r.arm === arm).map((r) => r.metrics.files_exposed)),
      tokensPerSuccess: mean(
        groups.flatMap((g) =>
          g[arm].tokens == null || !Number.isFinite(g[arm].tokens) ? [] : [g[arm].tokens as number],
        ),
      ),
      costPerSuccess: mean(
        groups.flatMap((g) => (g[arm].cost == null || !Number.isFinite(g[arm].cost) ? [] : [g[arm].cost as number])),
      ),
    })),
  };
}
const fmt = (n: number | null | undefined): string => (n == null || !Number.isFinite(n) ? 'N/D' : n.toFixed(4));
export function markdown(rows: BenchmarkResult[], seed = 42): string {
  const a = analyze(rows, seed);
  const table = (groups: typeof a.groups) =>
    [
      '| Tarea/tipo | Brazo | Éxitos/runs | Entrada/éxito | USD/éxito | Precisión | Fuera de alcance | CCR relevante |',
      '|---|---|---:|---:|---:|---:|---:|---:|',
      ...groups.flatMap((g) =>
        [g.control, g.foker].map(
          (s) =>
            `| ${g.id} (${g.type}) | ${s.arm} | ${s.successes}/${s.n} | ${fmt(s.tokens)} | ${fmt(s.cost)} | ${fmt(s.precision)} | ${fmt(s.outOfScope)} | ${fmt(s.ccr)} |`,
        ),
      ),
    ].join('\n');
  return `<!-- GENERADO por bench:report; no editar a mano. -->\n# Benchmark ${rows[0]?.run_id}\n\nSemilla bootstrap: ${seed}; 10.000 remuestreos pareados por tarea; IC percentil 95 %.\n\n${a.rates.map((r) => `Éxito ${r.arm}: ${fmt(r.rate * 100)} %, entrada/tarea exitosa ${fmt(r.tokensPerSuccess)}, USD/tarea exitosa ${fmt(r.costPerSuccess)}, mediana expuestos ${fmt(r.medianExposed)}`).join('; ')}.\n\nH1: ${a.h1 ? 'confirmada' : 'no confirmada'} en esta muestra. Reducción: ${fmt(a.reduction)}; IC ${JSON.stringify(a.reductionCI)}. Diferencia de tokens: ${fmt(a.difference)}; IC ${JSON.stringify(a.differenceCI)}. Diferencia de éxito (Foker − control): ${fmt(a.successDifference)}; IC ${JSON.stringify(a.successCI)}.\n\nWilcoxon bilateral: ${JSON.stringify(a.wilcoxon)}. Parejas: ${a.paired}; tareas sin éxito en algún brazo: ${a.unpaired.join(', ') || 'ninguna'}.\n\nH2 (descriptiva: mayor precisión y menos ediciones fuera de alcance): ${a.h2 === null ? 'no evaluable' : a.h2 ? 'compatible' : 'no compatible'}. CCR es informativo. La precisión usa solo exposición observable.\n\n${table(a.groups)}\n\n## Por tipo de tarea\n\n${[
    ...new Set(a.groups.map((g) => g.type)),
  ]
    .sort()
    .map((type) => {
      const subset = rows.filter((r) => r.task_type === type);
      const b = analyze(subset, seed);
      return `### ${type}\n\nReducción ${fmt(b.reduction)}, IC ${JSON.stringify(b.reductionCI)}; éxito ${b.rates.map((r) => `${r.arm} ${fmt(r.rate)}`).join(', ')}.\n\n${table(b.groups)}`;
    })
    .join(
      '\n\n',
    )}\n\nMétricas desconocidas (null): ${rows.filter((r) => r.metrics.input_tokens_total === null).length} entradas; ${rows.filter((r) => r.metrics.cost_usd === null).length} costes; ${rows.filter((r) => r.metrics.retries === null).length} reintentos. Resultados negativos se conservan. Las medias de tokens/coste excluyen repeticiones fallidas; éxito incluye todas. El IC de éxito pondera tareas igualmente. No acredita FKR-018 (≥40 tareas).\n`;
}
