#!/usr/bin/env node
/**
 * Benchmark reproducible de tokens, latencia y retención (baseline vs. candidato).
 *
 *   pnpm bench:tokens -- --baseline-ref main [--runs 7] [--out docs/benchmarks/tokens.md]
 *   node scripts/bench-tokens.ts --baseline-bin ../otro/packages/cli/dist/bin.js
 *
 * Tokens: estimador determinista de Foker `bytes-lf/3.2@1` = ceil(bytes UTF-8 tras CRLF→LF × 5/16).
 * Es el mismo que usa el presupuesto del Context Pack; no depende del tokenizador del anfitrión.
 *
 * Aislamiento: cada CLI corre sobre copias idénticas de los fixtures en un directorio temporal, con
 * `XDG_CONFIG_HOME` propio (el trust store del usuario no se toca). Los fixtures son el árbol de
 * `--fixture-ref` (por defecto, la referencia baseline) y `examples/aurora-analytics`.
 */
import { type ChildProcess, execFileSync, spawn, spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { values: args } = parseArgs({
  // pnpm reenvía el separador `--` tal cual.
  args: process.argv.slice(2).filter((a) => a !== '--'),
  options: {
    'baseline-ref': { type: 'string' },
    'baseline-bin': { type: 'string' },
    'candidate-bin': { type: 'string', default: join(repo, 'packages/cli/dist/bin.js') },
    'fixture-ref': { type: 'string' },
    runs: { type: 'string', default: '7' },
    out: { type: 'string' },
    json: { type: 'string' },
    keep: { type: 'boolean', default: false },
  },
});
const RUNS = Math.max(3, Number(args.runs));
const work = mkdtempSync(join(tmpdir(), 'foker-bench-'));
const env = { ...process.env, XDG_CONFIG_HOME: join(work, 'config'), NO_COLOR: '1', CI: '' };

export const tokens = (text: string): number => Math.ceil((Buffer.byteLength(text.replace(/\r\n/g, '\n')) * 5) / 16);
const percentile = (values: number[], p: number): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] ?? 0;
};
const git = (cwd: string, ...a: string[]) => execFileSync('git', a, { cwd, encoding: 'utf8' }).trim();

// ---------------------------------------------------------------------------------------------
// CLIs

function buildBaseline(ref: string): string {
  const dir = join(work, 'baseline');
  git(repo, 'worktree', 'add', '--detach', '--force', dir, ref);
  const run = (cmd: string, a: string[], extra: Record<string, string> = {}) => {
    const r = spawnSync(cmd, a, { cwd: dir, stdio: 'inherit', env: { ...process.env, ...extra } });
    if (r.status !== 0) throw new Error(`baseline: ${cmd} ${a.join(' ')} falló`);
  };
  run('pnpm', ['install', '--frozen-lockfile', '--prefer-offline', '--silent']);
  run('pnpm', ['build:native'], { CARGO_TARGET_DIR: join(work, 'baseline-target') });
  run('pnpm', ['build']);
  return join(dir, 'packages/cli/dist/bin.js');
}

const baselineRef = args['baseline-ref'];
const baselineBin = args['baseline-bin'] ?? (baselineRef ? buildBaseline(baselineRef) : undefined);
const fixtureRef = args['fixture-ref'] ?? baselineRef ?? 'HEAD';
const clis: { name: string; bin: string; rev: string }[] = [
  ...(baselineBin ? [{ name: 'baseline', bin: resolve(baselineBin), rev: baselineRef ?? baselineBin }] : []),
  {
    name: 'candidato',
    bin: resolve(args['candidate-bin'] ?? ''),
    rev: `${git(repo, 'rev-parse', '--short', 'HEAD')}${git(repo, 'status', '--porcelain') ? '+cambios' : ''}`,
  },
];

function cli(bin: string, cwd: string, a: string[]): { stdout: string; status: number; ms: number } {
  const started = performance.now();
  const r = spawnSync('node', [bin, ...a], { cwd, env, encoding: 'utf8', maxBuffer: 64 << 20 });
  return { stdout: r.stdout ?? '', status: r.status ?? -1, ms: performance.now() - started };
}

// ---------------------------------------------------------------------------------------------
// Fixtures: idénticos para cada CLI.

const AURORA_REQUIREMENTS = readFileSync(join(repo, 'examples/aurora-analytics/REQUIREMENTS.md'), 'utf8');

