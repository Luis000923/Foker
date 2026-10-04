import { createHash } from 'node:crypto';
import type { BenchmarkManifest } from '../types.js';
import type { Arm, Task } from './index.js';
export function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let n = state;
    n = Math.imul(n ^ (n >>> 15), n | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}
export function runId(seed: number, date: string): string {
  if (!Number.isFinite(Date.parse(date))) throw new Error('Fecha inválida');
  return `bench-${createHash('sha256').update(`${seed}:${date}`).digest('hex').slice(0, 16)}`;
}
export function plan(
  manifest: BenchmarkManifest,
  suite: 'smoke' | 'full',
  arm: Arm | 'both',
  repetitions: number,
): { task: Task; arm: Arm; repetition: number }[] {
  if (!Number.isSafeInteger(repetitions) || repetitions < 1) throw new Error('Repeticiones inválidas');
  const arms: Arm[] = arm === 'both' ? ['control', 'foker'] : [arm];
  const entries = manifest.suites[suite].flatMap((id) =>
    arms.flatMap((a) =>
      Array.from({ length: repetitions }, (_, i) => ({
        task: manifest.tasks.find((t) => t.id === id) as Task,
        arm: a,
        repetition: i + 1,
      })),
    ),
  );
  const next = random(manifest.seeds.order);
  for (let i = entries.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [entries[i], entries[j]] = [entries[j] as (typeof entries)[number], entries[i] as (typeof entries)[number]];
  }
  return entries;
}
