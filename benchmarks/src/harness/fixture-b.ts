// Arnés de Fixture B (ADR-035): repositorios reales con el entorno exacto de cada base B.
// Separado del camino de Fixture A para no alterar su comportamiento.
import { randomUUID } from 'node:crypto';
import { appendFileSync, cpSync, existsSync, mkdirSync, readdirSync, readlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { hashCanonicalJson } from '@foker/core';
import { formatIssues, validate } from '@foker/schemas';
import type { BenchmarkManifest, BenchmarkResult } from '../types.js';
import { type Arm, claudeArgs, claudeCredential, ROOT } from './index.js';
import { extractUsage, type HostOutput, traceMetrics } from './metrics.js';
import { detectRuntime, execute, type ProcessResult } from './process.js';

export interface FixtureBTask {
  id: string;
  repo: string;
  base: string;
  commit: string;
  type: 'fix' | 'feat' | 'perf' | 'refactor' | 'otro';
  statement: string;
  environment: { manager: string; node: string; image_digest: string };
  hidden_tests: string[];
  gold_modified: string[];
  commands: { install: string; build: string; f2p: string; p2p: string; quality: string };
}
export interface FixtureBPaths {
  /** Expediente fuera del repo: full/<repo> (clones) y private/<id> (gold y tests ocultos). */
  root: string;
}
/** Rutas que el agente no puede modificar en ningún brazo. */
export const PROTECTED = [
  /^\.git(\/|$)/,
  /^\.foker(\/|$)/,
  /^foker(\/|$)/,
  /^foker\.config\.yaml$/,
  /^\.mcp\.json$/,
  /^\.bench-mcp\.json$/,
  /^\.claude\/(settings|agents)/,
  /^pnpm-lock\.yaml$/,
];
export const image = (task: FixtureBTask) => `foker-bench-b:node-${task.environment.node}`;

export function setupScript(task: FixtureBTask): string {
  const [name, version] = task.environment.manager.split('@') as [string, string];
  return name === 'nub'
    ? `export PATH=$HOME/.nub/bin:$PATH; command -v nub >/dev/null || bash /private/nub-install.sh ${version}`
    : 'export COREPACK_HOME=$HOME/corepack PATH=$HOME/bin:$PATH && mkdir -p $HOME/bin ' +
        `&& corepack enable --install-directory $HOME/bin && corepack prepare pnpm@${version} --activate`;
}

export interface BackendB {
  /** Con red: gestor de B, instalación congelada y build; en Foker, init/trust/map. */
  prepare: (work: string, home: string, task: FixtureBTask, arm: Arm, privateDir: string) => Promise<void>;
  host: (work: string, home: string, task: FixtureBTask, args: string[], timeoutMs: number) => Promise<ProcessResult>;
  /** Sin red: entrega + tests ocultos sobre el árbol preparado; devuelve los códigos por fase. */
  evaluate: (evalDir: string, home: string, task: FixtureBTask, privateDir: string) => Promise<Record<string, number>>;
}

export function containerBackendB(manifest: BenchmarkManifest): BackendB {
  const runtime = detectRuntime();
  const run = async (
    work: string,
    home: string,
    task: FixtureBTask,
    command: string,
    timeoutMs: number,
    extra: string[] = [],
    api = false,
  ) => {
    const name = `foker-bench-b-${randomUUID()}`;
    return execute(
      runtime,
      [
        'run',
        '--rm',
        '--name',
        name,
        '--read-only',
        '--tmpfs',
        '/tmp:rw,exec,nosuid,size=2g',
        '--memory',
        '8g',
        '--cpus',
        '2',
        '--pids-limit',
        '512',
        '--user',
        `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`,
        '--env',
        'HOME=/home/bench',
        '--env',
        'CI=1',
        '--env',
        'TZ=UTC',
        '--env',
        'PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1',
        ...(api && manifest.host.name === 'claude-code' ? ['--env', claudeCredential()] : []),
        '--mount',
        `type=bind,src=${work},dst=/work`,
        '--mount',
        `type=bind,src=${home},dst=/home/bench`,
        ...extra,
        '--workdir',
        '/work',
        image(task),
        'bash',
        '-lc',
        command,
      ],
      ROOT,
      timeoutMs,
      async () => {
        const killed = await execute(runtime, ['kill', name], ROOT, 10_000);
        if (killed.exitCode !== 0) throw new Error(`No se pudo detener ${name}: ${killed.stderr}`);
      },
    );
  };
  const priv = (dir: string) => ['--mount', `type=bind,src=${dir},dst=/private,readonly`];
  return {
    prepare: async (work, home, task, arm, privateDir) => {
      const foker =
        arm === 'foker'
          ? ' && export XDG_CONFIG_HOME=/work/.foker/bench-xdg && mkdir -p $XDG_CONFIG_HOME' +
            ` && CI=true foker init --targets ${manifest.host.name} && CI=true foker trust --yes --ci && foker map`
          : '';
      const r = await run(
        work,
        home,
        task,
        `set -e; ${setupScript(task)}; ${task.commands.install} && ${task.commands.build}${foker}`,
        1_800_000,
        // La preparación no ve gold ni tests ocultos: solo el instalador de nub.
        ['--mount', `type=bind,src=${join(privateDir, '..', 'nub-install.sh')},dst=/private/nub-install.sh,readonly`],
      );
      if (r.exitCode !== 0) throw new Error(`Preparación ${task.id}: ${r.stderr.slice(-2000)}${r.stdout.slice(-2000)}`);
    },
    host: (work, home, task, args, timeoutMs) => {
      const quoted = args.map((a) => `'${a.replaceAll("'", "'\\''")}'`).join(' ');
      return run(
        work,
        home,
        task,
        `${setupScript(task)} >/dev/null 2>&1; node /opt/foker/benchmarks/docker/host.mjs ${manifest.host.name} ${manifest.host.version} ${quoted}`,
        timeoutMs,
        [],
        true,
      );
    },
    evaluate: async (evalDir, home, task, privateDir) => {
      const phases: [string, string][] = [
        ['apply_submission', 'git apply --whitespace=nowarn --allow-empty /private/submission.patch'],
        ['hidden_tests', 'cp -a /private/hidden/. /work/'],
        ['build', task.commands.build],
        ['f2p', task.commands.f2p],
        ['p2p', task.commands.p2p],
        ['quality', task.commands.quality],
      ];
      const script = ['set +e', `${setupScript(task)} >/dev/null 2>&1`];
      for (const [name, command] of phases)
        script.push(`( ${command} ) > /work/.eval-${name}.log 2>&1; echo "@@RC ${name} $?"`);
      const r = await run(evalDir, home, task, script.join('\n'), 3_600_000, [
        '--network',
        'none',
        ...priv(privateDir),
      ]);
      return Object.fromEntries([...r.stdout.matchAll(/@@RC (\w+) (\d+)/g)].map((m) => [m[1], Number(m[2])]));
    },
  };
}

async function git(cwd: string, args: string[]) {
  const r = await execute(
    'git',
    ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', '-c', 'core.symlinks=true', ...args],
    cwd,
    120_000,
    undefined,
    {
      ...process.env,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_AUTHOR_DATE: '2000-01-01T00:00:00Z',
      GIT_COMMITTER_DATE: '2000-01-01T00:00:00Z',
    },
  );
  if (r.exitCode !== 0) throw new Error(`git ${args[0]}: ${r.stderr}`);
  return r.stdout;
}
const commit = (cwd: string, message: string) =>
  git(cwd, [
    '-c',
    'user.name=Foker Benchmark',
    '-c',
    'user.email=benchmark@invalid',
    'commit',
    '-q',
    '--allow-empty',
    '-m',
    message,
  ]);

/** Entrega del agente respecto del commit preparado, con validación de seguridad. */
export async function submission(work: string, prepared: string) {
  await git(work, ['add', '-A']);
  const patch = await git(work, ['diff', '--cached', '--no-renames', '--binary', prepared]);
  const names = (await git(work, ['diff', '--cached', '--no-renames', '--name-only', prepared]))
    .split('\n')
    .filter(Boolean);
  const raw = (await git(work, ['diff', '--cached', '--no-renames', '--raw', prepared])).split('\n').filter(Boolean);
  const violations: string[] = names.filter((p) => PROTECTED.some((re) => re.test(p)));
  for (const line of raw) {
    const [meta, path] = line.split('\t') as [string, string];
    if (!meta.split(' ')[1]?.startsWith('120000')) continue;
    // readlinkSync: nunca sigue el enlace (no lee el destino ni falla con enlaces rotos).
    const target = readlinkSync(join(work, path));
    const resolved = resolve(join(work, path, '..'), target);
    if (target.startsWith('/') || !resolved.startsWith(`${resolve(work)}/`)) violations.push(`symlink:${path}`);
  }
  return { patch, names, violations };
}

export async function runTaskB(options: {
  task: FixtureBTask;
  arm: Arm;
  repetition: number;
  manifest: BenchmarkManifest;
  paths: FixtureBPaths;
  workDir: string;
  runId?: string;
  backend?: BackendB;
  resultsDir?: string;
  billing?: 'subscription' | 'api';
  /** Solo para validar el arnés sin API: sustituye al anfitrión. */
  simulate?: (work: string) => Promise<void>;
}): Promise<BenchmarkResult> {
  const { task, arm, repetition, manifest, paths } = options;
  const model = manifest.model;
  if (!model) throw new Error('Modelo exacto obligatorio incluso con --allow-null-pricing');
  const base = resolve(options.workDir);
  if (existsSync(base) && readdirSync(base).length) throw new Error('workDir debe estar vacío');
  const work = join(base, 'work'),
    home = join(base, 'home'),
    evidence = join(base, 'evidence');
  for (const dir of [work, home, evidence]) mkdirSync(dir, { recursive: true });
  const privateDir = join(paths.root, 'private', task.id);
  if (!existsSync(join(privateDir, 'hidden'))) throw new Error(`Faltan los tests ocultos de ${task.id}`);
  // Árbol de B sin historia ni remotos; los tests ocultos y el gold quedan fuera del agente.
  const archive = await execute(
    'bash',
    ['-c', `git -C "$1" archive "$2" | tar -x -C "$3"`, 'x', join(paths.root, 'full', task.repo), task.base, work],
    ROOT,
    300_000,
  );
  if (archive.exitCode !== 0) throw new Error(archive.stderr);
  await git(work, ['init', '-q']);
  await git(work, ['add', '-A']);
  await commit(work, `Base ${task.base}`);
  const backend = options.backend ?? containerBackendB(manifest);
  await backend.prepare(work, home, task, arm, privateDir);
  const preparedHome = join(base, 'prepared-home');
  cpSync(home, preparedHome, { recursive: true, verbatimSymlinks: true });
  if (arm === 'control') writeFileSync(join(work, '.bench-mcp.json'), '{"mcpServers":{}}\n');
  await git(work, ['add', '-A']);
  await commit(work, 'Preparado');
  const prepared = (await git(work, ['rev-parse', 'HEAD'])).trim();
  const snapshot = join(base, 'prepared');
  cpSync(work, snapshot, { recursive: true, verbatimSymlinks: true });
  const billing = options.billing ?? (process.env['CLAUDE_CODE_OAUTH_TOKEN'] ? 'subscription' : 'api');
  const started = new Date(),
    time = performance.now();
  let host: ProcessResult = { exitCode: 0, stdout: '{}', stderr: '', timedOut: false };
  if (options.simulate) await options.simulate(work);
  else
    host = await backend.host(
      work,
      home,
      task,
      claudeArgs(
        task.statement,
        model,
        manifest.limits.max_turns,
        arm === 'control' ? '/work/.bench-mcp.json' : '/work/.mcp.json',
        billing === 'subscription' ? null : manifest.limits.max_cost_usd,
        arm === 'foker' ? ['mcp__foker'] : [],
      ),
      manifest.limits.max_minutes * 60_000,
    );
  const latency = (performance.now() - time) / 1000;
  const redact = (text: string) =>
    ['CLAUDE_CODE_OAUTH_TOKEN', 'ANTHROPIC_API_KEY'].reduce(
      (v, key) => (process.env[key] ? v.split(process.env[key] as string).join('[credencial omitida]') : v),
      text,
    );
  writeFileSync(join(evidence, 'host.json'), redact(host.stdout));
  writeFileSync(join(evidence, 'stderr.txt'), redact(host.stderr));
  let output: HostOutput = {};
  try {
    output = JSON.parse(host.stdout) as HostOutput;
  } catch {
    /* evidencia de timeout conservada */
  }
  let usage: ReturnType<typeof extractUsage> | null = null;
  try {
    if (output.usage) usage = extractUsage(output, manifest);
  } catch (error) {
    writeFileSync(join(evidence, 'usage-error.txt'), String(error));
  }
  const sub = await submission(work, prepared);
  writeFileSync(join(evidence, 'submission.patch'), sub.patch);
  // Directorio privado por ejecución: tests ocultos de esta tarea y entrega de esta ejecución.
  const runPrivate = join(base, 'private');
  cpSync(join(privateDir, 'hidden'), join(runPrivate, 'hidden'), { recursive: true, verbatimSymlinks: true });
  writeFileSync(join(runPrivate, 'submission.patch'), sub.patch);
  const rc = await backend.evaluate(snapshot, preparedHome, task, runPrivate);
  writeFileSync(join(evidence, 'evaluation.json'), JSON.stringify({ rc, violations: sub.violations }));
  const traces: unknown[] = [output.transcript, output.tool_traces];
  writeFileSync(join(evidence, 'traces.json'), JSON.stringify(traces));
  const exposed = traceMetrics(traces);
  const ok = (phase: string) => rc[phase] === 0;
  const limitsOk =
    !host.timedOut &&
    host.exitCode === 0 &&
    !output.is_error &&
    (options.simulate !== undefined ||
      (usage !== null &&
        (usage.turns ?? Number.POSITIVE_INFINITY) <= manifest.limits.max_turns &&
        latency / 60 <= manifest.limits.max_minutes &&
        (manifest.limits.max_cost_usd === null || (usage.cost_usd ?? 0) <= manifest.limits.max_cost_usd)));
  const breakdown = {
    fail_to_pass: ok('apply_submission') && ok('hidden_tests') && ok('build') && ok('f2p'),
    pass_to_pass: ok('apply_submission') && ok('p2p'),
    typecheck_lint: ok('apply_submission') && ok('quality'),
    protected_untouched: sub.violations.length === 0,
    within_limits: limitsOk,
  };
  const testFiles = new Set(task.hidden_tests);
  const result: BenchmarkResult = {
    schema_version: 1,
    run_id: options.runId ?? 'single',
    manifest_hash: hashCanonicalJson(JSON.stringify(manifest)),
    task_id: task.id,
    // El esquema v1 solo admite fix/feature/refactor/test: perf → refactor, otro → fix (ADR-035).
    task_type: ({ fix: 'fix', feat: 'feature', perf: 'refactor', refactor: 'refactor', otro: 'fix' } as const)[
      task.type
    ],
    repo: { name: task.repo, commit: task.base },
    arm,
    repetition,
    host: manifest.host,
    billing,
    model,
    foker_version: arm === 'foker' ? manifest.foker_version : null,
    started_at: started.toISOString(),
    limits: {
      max_turns: manifest.limits.max_turns,
      max_minutes: manifest.limits.max_minutes,
      ...(manifest.limits.max_cost_usd === null ? {} : { max_cost_usd: manifest.limits.max_cost_usd }),
    },
    metrics: {
      input_tokens_total: usage?.input_tokens_total ?? null,
      cached_tokens: usage?.cached_tokens ?? null,
      cache_write_tokens: usage?.cache_write_tokens ?? null,
      output_tokens: usage?.output_tokens ?? null,
      cost_usd: usage?.cost_usd ?? null,
      reported_cost_usd: usage?.reported_cost_usd ?? null,
      latency_s: latency,
      files_exposed: exposed.files.size,
      files_modified: sub.names.length,
      exposure_precision: exposed.files.size
        ? [...exposed.files].filter((p) => task.gold_modified.includes(p)).length / exposed.files.size
        : null,
      exposure_recall: task.gold_modified.length
        ? task.gold_modified.filter((p) => exposed.files.has(p)).length / task.gold_modified.length
        : null,
      out_of_scope_edits: sub.names.filter((p) => !task.gold_modified.includes(p) && !testFiles.has(p)).length,
      errors: exposed.errors + Number(host.exitCode !== 0 || host.timedOut || output.is_error === true),
      retries: null,
      tests_passed: (Number(breakdown.fail_to_pass) + Number(breakdown.pass_to_pass)) / 2,
      ccr_relevante: null,
    },
    success: Object.values(breakdown).every(Boolean),
    success_breakdown: breakdown,
    notes:
      'Fixture B (ADR-035): entrega = git diff contra el árbol preparado; tests ocultos de C sobrescritos en la evaluación sin red. retries y ccr_relevante no instrumentados.',
  };
  const valid = validate('benchmark-result', result);
  if (!valid.ok) throw new Error(formatIssues(valid.issues));
  if (!options.simulate) {
    const results = options.resultsDir ?? join(ROOT, 'benchmarks/results');
    mkdirSync(results, { recursive: true });
    if (!/^[a-zA-Z0-9_.-]+$/.test(result.run_id)) throw new Error('run_id inválido');
    appendFileSync(join(results, `${result.run_id}.jsonl`), `${JSON.stringify(result)}\n`);
  }
  return result;
}