function fixtures(bin: string, label: string) {
  const self = join(work, label, 'self');
  mkdirSync(self, { recursive: true });
  execFileSync('sh', ['-c', `git -C "${repo}" archive "${fixtureRef}" | tar -x -C "${self}"`]);
  // Dependencias del repo (solo lectura) para que typecheck sea real en el escenario de validación.
  symlinkSync(join(repo, 'node_modules'), join(self, 'node_modules'));
  for (const pkg of readdirSync(join(self, 'packages'))) {
    const nm = join(repo, 'packages', pkg, 'node_modules');
    if (existsSync(nm)) symlinkSync(nm, join(self, 'packages', pkg, 'node_modules'));
  }
  const aurora = join(work, label, 'aurora');
  mkdirSync(aurora, { recursive: true });
  cpSync(join(repo, 'examples/aurora-analytics/foker.md'), join(aurora, 'foker.md'));
  for (const dir of [self, aurora]) {
    git(dir, 'init', '-q');
    const init =
      dir === self
        ? ['init', '--targets', 'claude-code,codex,opencode,antigravity', '--non-interactive']
        : ['init', '--from-spec', 'foker.md', '--force', '--targets', 'claude-code', '--non-interactive'];
    const r = cli(bin, dir, init);
    if (r.status !== 0) throw new Error(`${label}: foker init falló en ${dir}:\n${r.stdout}`);
  }
  writeFileSync(join(aurora, 'REQUIREMENTS.md'), AURORA_REQUIREMENTS);
  // typecheck con tsc directo: `pnpm run` reinstalaría dependencias sobre los enlaces.
  const config = join(self, 'foker.config.yaml');
  writeFileSync(
    config,
    readFileSync(config, 'utf8').replace(
      /typecheck:\n(\s+)run:\n(?:\s+- .+\n)+/,
      (_m, indent: string) =>
        `typecheck:\n${indent}run:\n${['node', 'node_modules/typescript/bin/tsc', '-p', 'tsconfig.json'].map((a) => `${indent}  - ${a}`).join('\n')}\n`,
    ),
  );
  for (const dir of [self, aurora]) {
    // Árbol versionado y limpio: sin commit, todo archivo contaría como cambio local (DIRTY).
    git(dir, 'add', '-A');
    git(dir, '-c', 'user.name=bench', '-c', 'user.email=bench@foker.invalid', 'commit', '-qm', 'fixture');
    spawnSync('node', [bin, 'trust', '--yes', '--ci'], { cwd: dir, env: { ...env, CI: 'true' } });
  }
  return { self, aurora };
}

// ---------------------------------------------------------------------------------------------
// Escenarios. `gold`: lo que el agente necesita ver para completar la tarea sin lecturas extra.

interface ContextScenario {
  id: string;
  title: string;
  project: 'self' | 'aurora';
  task: string;
  anchors: string[];
  gold: string[];
}
const scenarios: ContextScenario[] = [
  {
    id: 'exploracion',
    title: 'Exploración inicial (sin anclas)',
    project: 'self',
    task: 'Explorar cómo el servidor MCP construye el Context Pack con gatherContextInputs',
    anchors: [],
    gold: ['packages/mcp/src/index.ts', 'gatherContextInputs'],
  },
  {
    id: 'focal',
    title: 'Edición focalizada de 1 archivo',
    project: 'self',
    task: 'Corregir compactCheck en el servidor MCP',
    anchors: ['packages/mcp/src/index.ts'],
    gold: ['function compactCheck', 'export function shrinkPayload', 'export function limitOutput'],
  },
  {
    id: 'cross',
    title: 'Cambio cross-módulo (mcp + engine)',
    project: 'self',
    task: 'Recortar la salida de checks: compactCheck en el servidor MCP y limitOutput en safety usan shrinkPayload',
    anchors: ['packages/mcp/src/index.ts', 'packages/mcp/src/safety.ts'],
    gold: [
      'function compactCheck',
      'export function limitOutput',
      'export function shrinkPayload',
      'export function sanitize',
    ],
  },
  {
    id: 'aurora',
    title: 'aurora-analytics: ruta webhook con HMAC',
    project: 'aurora',
    task: 'Añadir la ruta de webhook del transportista que verifique HMAC y el origen',
    anchors: ['apps/web/app/api/health/route.ts'],
    gold: ['export function assertSameOrigin', 'x-signature'],
  },
];

// ---------------------------------------------------------------------------------------------
// Cliente MCP stdio mínimo.

