// Lanzador de Fixture B (ADR-035). Sin --simulate ejecuta el anfitrión real y exige --yes.
// --simulate gold|noop valida preparación y evaluación sin API (gold debe tener éxito; noop, fallar).
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { type FixtureBTask, runTaskB } from './harness/fixture-b.js';
import { type Arm, ROOT } from './harness/index.js';
import { random } from './harness/plan.js';
import { execute } from './harness/process.js';
import type { BenchmarkManifest } from './types.js';

function arg(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

export async function main(args: string[]): Promise<void> {
  const root = resolve(
    arg(args, '--root') ?? process.env['FIXTURE_B_ROOT'] ?? '/home/luis/.local/share/foker-bench/fixture-b',
  );
  const manifest = JSON.parse(readFileSync(resolve(arg(args, '--manifest') ?? ''), 'utf8')) as BenchmarkManifest;
  const all = JSON.parse(readFileSync(join(root, 'harness-tasks.json'), 'utf8')) as FixtureBTask[];
  const ids = (arg(args, '--tasks') ?? '').split(',').filter(Boolean);
  const tasks = ids.length ? all.filter((t) => ids.includes(t.id)) : all;
  const arms =
    (arg(args, '--arm') ?? 'both') === 'both' ? (['control', 'foker'] as Arm[]) : [arg(args, '--arm') as Arm];
  const repetitions = Number(arg(args, '--repetitions') ?? '1');
  const simulate = arg(args, '--simulate') as 'gold' | 'noop' | undefined;
  const runId = arg(args, '--run-id') ?? 'bench-b';
  const work = resolve(arg(args, '--work') ?? join(root, 'runs', runId));
  // Orden pareado aleatorizado con la semilla del manifiesto (ADR-018).
  const rnd = random(manifest.seeds.order);
  const plan = tasks.flatMap((task) =>
    Array.from({ length: repetitions }, (_, r) => {
      const order = rnd() < 0.5 ? arms : [...arms].reverse();
      return order.map((arm) => ({ task, arm, repetition: r + 1 }));
    }).flat(),
  );
  console.log(`${runId}: ${plan.length} ejecuciones (${tasks.length} tareas × ${arms.length} brazos × ${repetitions})`);
  if (args.includes('--dry-run')) {
    console.log(
      JSON.stringify(
        plan.map((p) => ({ task: p.task.id, arm: p.arm, repetition: p.repetition })),
        null,
        2,
      ),
    );
    return;
  }
  if (!simulate && !args.includes('--yes')) throw new Error('Ejecución real: requiere --yes (consume cuota/API)');
  for (const [i, p] of plan.entries()) {
    const dir = join(work, `${i}`);
    const gold = join(root, 'private', p.task.id, 'gold.patch');
    const result = await runTaskB({
      task: p.task,
      arm: p.arm,
      repetition: p.repetition,
      manifest,
      paths: { root },
      workDir: dir,
      runId,
      ...(simulate
        ? {
            simulate: async (w: string) => {
              if (simulate === 'noop') return;
              const r = await execute('git', ['apply', '--whitespace=nowarn', gold], w, 120_000);
              if (r.exitCode !== 0) throw new Error(`gold no aplica: ${r.stderr}`);
            },
          }
        : {}),
    });
    console.log(
      JSON.stringify({ i, task: p.task.id, arm: p.arm, success: result.success, breakdown: result.success_breakdown }),
    );
  }
  void ROOT;
}
