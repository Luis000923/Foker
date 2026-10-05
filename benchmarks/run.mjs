// Ejecuta las herramientas de benchmark compiladas (pnpm build compila benchmarks/src a dist/).
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const commands = new Set([
  'host-overhead',
  'bench-run',
  'bench-run-b',
  'bench-report',
  'diagnose',
  'calibrate',
  'ctx-gold',
  'evaluate-task',
  'validate-results',
  'validate-manifest',
]);
const command = process.argv[2];
if (!commands.has(command)) throw new Error('Comando de benchmark desconocido');
// Node 26 ya no transforma TypeScript (solo elimina tipos): se ejecuta el código compilado.
const compiled = new URL(
  `./dist/${command === 'host-overhead' ? 'analysis/host-overhead' : command}.js`,
  import.meta.url,
);
if (!existsSync(fileURLToPath(compiled))) {
  throw new Error('Falta benchmarks/dist: ejecuta pnpm build (o pnpm --filter @foker/benchmarks run build)');
}
const tool = await import(compiled.href);
await tool.main(process.argv.slice(3));