class Mcp {
  private child: ChildProcess;
  private buffer = '';
  private next = 0;
  private waiters = new Map<number, (raw: string) => void>();
  constructor(bin: string, root: string) {
    this.child = spawn('node', [bin, 'mcp', '--root', root], { cwd: root, env, stdio: ['pipe', 'pipe', 'ignore'] });
    this.child.stdout?.on('data', (data: Buffer) => {
      this.buffer += data.toString('utf8');
      for (let i = this.buffer.indexOf('\n'); i >= 0; i = this.buffer.indexOf('\n')) {
        const line = this.buffer.slice(0, i);
        this.buffer = this.buffer.slice(i + 1);
        if (line.trim()) this.waiters.get((JSON.parse(line) as { id: number }).id)?.(line);
      }
    });
  }
  request(method: string, params: unknown): Promise<string> {
    const id = ++this.next;
    return new Promise((resolve) => {
      this.waiters.set(id, resolve);
      this.child.stdin?.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
  }
  async start() {
    await this.request('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'bench', version: '1' },
    });
    this.child.stdin?.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
  }
  async call(name: string, a: Record<string, unknown>) {
    const started = performance.now();
    const raw = await this.request('tools/call', { name, arguments: a });
    const ms = performance.now() - started;
    const result = (
      JSON.parse(raw) as { result?: { content?: { text?: string }[]; structuredContent?: Record<string, unknown> } }
    ).result;
    const text = (result?.content ?? []).map((c) => c.text ?? '').join('');
    return { text, structured: result?.structuredContent ?? {}, wire: tokens(raw), ms };
  }
  stop() {
    this.child.kill();
  }
}

// ---------------------------------------------------------------------------------------------
// Medición.

type Row = Record<string, number | string | boolean>;
const results: Record<string, Row> = {};
const latency: Record<string, Row> = {};
const retention: Record<string, Record<string, string[]>> = {};
const determinism: Record<string, boolean> = {};

for (const { name, bin } of clis) {
  console.error(`== ${name}: ${bin}`);
  const fx = fixtures(bin, name);
  const row: Row = {};
  const lat: Row = {};
  retention[name] = {};

  // Project Map: el agente lo ve como recurso foker://map/outline.
  const mcp = new Mcp(bin, fx.self);
  await mcp.start();
  const outline = await mcp.request('resources/read', { uri: 'foker://map/outline' });
  row['map_outline'] = tokens(
    (JSON.parse(outline) as { result?: { contents?: { text?: string }[] } }).result?.contents?.[0]?.text ?? '',
  );
  row['tools_list'] = tokens(
    JSON.stringify((JSON.parse(await mcp.request('tools/list', {})) as { result: { tools: unknown } }).result.tools),
  );

  for (const s of scenarios) {
    const root = s.project === 'self' ? fx.self : fx.aurora;
    const flags = s.anchors.flatMap((a) => ['--anchor', a]);
    const md = cli(bin, root, ['context', s.task, ...flags]);
    row[`ctx_${s.id}`] = tokens(md.stdout);
    retention[name][s.id] = s.gold.filter((g) => !md.stdout.includes(g));
    if (name === 'candidato') determinism[s.id] = cli(bin, root, ['context', s.task, ...flags]).stdout === md.stdout;
    lat[`cli_context_${s.id}_p50`] = percentile(
      Array.from({ length: RUNS }, () => cli(bin, root, ['context', s.task, ...flags]).ms),
      50,
    );
  }

  // MCP: primera respuesta, repetición dentro de una tarea y latencias en caliente.
  for (const s of scenarios.filter((x) => x.project === 'self')) {
    const a = { task: s.task, ...(s.anchors.length ? { anchors: { files: s.anchors } } : {}) };
    const first = await mcp.call('foker_context', a);
    row[`mcp_${s.id}_content`] = tokens(first.text);
    row[`mcp_${s.id}_wire`] = first.wire;
    const begun = await mcp.call('foker_task_begin', {
      description: s.task,
      scope: { paths: ['packages/**'] },
      profile: 'quick',
      context: s.anchors.length ? { anchors: { files: s.anchors } } : true,
    });
    const taskId = begun.structured['task_id'];
    const again = await mcp.call('foker_context', { ...a, task_id: taskId });
    row[`mcp_${s.id}_repeat`] = tokens(again.text);
    await mcp.call('foker_task_cancel', { task_id: taskId });
  }
  const focal = scenarios.find((x) => x.id === 'focal') as ContextScenario;
  const warm = [];
  for (let i = 0; i < RUNS; i++)
    warm.push((await mcp.call('foker_context', { task: focal.task, anchors: { files: focal.anchors } })).ms);
  lat['mcp_context_warm_p50'] = percentile(warm, 50);
  lat['mcp_context_warm_p95'] = percentile(warm, 95);
  mcp.stop();
  // Primera llamada de una conexión nueva (motor sin abrir en el proceso).
  // Desde el arranque del proceso hasta la primera respuesta: incluye carga de módulos y Ajv.
  const coldMs = [];
  for (let i = 0; i < 3; i++) {
    const started = performance.now();
    const fresh = new Mcp(bin, fx.self);
    await fresh.start();
    await fresh.call('foker_context', { task: focal.task, anchors: { files: focal.anchors } });
    coldMs.push(performance.now() - started);
    fresh.stop();
  }
  lat['mcp_context_cold_p50'] = percentile(coldMs, 50);

  // CLI: arranque, mapa en frío (sin .foker) y en caliente.
  const version = Array.from({ length: RUNS }, () => cli(bin, fx.self, ['--version']).ms);
  lat['cli_version_p50'] = percentile(version, 50);
  lat['cli_version_p95'] = percentile(version, 95);
  const cold = [];
  for (let i = 0; i < 3; i++) {
    rmSync(join(fx.self, '.foker/project-map.json'), { force: true });
    rmSync(join(fx.self, '.foker/cache'), { recursive: true, force: true });
    cold.push(cli(bin, fx.self, ['map']).ms);
  }
  lat['cli_map_cold_p50'] = percentile(cold, 50);
  const warmMap = Array.from({ length: RUNS }, () => cli(bin, fx.self, ['map']).ms);
  lat['cli_map_warm_p50'] = percentile(warmMap, 50);
  lat['cli_map_warm_p95'] = percentile(warmMap, 95);

  // foker sync: lo que el anfitrión carga siempre y el total generado.
  const always = ['AGENTS.md', 'CLAUDE.md'].map((f) => readFileSync(join(fx.self, f), 'utf8')).join('');
  row['sync_always'] = tokens(always);
  const generated = execFileSync('git', ['ls-files'], {
    cwd: fx.self,
    encoding: 'utf8',
  })
    .split('\n')
    .filter((f) => /^(AGENTS\.md|CLAUDE\.md|\.mcp\.json|opencode\.json|\.claude\/|\.codex\/|\.agents\/)/.test(f));
  row['sync_total'] = generated.reduce((sum, f) => sum + tokens(readFileSync(join(fx.self, f), 'utf8')), 0);

  // Validación: éxito y fallo real de typecheck (error de tipo inyectado).
  const ok = cli(bin, fx.self, ['validate', '--profile', 'quick']);
  row['validate_pass'] = tokens(ok.stdout);
  row['validate_pass_status'] = ok.status;
  const target = join(fx.self, 'packages/mcp/src/scope.ts');
  writeFileSync(target, `${readFileSync(target, 'utf8')}\nexport const roto: number = 'no es un número';\n`);
  const fail = cli(bin, fx.self, ['validate', '--profile', 'quick']);
  const failJson = cli(bin, fx.self, ['validate', '--profile', 'quick', '--json']);
  row['validate_fail'] = tokens(fail.stdout);
  row['validate_fail_json'] = tokens(failJson.stdout);
  const actionable = /packages\/mcp\/src\/scope\.ts:\d+/.test(fail.stdout) && fail.stdout.includes('TS2322');
  row['validate_fail_actionable'] = actionable;
  // Tokens para llegar a algo accionable: si la salida humana no basta, el agente repite con --json.
  row['validate_fail_to_action'] = actionable ? tokens(fail.stdout) : tokens(fail.stdout) + tokens(failJson.stdout);
  retention[name]['validacion'] = actionable ? [] : ['archivo:línea + TS2322 en la salida humana'];

  results[name] = row;
  latency[name] = lat;
}

// ---------------------------------------------------------------------------------------------
// Informe.

const names = clis.map((c) => c.name);
const fmt = (v: number | string | boolean | undefined) =>
  typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(0)) : String(v ?? '—');
