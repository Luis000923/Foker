import { random } from '../harness/plan.js';
export const mean = (values: number[]): number => values.reduce((a, b) => a + b, 0) / values.length;
export function bootstrap<T>(
  items: T[],
  statistic: (sample: T[]) => number,
  seed = 42,
  count = 10_000,
): [number, number] | null {
  if (!Number.isSafeInteger(count) || count < 1) throw new Error('Remuestreos inválidos');
  if (!items.length) return null;
  const next = random(seed),
    values: number[] = [];
  for (let i = 0; i < count; i++)
    values.push(statistic(Array.from({ length: items.length }, () => items[Math.floor(next() * items.length)] as T)));
  values.sort((a, b) => a - b);
  return [
    values[Math.floor(count * 0.025)] as number,
    values[Math.min(count - 1, Math.floor(count * 0.975))] as number,
  ];
}
function normalCDF(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const tail =
    (Math.exp((-x * x) / 2) / Math.sqrt(2 * Math.PI)) *
    t *
    (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - tail : tail;
}
/** Bilateral, elimina ceros, rangos medios en empates, exacto por distribución de signos. */
export function wilcoxon(differences: number[]): { n: number; w: number; p: number; method: string } {
  const sorted = differences.filter((n) => n !== 0).sort((a, b) => Math.abs(a) - Math.abs(b));
  if (sorted.some((n) => !Number.isFinite(n))) throw new Error('Diferencias no finitas');
  const ranks: number[] = [];
  let tieCorrection = 0;
  for (let i = 0; i < sorted.length; ) {
    let j = i + 1;
    while (j < sorted.length && Math.abs(sorted[j] as number) === Math.abs(sorted[i] as number)) j++;
    for (let k = i; k < j; k++) ranks[k] = (i + 1 + j) / 2;
    const t = j - i;
    tieCorrection += t * t * t - t;
    i = j;
  }
  const n = sorted.length,
    total = (n * (n + 1)) / 2;
  const positive = ranks.reduce((sum, rank, i) => sum + ((sorted[i] as number) > 0 ? rank : 0), 0),
    w = Math.min(positive, total - positive);
  if (!n) return { n, w: 0, p: 1, method: 'exact' };
  if (n <= 20) {
    let counts = new Map<number, number>([[0, 1]]);
    for (const rank of ranks) {
      const next = new Map(counts);
      for (const [sum, count] of counts) next.set(sum + rank, (next.get(sum + rank) ?? 0) + count);
      counts = next;
    }
    let tail = 0;
    for (const [sum, count] of counts) if (sum <= w) tail += count;
    return { n, w, p: Math.min(1, (2 * tail) / 2 ** n), method: 'exact' };
  }
  const variance = (n * (n + 1) * (2 * n + 1)) / 24 - tieCorrection / 48;
  const z = Math.max(0, Math.abs(positive - total / 2) - 0.5) / Math.sqrt(variance);
  return { n, w, p: Math.min(1, 2 * (1 - normalCDF(z))), method: 'normal, empates y continuidad' };
}
