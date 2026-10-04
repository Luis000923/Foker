import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCheck } from '@foker/engine';
import type { BenchmarkResult } from '@foker/schemas';

export interface TestGroup {
  paths: string[];
  command: string[];
  destinations?: string[];
}
export interface EvaluationTask {
  id: string;
  hidden_tests: { fail_to_pass: TestGroup; pass_to_pass: TestGroup };
  default_checks: string[][];
  allow_protected?: string[];
  type?: string;
  submitted_tests?: TestGroup;
}
export interface Usage {
  turns: number;
  minutes: number;
  cost_usd: number;
}
export interface Limits {
  max_turns: number;
  max_minutes: number;
  max_cost_usd: number | null;
}
export function safePath(root: string, path: string): string {
  const target = resolve(root, path);
  const rel = relative(root, target);
  if (isAbsolute(path) || rel === '..' || rel.startsWith(`..${sep}`) || path.includes('\\'))
    throw new Error(`Ruta inválida: ${path}`);
  return target;
}
// Nunca sigue symlinks del resultado del agente ni copia su .git o dependencias.
export function tree(root: string, prefix = ''): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  for (const name of readdirSync(join(root, prefix)).sort()) {
    if (['node_modules', '.git', '.foker'].includes(name)) continue;
    const path = prefix ? `${prefix}/${name}` : name;
    const stat = lstatSync(join(root, path));
    if (stat.isSymbolicLink()) throw new Error(`Symlink rechazado: ${path}`);
    if (stat.isDirectory()) for (const [p, bytes] of tree(root, path)) files.set(p, bytes);
    else if (stat.isFile()) files.set(path, readFileSync(join(root, path)));
  }
  return files;
}
export async function evaluateTask(options: {
  work: string;
  fixture: string;
  task: EvaluationTask;
  hiddenRoot: string;
  usage: Usage;
  limits: Limits;
  timeoutMs?: number;
}): Promise<{
  success: boolean;
  success_breakdown: BenchmarkResult['success_breakdown'];
  checks: Awaited<ReturnType<typeof runCheck>>[];
}> {
  const { task, usage, limits } = options;
  // A fixed trusted profile contains both checks; malformed metadata fails closed.
  if (
    task.default_checks.length !== 2 ||
    Object.values(task.hidden_tests).some((g) => !g.paths.length || !g.command.length)
  )
    throw new Error('Perfil default o tests incompletos');
  const before = tree(options.fixture);
  const after = tree(options.work);
  const hiddenDestinations = task.hidden_tests.fail_to_pass.destinations ?? task.hidden_tests.fail_to_pass.paths;
  if (hiddenDestinations.length !== task.hidden_tests.fail_to_pass.paths.length)
    throw new Error('Destinos ocultos incompletos');
  const dependencyFile = (path: string) =>
    /(^|\/)(package.json|pnpm-lock.yaml|package-lock.json|yarn.lock|bun.lockb?)$/.test(path);
  const infrastructure = (path: string) =>
    dependencyFile(path) ||
    /(^|\/)tsconfig[^/]*\.json$/.test(path) ||
    /(^|\/)scripts\//.test(path) ||
    /(^|\/)(?:biome|eslint|\.eslint|prettier|\.prettier|stylelint|\.stylelint|tslint|vitest|vite|jest|babel|\.babelrc|ava|\.mocha|nyc|\.nyc|\.npmrc|pnpm-workspace)[^/]*$/.test(
      path,
    );
  const allowed = (path: string) => dependencyFile(path) && (task.allow_protected ?? []).includes(path);
  if (task.type === 'test' && !task.submitted_tests) throw new Error('Tests entregados sin perfil de ejecución');
  const protectedFile = (path: string) =>
    infrastructure(path) ||
    path.startsWith('.github/') ||
    path.startsWith('.gitlab/') ||
    path === '.gitlab-ci.yml' ||
    /(^|\/)(pnpm-lock.yaml|package-lock.json|yarn.lock|bun.lockb?)$/.test(path) ||
    path.includes('/__hidden__/') ||
    path.startsWith('hidden-tests/') ||
    hiddenDestinations.includes(path) ||
    (task.hidden_tests.pass_to_pass.destinations ?? task.hidden_tests.pass_to_pass.paths).includes(path) ||
    task.hidden_tests.fail_to_pass.paths.includes(path) ||
    task.hidden_tests.pass_to_pass.paths.includes(path);
  const changed = [...new Set([...before.keys(), ...after.keys()])].filter(
    (p) => !before.has(p) || !after.has(p) || !before.get(p)?.equals(after.get(p) as Buffer),
  );
  const protectedUntouched = changed.every((p) => !protectedFile(p) || allowed(p));
  const clean = mkdtempSync(join(tmpdir(), 'foker-evaluate-'));
  try {
    for (const [path, bytes] of after) {
      const destination = safePath(clean, path);
      mkdirSync(dirname(destination), { recursive: true });
      writeFileSync(destination, bytes);
    }
    // Dependencias preinstaladas del fixture de confianza, nunca las del agente.
    const copyDependencies = (dir: string, target: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules')
          cpSync(join(dir, entry.name), join(target, entry.name), { recursive: true, verbatimSymlinks: true });
        else if (entry.isDirectory() && !['.git', '.foker'].includes(entry.name))
          copyDependencies(join(dir, entry.name), join(target, entry.name));
      }
    };
    copyDependencies(options.fixture, clean);
    // Restaura incluso archivos borrados y elimina infraestructura añadida por la entrega.
    for (const path of new Set([...before.keys(), ...after.keys()])) {
      if (!infrastructure(path) || allowed(path)) continue;
      const destination = safePath(clean, path);
      rmSync(destination, { force: true });
      const bytes = before.get(path);
      if (bytes) {
        mkdirSync(dirname(destination), { recursive: true });
        writeFileSync(destination, bytes);
      }
    }
    // Ambos grupos son del arnés: fuentes ocultas o tests confiables del fixture.
    for (const group of Object.values(task.hidden_tests)) {
      const destinations = group.destinations ?? group.paths;
      if (destinations.length !== group.paths.length) throw new Error('Destinos ocultos incompletos');
      for (const [i, path] of group.paths.entries()) {
        const bytes = group.destinations
          ? readFileSync(safePath(options.hiddenRoot, path))
          : (before.get(path) ?? readFileSync(safePath(options.hiddenRoot, path)));
        const destination = safePath(clean, destinations[i] as string);
        mkdirSync(dirname(destination), { recursive: true });
        writeFileSync(destination, bytes);
      }
    }
    const checks: Awaited<ReturnType<typeof runCheck>>[] = [];
    for (const command of [
      task.hidden_tests.fail_to_pass.command,
      task.hidden_tests.pass_to_pass.command,
      ...task.default_checks,
    ]) {
      checks.push(await runCheck({ run: command }, { root: clean, timeoutMs: options.timeoutMs ?? 300_000 }));
    }
    let submittedPass = true;
    if (task.submitted_tests) {
      const group = task.submitted_tests;
      if (!group.paths.length || !group.command.length || group.paths.some((p) => !after.has(p))) {
        submittedPass = false;
      } else {
        const delivered = await runCheck(
          { run: group.command },
          { root: clean, timeoutMs: options.timeoutMs ?? 300_000 },
        );
        checks.push(delivered);
        const original = mkdtempSync(join(tmpdir(), 'foker-mutation-'));
        try {
          cpSync(options.fixture, original, { recursive: true, verbatimSymlinks: true });
          for (const path of group.paths) {
            const destination = safePath(original, path);
            mkdirSync(dirname(destination), { recursive: true });
            writeFileSync(destination, after.get(path) as Buffer);
          }
          const mutation = await runCheck(
            { run: group.command },
            { root: original, timeoutMs: options.timeoutMs ?? 300_000 },
          );
          checks.push(mutation);
          submittedPass =
            delivered.status === 'pass' &&
            mutation.status === 'fail' &&
            mutation.exit_code !== null &&
            mutation.exit_code > 0;
        } finally {
          rmSync(original, { recursive: true, force: true });
        }
      }
    }
    const finiteNonnegative = (n: number) => Number.isFinite(n) && n >= 0;
    const within =
      [usage.turns, usage.minutes, usage.cost_usd].every(finiteNonnegative) &&
      Number.isInteger(usage.turns) &&
      limits.max_cost_usd !== null &&
      [limits.max_turns, limits.max_minutes, limits.max_cost_usd].every((n) => Number.isFinite(n) && n > 0) &&
      usage.turns <= limits.max_turns &&
      usage.minutes <= limits.max_minutes &&
      usage.cost_usd <= limits.max_cost_usd;
    const success_breakdown = {
      fail_to_pass: checks[0]?.status === 'pass' && submittedPass,
      pass_to_pass: checks[1]?.status === 'pass',
      typecheck_lint: checks.slice(2, 4).every((c) => c.status === 'pass'),
      protected_untouched: protectedUntouched,
      within_limits: within,
    };
    return { success: Object.values(success_breakdown).every(Boolean), success_breakdown, checks };
  } finally {
    rmSync(clean, { recursive: true, force: true });
  }
}
export async function main(args: string[]): Promise<void> {
  const [work, fixture, taskPath, usagePath, hiddenRoot] = args;
  if (!work || !fixture || !taskPath || !usagePath)
    throw new Error('Uso: evaluate-task <resultado> <fixture> <meta.json> <usage-limits.json>');
  const task = JSON.parse(readFileSync(taskPath, 'utf8')) as EvaluationTask;
  const run = JSON.parse(readFileSync(usagePath, 'utf8')) as { usage: Usage; limits: Limits };
  if (!existsSync(work) || !existsSync(fixture)) throw new Error('Directorio ausente');
  const result = await evaluateTask({
    work: resolve(work),
    fixture: resolve(fixture),
    task,
    hiddenRoot: hiddenRoot ? resolve(hiddenRoot) : fileURLRoot(),
    ...run,
  });
  console.log(JSON.stringify(result, null, 2));
}
function fileURLRoot(): string {
  return fileURLToPath(new URL('../../', import.meta.url));
}
