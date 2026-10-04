import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { ROOT, runTask } from './harness/index.js';
import { plan, runId } from './harness/plan.js';
import { readManifest } from './validate-manifest.js';
export async function main(argv: string[]): Promise<void> {
  const args = argv.filter((a) => a !== '--');
  const value = (flag: string, fallback?: string) => {
    const i = args.indexOf(flag);
    return i < 0 ? fallback : args[i + 1];
  };
  const allowed = new Set([
    '--suite',
    '--arm',
    '--repetitions',
    '--run-id',
    '--date',
    '--manifest',
    '--dry-run',
    '--yes',
    '--allow-null-pricing',
  ]);
  for (const arg of args) if (arg.startsWith('--') && !allowed.has(arg)) throw new Error(`Opción desconocida: ${arg}`);
  const manifest = readManifest(resolve(value('--manifest') ?? join(ROOT, 'benchmarks/manifest.yaml')));
  const suite = value('--suite', 'smoke'),
    arm = value('--arm', 'both');
  if (suite !== 'smoke' && suite !== 'full') throw new Error('Suite inválida');
  if (arm !== 'control' && arm !== 'foker' && arm !== 'both') throw new Error('Brazo inválido');
  const id = value('--run-id') ?? runId(manifest.seeds.order, value('--date') ?? new Date().toISOString().slice(0, 10));
  if (!/^[a-zA-Z0-9_.-]+$/.test(id)) throw new Error('run_id inválido');
  const entries = plan(manifest, suite, arm, Number(value('--repetitions', '3')));
  const price = manifest.prices.models.find((p) => p.model === manifest.model);
  const unknown =
    !manifest.model ||
    !price ||
    [price.input, price.cache_read, price.cache_write, price.output, manifest.limits.max_cost_usd].includes(null);
  const estimate =
    manifest.limits.max_cost_usd === null
      ? 'desconocido'
      : `$${(entries.length * manifest.limits.max_cost_usd).toFixed(2)}`;
  console.log(`${id}: ${entries.length} ejecuciones; coste máximo estimado ${estimate}`);
  if (args.includes('--dry-run')) {
    console.log(
      JSON.stringify(
        entries.map((e) => ({ task: e.task.id, arm: e.arm, repetition: e.repetition })),
        null,
        2,
      ),
    );
    return;
  }
  if (unknown && !args.includes('--allow-null-pricing'))
    throw new Error('Modelo/precios/límite pendientes: configure el manifiesto o --allow-null-pricing');
  if (!manifest.model)
    throw new Error('Modelo exacto obligatorio: --allow-null-pricing no puede seleccionar un modelo');
  if (!/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(manifest.host.version))
    throw new Error('Versión exacta de Claude Code pendiente');
  if (!args.includes('--yes')) {
    if (!stdin.isTTY) throw new Error('Se requiere confirmación interactiva o --yes');
    const rl = createInterface({ input: stdin, output: stdout });
    try {
      if (
        (await rl.question(`Ejecutar ${entries.length} llamadas (máximo ${estimate})? [sí/no] `))
          .trim()
          .toLowerCase() !== 'sí'
      )
        throw new Error('Cancelado');
    } finally {
      rl.close();
    }
  }
  const work = join(ROOT, 'benchmarks/generated', id);
  if (existsSync(work) || existsSync(join(ROOT, 'benchmarks/results', `${id}.jsonl`)))
    throw new Error('run_id ya usado');
  mkdirSync(work, { recursive: true });
  writeFileSync(join(work, 'manifest.json'), JSON.stringify(manifest, null, 2));
  for (const [i, entry] of entries.entries())
    await runTask({ ...entry, manifest, runId: id, workDir: join(work, String(i)) });
}
