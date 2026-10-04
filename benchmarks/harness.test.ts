import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { type EvaluationTask, evaluateTask } from './src/evaluate-task.js';
import { type Backend, claudeArgs, ROOT, runTask } from './src/harness/index.js';
import { extractUsage, traceMetrics } from './src/harness/metrics.js';
import { plan, runId } from './src/harness/plan.js';
import { execute } from './src/harness/process.js';
import { readManifest } from './src/validate-manifest.js';
import { validateResults } from './src/validate-results.js';

const temps: string[] = [];
afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function setup(mode = 'gold') {
  const dir = mkdtempSync(join(tmpdir(), 'foker-harness-test-'));
  temps.push(dir);
  const manifest = readManifest(join(ROOT, 'benchmarks/manifest.yaml'));
  manifest.model = 'test-model-exact-20261004';
  manifest.host.version = '1.0.0';
  manifest.prices.models = [{ model: manifest.model, input: 3, cache_read: 0.2, cache_write: 4, output: 15 }];
  manifest.limits.max_cost_usd = 1;

  const backend: Backend = {
    prepare: async (root, arm) => {
      symlinkSync(join(ROOT, 'node_modules'), join(root, 'node_modules'));
      if (arm === 'foker') {
        const env = { ...process.env, CI: 'true', XDG_CONFIG_HOME: join(dir, 'xdg') };
        for (const args of [['init', '--targets', 'claude-code'], ['trust', '--yes', '--ci'], ['map']]) {
          const { spawn } = await import('node:child_process');
          await new Promise<void>((resolve, reject) => {
            const child = spawn(process.execPath, [join(ROOT, 'packages/cli/dist/bin.js'), ...args], {
              cwd: root,
              env,
            });
            let error = '';
            child.stderr.on('data', (data: Buffer) => {
              error += data.toString();
            });
            child.on('error', reject);
            child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(error))));
          });
        }
      }
    },
    host: async (root, args, timeout) => {
      expect(args).toContain('--strict-mcp-config');
      expect(args).toContain('acceptEdits');
      const outputFile = join(dir, 'fake-output.json');
      const result = await execute(
        process.execPath,
        [join(ROOT, 'benchmarks/test/fake-host.mjs'), mode, join(ROOT, manifest.tasks[0].gold_patch), outputFile],
        root,
        mode === 'timeout' ? 300 : timeout,
      );
      return { ...result, stdout: readFileSync(outputFile, 'utf8') };
    },
    evaluate: (options) => {
      const task = structuredClone(options.task) as EvaluationTask;
      const remap = (argv: string[]) =>
        argv[1] === 'exec'
          ? [process.execPath, join(ROOT, 'node_modules/vitest/vitest.mjs'), ...argv.slice(3)]
          : argv.at(-1) === 'typecheck'
            ? [process.execPath, join(ROOT, 'node_modules/typescript/bin/tsc'), '--noEmit']
            : [process.execPath, 'scripts/lint.mjs'];
      for (const group of Object.values(task.hidden_tests)) group.command = remap(group.command);
      task.default_checks = task.default_checks.map(remap);
      return evaluateTask({ ...options, task });
    },
  };
  return { dir, manifest, backend };
}
describe('arnés end-to-end sin red', () => {
  for (const arm of ['control', 'foker'] as const)
    it(`${arm}: Fixture A, gold, evaluación y JSONL`, async () => {
      const { dir, manifest, backend } = setup();
      const result = await runTask({
        task: manifest.tasks[0],
        arm,
        repetition: 1,
        manifest,
        workDir: join(dir, 'run'),
        backend,
        resultsDir: join(dir, 'results'),
        runId: 'test',
      });
      expect(result.success).toBe(true);
      expect(result.metrics.files_modified).toBe(1);
      expect(result.metrics.out_of_scope_edits).toBe(0);
      expect(result.metrics.input_tokens_total).toBe(3500);
      expect(result.metrics.cost_usd).toBeCloseTo(0.0069);
      expect(result.metrics.exposure_precision).toBe(1);
      expect(await validateResults(join(dir, 'results/test.jsonl'))).toBe(1);
      expect(existsSync(join(dir, 'run/work/AGENTS.md'))).toBe(arm === 'foker');
      expect(existsSync(join(dir, 'run/work/.mcp.json'))).toBe(arm === 'foker');
      expect(readFileSync(join(dir, 'run/evidence/usage.json'), 'utf8')).toContain('reported_cost_usd');
    }, 30_000);
  it('solución rota fracasa', async () => {
    const { dir, manifest, backend } = setup('broken');
    const result = await runTask({
      task: manifest.tasks[0],
      arm: 'control',
      repetition: 1,
      manifest,
      workDir: join(dir, 'run'),
      backend,
      resultsDir: join(dir, 'results'),
    });
    expect(result.success).toBe(false);
    expect(result.success_breakdown.fail_to_pass).toBe(false);
  }, 30_000);
  it('timeout mata al anfitrión simulado y falla límites aunque aplique gold', async () => {
    const { dir, manifest, backend } = setup('timeout');
    const result = await runTask({
      task: manifest.tasks[0],
      arm: 'foker',
      repetition: 1,
      manifest,
      workDir: join(dir, 'run'),
      backend,
      resultsDir: join(dir, 'results'),
    });
    expect(result.success).toBe(false);
    expect(result.success_breakdown.within_limits).toBe(false);
    expect(result.metrics.errors).toBe(1);
  }, 30_000);
});
it('usage no inventa descuentos ni coste; flags y plan deterministas', () => {
  const { manifest } = setup();
  const output = {
    usage: { input_tokens: 10, cache_read_input_tokens: 20, cache_creation_input_tokens: 30, output_tokens: 40 },
    num_turns: 2,
  };
  expect(extractUsage(output, manifest).cost_usd).toBeCloseTo(0.000754);
  const price = manifest.prices.models[0];
  if (!price) throw new Error('Precio ausente');
  price.cache_read = null;
  expect(extractUsage(output, manifest).cost_usd).toBeNull();
  expect(() => extractUsage({}, manifest)).toThrow('usage');
  expect(plan(manifest, 'smoke', 'both', 3)).toEqual(plan(manifest, 'smoke', 'both', 3));
  expect(plan(manifest, 'smoke', 'both', 3)).toHaveLength(18);
  expect(runId(42, '2026-10-04')).toBe(runId(42, '2026-10-04'));
  expect(claudeArgs('statement', 'exact', 3, '/mcp', 1)).toContain('--max-budget-usd');
});
it('packs L0 excluidos, lecturas y retries de Bash correlacionados', () => {
  const traces = [
    {
      pack_hash: 'a',
      files: [
        { id: 'file:a.ts', level: 'L1' },
        { id: 'file:b.ts', level: 'L0' },
      ],
      budget: { used: 20 },
    },
    { type: 'tool_use', id: 't', name: 'Bash', input: { command: 'pnpm run typecheck' } },
    { type: 'tool_result', tool_use_id: 't', is_error: true },
  ];
  const result = traceMetrics(traces);
  expect([...result.files]).toEqual(['a.ts']);
  expect(result.retries).toBe(1);
  expect(result.packs).toHaveLength(1);
});

