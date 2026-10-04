import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validate } from '@foker/schemas';
import { afterEach, expect, it } from 'vitest';
import { fixtureFiles, generate } from './fixtures/fixture-a/generate.mjs';
import { evaluateContext, type GoldCase, score } from './src/ctx-gold.js';
import { type EvaluationTask, evaluateTask, tree } from './src/evaluate-task.js';
import { readManifest } from './src/validate-manifest.js';
import { validateResults } from './src/validate-results.js';

const repo = fileURLToPath(new URL('../', import.meta.url));
const roots: string[] = [];
function temp() {
  const root = mkdtempSync(join(tmpdir(), 'foker-benchmark-test-'));
  roots.push(root);
  return root;
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

it('valida manifiesto, rechaza commits inválidos y precios negativos, conserva pendientes', () => {
  const manifest = readManifest(join(repo, 'benchmarks/manifest.yaml'));
  expect(manifest.model).toBeNull();
  expect(manifest.suites.smoke).toHaveLength(3);
  const bad = structuredClone(manifest);
  const firstRepo = bad.repos[0];
  const firstPrice = bad.prices.models[0];
  if (!firstRepo || !firstPrice) throw new Error('Manifiesto incompleto');
  firstRepo.commit = 'abc';
  expect(validate('benchmark-manifest', bad).ok).toBe(false);
  firstRepo.commit = 'a'.repeat(40);
  firstPrice.input = -1;
  expect(validate('benchmark-manifest', bad).ok).toBe(false);
});
it('genera bytes idénticos con la misma semilla, seis paquetes y ~300 archivos', () => {
  const a = temp();
  const b = temp();
  generate(a, 42);
  generate(b, 42);
  expect(tree(a)).toEqual(tree(b));
  expect(tree(a).size).toBeGreaterThanOrEqual(280);
  expect(tree(a).size).toBeLessThanOrEqual(330);
  expect(readdirSync(join(a, 'packages'))).toHaveLength(6);
  expect(fixtureFiles(43)).not.toEqual(fixtureFiles(42));
});
it('los 20 gold patches se aplican y declaran exactamente los archivos modificados', () => {
  const tasks = join(repo, 'benchmarks/fixtures/fixture-a/tasks');
  const counts: Record<string, number> = {};
  for (const id of readdirSync(tasks).sort()) {
    const root = temp();
    generate(root);
    const meta = JSON.parse(readFileSync(join(tasks, id, 'meta.json'), 'utf8')) as {
      type: string;
      gold_modified: string[];
    };
    counts[meta.type] = (counts[meta.type] ?? 0) + 1;
    const patch = join(tasks, id, 'gold.patch');
    expect(spawnSync('git', ['apply', '--check', patch], { cwd: root }).status, id).toBe(0);
    const before = tree(root);
    expect(spawnSync('git', ['apply', patch], { cwd: root }).status, id).toBe(0);
    const after = tree(root);
    const changed = [...new Set([...before.keys(), ...after.keys()])].filter(
      (p) => !before.get(p)?.equals(after.get(p) ?? Buffer.alloc(0)),
    );
    expect(changed.sort(), id).toEqual(meta.gold_modified.sort());
  }
  expect(counts).toEqual({ fix: 8, feature: 6, refactor: 4, test: 2 });
});
it('valida JSONL por línea y rechaza inválidos y vacío', async () => {
  const root = temp();
  const path = join(root, 'results.jsonl');
  const result = readFileSync(join(repo, 'packages/schemas/examples/benchmark-result.json'), 'utf8');
  writeFileSync(path, `${JSON.stringify(JSON.parse(result))}\n`);
  expect(await validateResults(path)).toBe(1);
  writeFileSync(path, '{}\nno-json\n');
  await expect(validateResults(path)).rejects.toThrow('línea 2');
  writeFileSync(path, '');
  await expect(validateResults(path)).rejects.toThrow('vacío');
});

function evaluationFixture() {
  const fixture = temp();
  const work = temp();
  const hiddenRoot = temp();
  writeFileSync(join(fixture, 'logic.mjs'), 'export const total = (a,b) => a+b;\n');
  writeFileSync(
    join(fixture, 'regression.mjs'),
    `import assert from 'node:assert/strict'; import { total } from './logic.mjs'; assert.equal(total(2,2),4);\n`,
  );
  mkdirSync(join(fixture, '.github'));
  writeFileSync(join(fixture, '.github/ci.yml'), 'trusted');
  writeFileSync(join(fixture, 'pnpm-lock.yaml'), 'trusted');
  writeFileSync(
    join(fixture, 'types.mjs'),
    `import { total } from './logic.mjs'; if (typeof total !== 'function') process.exit(1);\n`,
  );
  writeFileSync(
    join(fixture, 'lint.mjs'),
    `import { readFileSync } from 'node:fs'; if (readFileSync('logic.mjs','utf8').includes('debugger')) process.exit(1);\n`,
  );
  writeFileSync(
    join(hiddenRoot, 'accept.mjs'),
    `import assert from 'node:assert/strict'; import { total } from './logic.mjs'; assert.equal(total(2,3),6);\n`,
  );
  cpSync(fixture, work, { recursive: true });
  const task: EvaluationTask = {
    id: 'minimal',
    hidden_tests: {
      fail_to_pass: { paths: ['accept.mjs'], destinations: ['accept.mjs'], command: [process.execPath, 'accept.mjs'] },
      pass_to_pass: { paths: ['regression.mjs'], command: [process.execPath, 'regression.mjs'] },
    },
    default_checks: [
      [process.execPath, 'types.mjs'],
      [process.execPath, 'lint.mjs'],
    ],
  };
  return {
    fixture,
    work,
    hiddenRoot,
    task,
    usage: { turns: 3, minutes: 1, cost_usd: 0.2 },
    limits: { max_turns: 60, max_minutes: 30, max_cost_usd: 1 },
    timeoutMs: 3000,
  };
}
it('evalúa solución gold, incorrecta, protegidos y límites con scripts node sin instalar', async () => {
  const opts = evaluationFixture();
  const patch = join(temp(), 'gold.patch');
  writeFileSync(
    patch,
    'diff --git a/logic.mjs b/logic.mjs\n--- a/logic.mjs\n+++ b/logic.mjs\n@@ -1 +1 @@\n-export const total = (a,b) => a+b;\n+export const total = (a,b) => a*b;\n',
  );
  expect((await evaluateTask(opts)).success_breakdown.fail_to_pass).toBe(false);
  expect(spawnSync('git', ['apply', patch], { cwd: opts.work }).status).toBe(0);
  expect((await evaluateTask(opts)).success).toBe(true);
  for (const protectedPath of ['.github/ci.yml', 'pnpm-lock.yaml', 'accept.mjs']) {
    const bytes = protectedPath === 'accept.mjs' ? undefined : readFileSync(join(opts.work, protectedPath));
    writeFileSync(join(opts.work, protectedPath), 'tampered');
    expect((await evaluateTask(opts)).success_breakdown.protected_untouched).toBe(false);
    if (bytes) writeFileSync(join(opts.work, protectedPath), bytes);
    else rmSync(join(opts.work, protectedPath));
  }
  opts.usage.turns = 61;
  expect((await evaluateTask(opts)).success_breakdown.within_limits).toBe(false);
  opts.usage.turns = 3;
  opts.usage.cost_usd = Number.NaN;
  expect((await evaluateTask(opts)).success_breakdown.within_limits).toBe(false);
  writeFileSync(join(opts.work, 'logic.mjs'), 'invalid syntax');
  const broken = await evaluateTask(opts);
  expect(broken.success).toBe(false);
  expect(broken.success_breakdown.pass_to_pass).toBe(false);
});
it('no acepta presupuesto desconocido ni checks con timeout', async () => {
  const opts = evaluationFixture();
  opts.task.default_checks[0] = [process.execPath, '-e', 'setInterval(()=>{},1000)'];
  const result = await evaluateTask({ ...opts, limits: { ...opts.limits, max_cost_usd: null }, timeoutMs: 50 });
  expect(result.success_breakdown.typecheck_lint).toBe(false);
  expect(result.success_breakdown.within_limits).toBe(false);
});
it('ctx-gold tiene 30 casos, diez monorepo, deriva el gold y cuenta L1/lecturas relevantes', async () => {
  const cases = readFileSync(join(repo, 'benchmarks/ctx-gold/cases.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as GoldCase);
  expect(cases).toHaveLength(30);
  expect(cases.filter((c) => c.fixture === 'monorepo-pnpm')).toHaveLength(10);
  for (const item of cases.filter((c) => c.fixture === 'fixture-a')) {
    const meta = JSON.parse(
      readFileSync(join(repo, `benchmarks/fixtures/fixture-a/tasks/${item.id}/meta.json`), 'utf8'),
    );
    expect(item.gold_modified).toEqual(meta.gold_modified);
  }
  expect(score(['a', 'b', 'c'], ['a', 'z'], ['b'])).toEqual({ recall: 0.5, precision: 2 / 3 });
  const firstMono = cases[20];
  if (!firstMono) throw new Error('Caso monorepo ausente');
  const report = await evaluateContext([firstMono], repo);
  expect(report.rows[0]?.tokens).toBeLessThanOrEqual(8000);
  expect(report.recall).toBe(1);
});

it('restaura scripts y manifests: typecheck sustituido por exit 0 no oculta errores', async () => {
  const opts = evaluationFixture();
  mkdirSync(join(opts.fixture, 'scripts'));
  writeFileSync(join(opts.fixture, 'scripts/types.mjs'), 'process.exit(1);\n');
  writeFileSync(
    join(opts.fixture, 'package.json'),
    JSON.stringify({ scripts: { typecheck: 'node scripts/types.mjs' } }),
  );
  mkdirSync(join(opts.work, 'scripts'));
  writeFileSync(join(opts.work, 'scripts/types.mjs'), 'process.exit(0);\n');
  writeFileSync(join(opts.work, 'package.json'), JSON.stringify({ scripts: { typecheck: 'exit 0' } }));
  opts.task.default_checks[0] = ['npm', 'run', 'typecheck'];
  const result = await evaluateTask(opts);
  expect(result.success_breakdown.typecheck_lint).toBe(false);
  expect(result.success_breakdown.protected_untouched).toBe(false);
});

it('workspace links relativos ejecutan el código entregado y no el fixture original', async () => {
  const opts = evaluationFixture();
  mkdirSync(join(opts.fixture, 'node_modules'));
  const { symlinkSync } = await import('node:fs');
  symlinkSync('../logic.mjs', join(opts.fixture, 'node_modules/logic.mjs'));
  writeFileSync(
    join(opts.hiddenRoot, 'accept.mjs'),
    "import assert from 'node:assert/strict'; import { total } from './node_modules/logic.mjs'; assert.equal(total(2,3),6);\n",
  );
  writeFileSync(join(opts.work, 'logic.mjs'), 'export const total = (a,b) => a*b;\n');
  expect((await evaluateTask(opts)).success).toBe(true);
});

it('ejecuta tests entregados y exige que detecten el defecto del código original', async () => {
  const opts = evaluationFixture();
  opts.task.type = 'test';
  opts.task.submitted_tests = { paths: ['delivered.mjs'], command: [process.execPath, 'delivered.mjs'] };
  writeFileSync(join(opts.work, 'logic.mjs'), 'export const total = (a,b) => a*b;\n');
  writeFileSync(
    join(opts.work, 'delivered.mjs'),
    "import assert from 'node:assert/strict'; import { total } from './logic.mjs'; assert.equal(total(2,3),6);\n",
  );
  expect((await evaluateTask(opts)).success).toBe(true);
  writeFileSync(join(opts.work, 'delivered.mjs'), '// expect(total(2,3)).toBe(6);\n');
  expect((await evaluateTask(opts)).success).toBe(false);
  writeFileSync(join(opts.work, 'delivered.mjs'), 'process.exit(1);\n');
  expect((await evaluateTask(opts)).success).toBe(false);
});

it('las tareas discriminan sin filtrar rutas ni texto de issues en JSDoc', () => {
  const root = join(repo, 'benchmarks/fixtures/fixture-a/tasks');
  const metas = readdirSync(root).map((id) => JSON.parse(readFileSync(join(root, id, 'meta.json'), 'utf8')));
  expect(metas.filter((m) => m.modified.length >= 2).length).toBeGreaterThanOrEqual(8);
  expect(metas.filter((m) => m.cross_package).length).toBeGreaterThanOrEqual(5);
  expect(metas.filter((m) => m.decoy).length).toBe(5);
  expect(metas.filter((m) => m.hint).length).toBeLessThanOrEqual(4);
  for (const meta of metas) {
    expect(meta.modified).toEqual(meta.gold_modified);
    expect(meta.packages).toEqual([...new Set(meta.modified.map((p: string) => p.split('/')[1]))].sort());
    const task = readFileSync(join(root, meta.id, 'task.md'), 'utf8');
    if (!meta.hint) expect(task).not.toMatch(/packages\/|Área:/);
    for (const source of Object.values(fixtureFiles()) as string[]) {
      for (const comment of source.match(/\/\*\*[\s\S]*?\*\//g) ?? [])
        expect(task).not.toContain(comment.slice(3, -2).trim());
    }
  }
});