const delta = (key: string, table: Record<string, Row>) => {
  const [a, b] = [table['baseline']?.[key], table['candidato']?.[key]];
  return typeof a === 'number' && typeof b === 'number' && a > 0 ? `${(((b - a) / a) * 100).toFixed(1)} %` : '—';
};
const tokenRows: [string, string][] = [
  ['map_outline', 'Project Map (recurso `foker://map/outline`)'],
  ['tools_list', 'MCP `tools/list` (cada turno)'],
  ...scenarios.map((s): [string, string] => [`ctx_${s.id}`, `Context Pack CLI · ${s.title}`]),
  ...scenarios
    .filter((s) => s.project === 'self')
    .flatMap((s): [string, string][] => [
      [`mcp_${s.id}_content`, `MCP \`foker_context\` · ${s.id} (contenido)`],
      [`mcp_${s.id}_wire`, `MCP \`foker_context\` · ${s.id} (JSON-RPC completo)`],
      [`mcp_${s.id}_repeat`, `MCP \`foker_context\` · ${s.id} repetido con \`task_id\``],
    ]),
  ['sync_always', '`foker sync`: AGENTS.md + CLAUDE.md (siempre cargados)'],
  ['sync_total', '`foker sync`: total generado'],
  ['validate_pass', '`foker validate` en éxito'],
  ['validate_fail', '`foker validate` en fallo (salida humana)'],
  ['validate_fail_to_action', '`foker validate` en fallo: tokens hasta tener archivo:línea'],
];
const latencyKeys = Object.keys(latency['candidato'] ?? {});
const lines = [
  '# Benchmark de tokens y latencia',
  '',
  `- Fecha: ${new Date().toISOString().slice(0, 10)}`,
  ...clis.map((c) => `- ${c.name}: \`${c.rev}\``),
  `- Fixtures: árbol de \`${fixtureRef}\` (repo Foker) y \`examples/aurora-analytics\` + \`REQUIREMENTS.md\``,
  `- Repeticiones: ${RUNS} (p50/p95 por percentil de rango); Node ${process.version}, ${process.platform}`,
  '- Tokens: estimador `bytes-lf/3.2@1` = ceil(bytes UTF-8 tras CRLF→LF × 5/16), determinista',
  '',
  '## Tokens por superficie',
  '',
  `| Superficie | ${names.join(' | ')} | Δ |`,
  `|---|${names.map(() => '---:').join('|')}|---:|`,
  ...tokenRows.map(
    ([k, label]) => `| ${label} | ${names.map((n) => fmt(results[n]?.[k])).join(' | ')} | ${delta(k, results)} |`,
  ),
  '',
  '## Latencia (ms)',
  '',
  `| Medida | ${names.join(' | ')} | Δ |`,
  `|---|${names.map(() => '---:').join('|')}|---:|`,
  ...latencyKeys.map((k) => `| ${k} | ${names.map((n) => fmt(latency[n]?.[k])).join(' | ')} | ${delta(k, latency)} |`),
  '',
  '## Retención (Zero-Degradation Check)',
  '',
  'Cada escenario exige que el contexto contenga lo necesario para completar la tarea sin lecturas extra.',
  '',
  `| Escenario | ${names.join(' | ')} |`,
  `|---|${names.map(() => '---').join('|')}|`,
  ...[...scenarios.map((s) => s.id), 'validacion'].map(
    (id) =>
      `| ${id} | ${names.map((n) => (retention[n]?.[id]?.length ? `falta: ${retention[n][id].join(', ')}` : 'completo')).join(' | ')} |`,
  ),
  '',
  `Determinismo (candidato, dos ejecuciones byte a byte): ${Object.entries(determinism)
    .map(([k, v]) => `${k} ${v ? 'idéntico' : 'DIFIERE'}`)
    .join(', ')}.`,
  '',
  '## Reproducir',
  '',
  '```sh',
  `pnpm build:native && pnpm build`,
  `pnpm bench:tokens -- --baseline-ref ${baselineRef ?? '<ref>'} --runs ${RUNS}`,
  '```',
  '',
];
const report = lines.join('\n');
if (args.out) writeFileSync(resolve(args.out), report);
if (args.json) {
  writeFileSync(resolve(args.json), `${JSON.stringify({ clis, results, latency, retention, determinism }, null, 2)}\n`);
  // Mismo formato que exige `pnpm lint` para los JSON versionados.
  spawnSync(join(repo, 'node_modules/.bin/biome'), ['format', '--write', resolve(args.json)], { stdio: 'ignore' });
}
process.stdout.write(report);

if (baselineRef && !args.keep) git(repo, 'worktree', 'remove', '--force', join(work, 'baseline'));
if (!args.keep) rmSync(work, { recursive: true, force: true });

// Barrera: el candidato no puede perder retención que el baseline tenía, ni ser no determinista.
const regressions = scenarios
  .map((s) => s.id)
  .filter(
    (id) =>
      (retention['candidato']?.[id]?.length ?? 0) > (retention['baseline']?.[id]?.length ?? Number.POSITIVE_INFINITY),
  );
if (regressions.length || Object.values(determinism).some((v) => !v)) {
  console.error(`Regresión de retención o determinismo: ${regressions.join(', ') || 'determinismo'}`);
  process.exit(1);
}
