import { randomUUID } from 'node:crypto';
import {
  appendFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { estimateTokens, hashCanonicalJson } from '@foker/core';
import { type BenchmarkManifest, type BenchmarkResult, formatIssues, validate } from '@foker/schemas';
import { generate } from '../../fixtures/fixture-a/generate.mjs';
import { type EvaluationTask, type evaluateTask, tree } from '../evaluate-task.js';
import { extractUsage, type HostOutput, traceMetrics } from './metrics.js';
import { detectRuntime, execute, type ProcessResult } from './process.js';
export const ROOT = process.env['FOKER_BENCH_ROOT'] ?? fileURLToPath(new URL('../../../', import.meta.url));
export type Task = BenchmarkManifest['tasks'][number];
export type Arm = 'control' | 'foker';
export function claudeArgs(
  statement: string,
  model: string,
  turns: number,
  mcp: string,
  cost: number | null,
): string[] {
  return [
    '-p',
    statement,
    '--output-format',
    'json',
    '--model',
    model,
    '--max-turns',
    String(turns),
    '--strict-mcp-config',
    '--mcp-config',
    mcp,
    '--permission-mode',
    'acceptEdits',
    ...(cost === null ? [] : ['--max-budget-usd', String(cost)]),
  ];
}
export interface Backend {
  prepare?: (root: string, arm: Arm) => Promise<void>;
  host: (root: string, args: string[], timeoutMs: number) => Promise<ProcessResult>;
  evaluate: (options: Parameters<typeof evaluateTask>[0]) => ReturnType<typeof evaluateTask>;
}
export function containerBackend(manifest: BenchmarkManifest): Backend {
  const runtime = detectRuntime(),
    image = `foker-bench:${manifest.foker_version}`;
  const run = async (root: string, command: string[], timeoutMs: number, mounts: string[] = [], api = false) => {
    const name = `foker-bench-${randomUUID()}`;
    return execute(
      runtime,
      [
        'run',
        '--rm',
        '--name',
        name,
        '--read-only',
        '--tmpfs',
        '/tmp:rw,nosuid,size=1g',
        '--memory',
        '4g',
        '--cpus',
        '2',
        '--pids-limit',
        '256',
        '--user',
        `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`,
        '--env',
        'HOME=/tmp/home',
        '--env',
        'XDG_CONFIG_HOME=/tmp/xdg',
        ...(api && process.env['ANTHROPIC_API_KEY'] ? ['--env', 'ANTHROPIC_API_KEY'] : []),
        '--mount',
        `type=bind,src=${root},dst=/work`,
        ...mounts,
        '--workdir',
        '/work',
        image,
        ...command,
      ],
      ROOT,
      timeoutMs,
      async () => {
        // Await kill so evaluation cannot race a still running host container.
        const killed = await execute(runtime, ['kill', name], ROOT, 10_000);
        if (killed.exitCode !== 0) throw new Error(`No se pudo detener ${name}: ${killed.stderr}`);
      },
    );
  };
  return {
    prepare: async (root, arm) => {
      const result = await run(root, ['node', '/opt/foker/benchmarks/docker/prepare.mjs', arm], 300_000);
      if (result.exitCode !== 0) throw new Error(`Preparación: ${result.stderr}`);
    },
    host: (root, args, timeout) =>
      run(root, ['node', '/opt/foker/benchmarks/docker/host.mjs', manifest.host.version, ...args], timeout, [], true),
    evaluate: async (options) => {
      const file = join(dirname(options.work), 'evaluation.json');
      writeFileSync(file, JSON.stringify({ ...options, work: '/work', fixture: '/baseline', hiddenRoot: '/hidden' }));
      const result = await run(
        options.work,
        ['node', '/opt/foker/benchmarks/docker/evaluate.mjs', '/evaluation.json'],
        3_600_000,
        [
          '--network',
          'none',
          '--mount',
          `type=bind,src=${join(ROOT, 'benchmarks/fixtures/fixture-a/tasks')},dst=/hidden/benchmarks/fixtures/fixture-a/tasks,readonly`,
          '--mount',
          `type=bind,src=${options.fixture},dst=/baseline,readonly`,
          '--mount',
          `type=bind,src=${file},dst=/evaluation.json,readonly`,
        ],
      );
      if (result.exitCode !== 0) throw new Error(`Evaluación: ${result.stderr}`);
      return JSON.parse(result.stdout) as Awaited<ReturnType<typeof evaluateTask>>;
    },
  };
}
export async function runTask(options: {
  task: Task;
  arm: Arm;
  repetition: number;
  manifest: BenchmarkManifest;
  workDir: string;
  runId?: string;
  backend?: Backend;
  resultsDir?: string;
}): Promise<BenchmarkResult> {
  const { task, arm, repetition, manifest } = options;
  if (!manifest.model) throw new Error('Modelo exacto obligatorio incluso con --allow-null-pricing');
  const base = resolve(options.workDir);
  if (existsSync(base) && readdirSync(base).length) throw new Error('workDir debe estar vacío');
  const work = join(base, 'work'),
    fixture = join(base, 'baseline');
  const repo = manifest.repos.find((r) => r.name === task.repo);
  if (repo?.name !== 'fixture-a') throw new Error('Fixture B/repos reales pendientes de FKR-014');
  generate(work, manifest.seeds.fixture);
  const git = async (args: string[]) => {
    const r = await execute(
      'git',
      ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', ...args],
      work,
      30_000,
      undefined,
      {
        ...process.env,
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_AUTHOR_DATE: '2000-01-01T00:00:00Z',
        GIT_COMMITTER_DATE: '2000-01-01T00:00:00Z',
      },
    );
    if (r.exitCode !== 0) throw new Error(r.stderr);
    return r.stdout.trim();
  };
  await git(['init', '-q']);
  await git(['add', '.']);
  await git(['-c', 'user.name=Foker Benchmark', '-c', 'user.email=benchmark@invalid', 'commit', '-qm', 'Fixture A']);
  const commit = await git(['rev-parse', 'HEAD']);
  const backend = options.backend ?? containerBackend(manifest);
  await backend.prepare?.(work, arm);
  cpSync(work, fixture, { recursive: true, verbatimSymlinks: true });
  const before = tree(fixture);
  const mcp = join(base, 'control-mcp.json');
  writeFileSync(mcp, '{"mcpServers":{}}\n');
  // Empty config in control; no Foker MCP, instructions or skills are installed.
  if (arm === 'control') writeFileSync(join(work, '.bench-mcp.json'), '{"mcpServers":{}}\n');
  const started = new Date(),
    time = performance.now();
  const host = await backend.host(
    work,
    claudeArgs(
      task.statement,
      manifest.model,
      manifest.limits.max_turns,
      arm === 'control' ? '/work/.bench-mcp.json' : '/work/.mcp.json',
      manifest.limits.max_cost_usd,
    ),
    manifest.limits.max_minutes * 60_000,
  );
  const latency = (performance.now() - time) / 1000;
  const evidence = join(base, 'evidence');
  mkdirSync(evidence);
  writeFileSync(join(evidence, 'fixture-commit.txt'), `${commit}\n`);
  writeFileSync(join(evidence, 'host.json'), host.stdout);
  writeFileSync(join(evidence, 'stderr.txt'), host.stderr);
  let output: HostOutput = {};
  try {
    output = JSON.parse(host.stdout) as HostOutput;
  } catch {
    /* timeout evidence retained */
  }
  let usage: ReturnType<typeof extractUsage> | null = null;
  try {
    if (output.usage) usage = extractUsage(output, manifest);
  } catch (error) {
    writeFileSync(join(evidence, 'usage-error.txt'), String(error));
  }
  writeFileSync(join(evidence, 'usage.json'), JSON.stringify(usage));

  const meta = JSON.parse(readFileSync(join(ROOT, dirname(task.gold_patch), 'meta.json'), 'utf8')) as EvaluationTask;
  const after = tree(work);
  const submitted = join(base, 'submitted');
  mkdirSync(submitted);
  for (const [path, bytes] of after) {
    mkdirSync(dirname(join(submitted, path)), { recursive: true });
    writeFileSync(join(submitted, path), bytes);
  }
  const evaluation = await backend.evaluate({
    work: submitted,
    fixture,
    task: meta,
    hiddenRoot: ROOT,
    usage: {
      turns: usage?.turns ?? Number.NaN,
      minutes: host.timedOut ? manifest.limits.max_minutes + 1 : latency / 60,
      cost_usd: usage?.cost_usd ?? Number.NaN,
    },
    limits: manifest.limits,
  });
  const changed = [...new Set([...before.keys(), ...after.keys()])].filter(
    (p) =>
      p !== '.bench-mcp.json' &&
      (!before.has(p) || !after.has(p) || !before.get(p)?.equals(after.get(p) ?? Buffer.alloc(0))),
  );
  const traces: unknown[] = [output.transcript, output.tool_traces];
  const scan = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (lstatSync(path).isSymbolicLink()) throw new Error('Symlink de evidencia rechazado');
      if (entry.isDirectory()) scan(path);
      else if (/\.jsonl?$/.test(entry.name)) {
        for (const line of readFileSync(path, 'utf8').split('\n')) {
          try {
            traces.push(JSON.parse(line));
          } catch {
            /* other evidence */
          }
        }
      }
    }
  };
  if (arm === 'foker') scan(join(work, '.foker'));
  writeFileSync(join(evidence, 'traces.json'), JSON.stringify(traces));
  const exposed = traceMetrics(traces),
    relevant = new Set([...task.gold_modified, ...(task.gold_read ?? [])]);
  const ledger: unknown[] = [];
  const ledgerDir = join(work, '.foker/tasks');
  if (arm === 'foker' && existsSync(ledgerDir))
    for (const name of readdirSync(ledgerDir))
      if (name.endsWith('.events.jsonl'))
        for (const line of readFileSync(join(ledgerDir, name), 'utf8').trim().split('\n').filter(Boolean)) {
          if (lstatSync(join(ledgerDir, name)).isSymbolicLink()) throw new Error('Symlink de ledger rechazado');
          ledger.push(JSON.parse(line));
        }
  const retries =
    arm === 'foker'
      ? ledger.filter((v) => (v as { to?: string }).to === 'REJECTED').length
      : !output.transcript && !output.tool_traces
        ? null
        : exposed.retries;
  const ccr =
    arm === 'foker' && exposed.packs.length
      ? exposed.packs.reduce(
          (sum, pack) =>
            sum +
            pack.files.reduce(
              (n, file) => n + (after.has(file) ? estimateTokens((after.get(file) ?? Buffer.alloc(0)).toString()) : 0),
              0,
            ),
          0,
        ) / exposed.packs.reduce((sum, pack) => sum + pack.tokens, 0)
      : null;

  const result: BenchmarkResult = {
    schema_version: 1,
    run_id: options.runId ?? 'single',
    manifest_hash: hashCanonicalJson(JSON.stringify(manifest)),
    task_id: task.id,
    task_type: task.type,
    repo: { name: task.repo, commit: manifest.repos.find((r) => r.name === task.repo)?.commit ?? '' },
    arm,
    repetition,
    host: manifest.host,
    model: manifest.model,
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
      latency_s: latency,
      files_exposed: exposed.files.size,
      files_modified: changed.length,
      exposure_precision: exposed.files.size
        ? [...exposed.files].filter((p) => relevant.has(p)).length / exposed.files.size
        : null,
      exposure_recall: task.gold_modified.filter((p) => exposed.files.has(p)).length / task.gold_modified.length,
      out_of_scope_edits: changed.filter(
        (p) => !task.gold_modified.includes(p) && !meta.submitted_tests?.paths.includes(p),
      ).length,
      errors: exposed.errors + Number(host.exitCode !== 0 || host.timedOut || output.is_error === true),
      retries,
      tests_passed:
        (Number(evaluation.success_breakdown.fail_to_pass) + Number(evaluation.success_breakdown.pass_to_pass)) / 2,
      ccr_relevante: ccr,
    },
    success: evaluation.success && host.exitCode === 0 && !host.timedOut && !output.is_error,
    success_breakdown: {
      ...evaluation.success_breakdown,
      within_limits:
        evaluation.success_breakdown.within_limits && !host.timedOut && host.exitCode === 0 && !output.is_error,
    },
    notes:
      'Exposición aproximada: lecturas explícitas y packs L1–L3; Bash y trazas omitidas no observables. tests_passed: fracción de grupos, no casos. Coste reportado en evidence/usage.json.',
  };
  const valid = validate('benchmark-result', result);
  if (!valid.ok) throw new Error(formatIssues(valid.issues));
  const results = options.resultsDir ?? join(ROOT, 'benchmarks/results');
  mkdirSync(results, { recursive: true });
  if (!/^[a-zA-Z0-9_.-]+$/.test(result.run_id)) throw new Error('run_id inválido');
  appendFileSync(join(results, `${result.run_id}.jsonl`), `${JSON.stringify(result)}\n`);
  return result;
}