it('null pricing y transcript ausente se conservan en JSONL y nunca acreditan éxito', async () => {
  const { dir, manifest, backend } = setup();
  const price = manifest.prices.models[0];
  if (!price) throw new Error('Precio ausente');
  price.input = null;
  const host = backend.host;
  backend.host = async (...args) => {
    const result = await host(...args);
    const output = JSON.parse(result.stdout);
    delete output.transcript;
    delete output.tool_traces;
    return { ...result, stdout: JSON.stringify(output) };
  };
  const result = await runTask({
    task: manifest.tasks[0],
    arm: 'control',
    repetition: 1,
    manifest,
    workDir: join(dir, 'run'),
    backend,
    resultsDir: join(dir, 'results'),
    runId: 'null',
  });
  expect(result.metrics.cost_usd).toBeNull();
  expect(result.metrics.retries).toBeNull();
  expect(result.success).toBe(false);
  expect(result.success_breakdown.within_limits).toBe(false);
  expect(await validateResults(join(dir, 'results/null.jsonl'))).toBe(1);
}, 30_000);
it('timeout sin JSON ni usage escribe un fallo válido con tokens desconocidos', async () => {
  const { dir, manifest, backend } = setup();
  backend.host = async () => ({ stdout: '', stderr: 'timeout simulado', exitCode: null, timedOut: true });
  const result = await runTask({
    task: manifest.tasks[0],
    arm: 'control',
    repetition: 1,
    manifest,
    workDir: join(dir, 'run'),
    backend,
    resultsDir: join(dir, 'results'),
    runId: 'timeout-empty',
  });
  expect(result.success).toBe(false);
  expect(result.metrics.input_tokens_total).toBeNull();
  expect(result.metrics.errors).toBe(1);
  expect(await validateResults(join(dir, 'results/timeout-empty.jsonl'))).toBe(1);
}, 30_000);
