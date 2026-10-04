// Compara las mediciones de rendimiento de nightly con benchmarks/perf-baseline.json.
//
// Uso: node scripts/perf-check.mjs <salida-de-nextest.txt>
// Lee las líneas JSON que imprimen los tests `perf_large`; sale con 1 si alguna métrica supera
// 1,2 × su referencia (FOKER-SPEC §19.1: regresión > 20 %).

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TOLERANCE = 1.2;
const baseline = JSON.parse(readFileSync(new URL('../benchmarks/perf-baseline.json', import.meta.url), 'utf8'));

/** @param {string} text */
export function readMetrics(text) {
  /** @type {Record<string, number>} */
  const metrics = {};
  for (const line of text.split('\n')) {
    const start = line.indexOf('{"');
    if (start < 0) continue;
    try {
      const parsed = JSON.parse(line.slice(start));
      for (const [key, value] of Object.entries(parsed)) if (typeof value === 'number') metrics[key] = value;
    } catch {
      // Líneas que no son JSON completo.
    }
  }
  return metrics;
}

/** @param {Record<string, number>} metrics */
export function compare(metrics) {
  /** @type {{metric: string, value: number, limit: number}[]} */
  const regressions = [];
  for (const [metric, reference] of Object.entries(baseline)) {
    if (typeof reference !== 'number') continue;
    const value = metrics[metric];
    if (value === undefined) continue;
    const limit = reference * TOLERANCE;
    if (value > limit) regressions.push({ metric, value, limit });
  }
  return regressions;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = process.argv[2];
  if (!file) {
    console.error('uso: node scripts/perf-check.mjs <salida-de-nextest.txt>');
    process.exit(2);
  }
  const metrics = readMetrics(readFileSync(file, 'utf8'));
  console.log(JSON.stringify(metrics, null, 2));
  const missing = Object.keys(baseline).filter((k) => !k.startsWith('$') && !(k in metrics));
  if (missing.length > 0) {
    console.error(`faltan métricas: ${missing.join(', ')}`);
    process.exit(1);
  }
  const regressions = compare(metrics);
  for (const r of regressions) console.error(`regresión: ${r.metric} = ${r.value} > ${r.limit.toFixed(1)}`);
  process.exit(regressions.length > 0 ? 1 : 0);
}
