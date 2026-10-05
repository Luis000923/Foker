import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type ContextRequest, matchGlobs, openEngine } from '@foker/core';
import { deriveScopePaths, protectedPathsInScope, resolveConfig } from '@foker/engine';
import { generate } from '../fixtures/fixture-a/generate.mjs';

export interface GoldCase {
  id: string;
  fixture: 'fixture-a' | 'monorepo-pnpm';
  task: string;
  split: 'calibration' | 'validation';
  anchors?: ContextRequest['anchors'];
  gold_modified: string[];
  gold_read?: string[];
}
/** Valida el formato local de la suite, sin modificar contratos del motor. */
export function loadCases(source: string): GoldCase[] {
  if (!source.trim()) throw new Error('Suite vacía');
  const ids = new Set<string>();
  return source
    .trim()
    .split('\n')
    .map((line, index) => {
      let item: GoldCase;
      try {
        item = JSON.parse(line) as GoldCase;
      } catch {
        throw new Error(`JSON inválido en línea ${index + 1}`);
      }
      const validPaths = (value: unknown): value is string[] =>
        Array.isArray(value) &&
        value.every(
          (p) =>
            typeof p === 'string' &&
            p.length > 0 &&
            !p.startsWith('/') &&
            !p.includes('\\') &&
            !p.split('/').some((part) => part === '..' || part === '.' || !part),
        ) &&
        new Set(value).size === value.length;
      if (
        !item ||
        typeof item.id !== 'string' ||
        !item.id.trim() ||
        typeof item.task !== 'string' ||
        !item.task.trim() ||
        !['fixture-a', 'monorepo-pnpm'].includes(item.fixture) ||
        !['calibration', 'validation'].includes(item.split) ||
        !validPaths(item.gold_modified) ||
        !item.gold_modified.length ||
        (item.gold_read !== undefined && !validPaths(item.gold_read))
      ) {
        throw new Error(`Caso ctx-gold inválido en línea ${index + 1}`);
      }
      if (ids.has(item.id)) throw new Error(`Ids duplicados: ${item.id}`);
      ids.add(item.id);
      return item;
    });
}
export function score(exposed: string[], gold: string[], goldRead: string[] = []) {
  const pack = new Set(exposed);
  const modified = new Set(gold);
  const relevant = new Set([...gold, ...goldRead]);
  if (!modified.size) throw new Error('gold_modified vacío');
  return {
    recall: [...modified].filter((p) => pack.has(p)).length / modified.size,
    precision: pack.size ? [...pack].filter((p) => relevant.has(p)).length / pack.size : 0,
  };
}
/** Mismo estimador bytes-lf/3.2@1 que Rust, sobre el texto entregado. */
export function renderedTokens(text: string): number {
  return Math.ceil((Buffer.byteLength(text) - (text.match(/\r\n/g)?.length ?? 0)) / 3.2);
}
/** Partición exacta de bytes UTF-8; cabeceras de código no cuentan como secciones. */
export function renderedBytes(text: string) {
  const bytes = {
    headings: 0,
    wrappers: 0,
    trust_note: 0,
    rules: 0,
    skill: 0,
    task_scope: 0,
    request: 0,
    paths: 0,
    signatures: 0,
    bodies: 0,
    whitespace: 0,
  };
  let section = '';
  let wrapper = '';
  let level = '';
  for (const line of text.match(/[^\n]*\n|[^\n]+$/g) ?? []) {
    let kind: keyof typeof bytes;
    if (line.startsWith('<foker:')) {
      wrapper = line.startsWith('<foker:files ') ? 'files' : 'file';
      level = /level="(L\d)"/.exec(line)?.[1] ?? '';
      kind = 'wrappers';
    } else if (line.startsWith('</foker:')) {
      kind = 'wrappers';
      wrapper = '';
    } else if (!wrapper && line.startsWith('## ')) {
      section = line.slice(3).trim().split(' ')[0] ?? '';
      kind = 'headings';
    } else if (!wrapper && line.startsWith('El contenido entre etiquetas foker:')) {
      kind = 'trust_note';
    } else if (section === 'request') {
      kind = 'request';
    } else if (!line.trim()) {
      kind = 'whitespace';
    } else if (section === 'rules' || section === 'skill' || section === 'task_scope') {
      kind = section;
    } else if (wrapper === 'files' && (level === 'L1' || level === 'L0')) {
      if (!line.startsWith('  ') && line.includes(': ')) {
        const split = line.indexOf(': ') + 2;
        bytes.paths += Buffer.byteLength(line.slice(0, split));
        bytes.signatures += Buffer.byteLength(line.slice(split));
        continue;
      }
      kind = line.startsWith('  ') ? 'signatures' : 'paths';
    } else if (wrapper === 'files' && level === 'L2') {
      kind = line.startsWith('  ') ? 'bodies' : 'paths';
    } else {
      kind = 'bodies';
    }
    bytes[kind] += Buffer.byteLength(line);
  }
  return bytes;
}
function summarize(
  rows: {
    id: string;
    tokens: number;
    rendered_tokens: number;
    rendered_bytes: number;
    bytes: ReturnType<typeof renderedBytes>;
    recall: number;
    precision: number;
    gold_full?: number;
    flow?: FlowResult;
  }[],
) {
  const median = (values: number[]) => {
    const ordered = values.sort((a, b) => a - b);
    const middle = Math.floor(ordered.length / 2);
    return ordered.length % 2
      ? (ordered[middle] as number)
      : ((ordered[middle - 1] as number) + (ordered[middle] as number)) / 2;
  };
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const ordered = [...rows].sort(
    (a, b) => a.rendered_bytes - b.rendered_bytes || Buffer.compare(Buffer.from(a.id), Buffer.from(b.id)),
  );
  const central = ordered.slice(Math.floor((ordered.length - 1) / 2), Math.floor(ordered.length / 2) + 1);
  return {
    cases: rows.length,
    recall: rows.length ? mean(rows.map((r) => r.recall)) : null,
    gold_full: rows.length ? mean(rows.map((r) => r.gold_full ?? 0)) : null,
    precision: rows.length ? mean(rows.map((r) => r.precision)) : null,
    median_tokens: rows.length ? median(rows.map((r) => r.tokens)) : null,
    mean_tokens: rows.length ? mean(rows.map((r) => r.tokens)) : null,
    median_rendered_tokens: rows.length ? median(rows.map((r) => r.rendered_tokens)) : null,
    mean_rendered_tokens: rows.length ? mean(rows.map((r) => r.rendered_tokens)) : null,
    median_rendered_bytes: rows.length ? median(rows.map((r) => r.rendered_bytes)) : null,
    flow:
      rows.length && rows.every((r) => r.flow)
        ? {
            recall: mean(rows.map((r) => (r.flow as FlowResult).recall)),
            precision: mean(rows.map((r) => (r.flow as FlowResult).precision)),
            scope_coverage: mean(rows.map((r) => (r.flow as FlowResult).scope_coverage)),
            gold_full: mean(rows.map((r) => (r.flow as FlowResult).gold_full)),
            scope_errors: rows.filter((r) => (r.flow as FlowResult).scope_error).length,
            context_errors: rows.filter((r) => !(r.flow as FlowResult).scope_error && (r.flow as FlowResult).error)
              .length,
            median_rendered_tokens: median(rows.map((r) => (r.flow as FlowResult).rendered_tokens)),
            mean_rendered_tokens: mean(rows.map((r) => (r.flow as FlowResult).rendered_tokens)),
          }
        : null,
    mean_rendered_bytes: rows.length ? mean(rows.map((r) => r.rendered_bytes)) : null,
    // Media de las filas centrales: suma exactamente la mediana de bytes, a diferencia
    // de sumar medianas independientes de categorías.
    bytes_at_median: rows.length
      ? {
          case_ids: central.map((r) => r.id),
          parts: Object.fromEntries(
            Object.keys(central[0]?.bytes ?? {}).map((key) => [
              key,
              mean(central.map((r) => r.bytes[key as keyof typeof r.bytes])),
            ]),
          ),
        }
      : null,
  };
}
function summarizeSplits(rows: ({ split: GoldCase['split'] } & Parameters<typeof summarize>[0][number])[]) {
  return Object.fromEntries(
    (['calibration', 'validation'] as const).map((split) => [split, summarize(rows.filter((r) => r.split === split))]),
  );
}
/**
 * ADR-034: fracción de gold_modified cuyo contenido completo llega en rendered (L3 completo,
 * L2 completo individual o agrupado). Indicador de lecturas evitables; los nuevos cuentan 0.
 */
export function goldFull(rendered: string, root: string, gold: string[]): number {
  const full = gold.filter((id) => {
    let content: string;
    try {
      content = readFileSync(join(root, id), 'utf8').replace(/\r\n/g, '\n');
    } catch {
      return false;
    }
    const escaped = content.replaceAll('<foker:', '&lt;foker:').replaceAll('</foker:', '&lt;/foker:');
    const attr = id.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    const single = (level: string) =>
      rendered.includes(
        `<foker:file id="${attr}" level="${level}" trust="repository-content">\n${escaped}\n</foker:file>`,
      );
    const grouped = `\n${id}\n${escaped
      .split('\n')
      .map((line) => `  ${line}`)
      .join('\n')}\n`;
    return single('L3') || single('L2') || rendered.includes(grouped);
  });
  return full.length / gold.length;
}
/** Id fijo y checks del perfil default: el flujo es determinista y no depende de un ledger. */
const FLOW_TASK_ID = 'tsk_00000000000000000000000000';
const FLOW_CHECKS = ['typecheck', 'lint', 'test', 'secrets'];
export interface FlowResult {
  scope: string[];
  /** begin no crea tarea: alcance vacío o protegido (FKR-INP-001, FKR-POL-002). */
  scope_error: boolean;
  /** Código del error de begin o del pack definitivo (context_error); null si hubo código. */
  error: string | null;
  /** Fracción de gold_modified editable: dentro del alcance aceptado por begin; 0 si se rechaza. */
  scope_coverage: number;
  recall: number;
  precision: number;
  rendered_tokens: number;
  exposed: string[];
  /** ADR-034: gold con contenido completo en el pack definitivo. */
  gold_full: number;
}
/** Política de rutas protegidas por defecto, la misma que aplica begin sin configuración propia. */
const DEFAULT_PROTECTED = resolveConfig({ version: 1, project: { name: 'ctx-gold' } }).policy.protected_paths;
type FlowEngine = Pick<Awaited<ReturnType<typeof openEngine>>, 'buildContext'>;
/**
 * Emula foker_task_begin sin scope y con context (ADR-031 fase 2b, ADR-032): el pack preliminar
 * deriva el alcance, begin lo valida contra la política protegida y el pack definitivo se construye
 * con taskScope. Si begin rechaza el alcance o el pack definitivo falla (context_error), el agente
 * no recibe código: recall 0, registrado con su código en vez de abortar la evaluación.
 */
export async function flowPack(
  engine: FlowEngine,
  request: ContextRequest,
  preliminary: { json: string },
  item: GoldCase,
  files: string[] = [],
  root?: string,
): Promise<FlowResult> {
  const scope = deriveScopePaths(JSON.parse(preliminary.json));
  const failed = (error: string, scope_error: boolean): FlowResult => ({
    scope,
    scope_error,
    error,
    scope_coverage: 0,
    recall: 0,
    precision: 0,
    rendered_tokens: 0,
    exposed: [],
    gold_full: 0,
  });
  if (!scope.length) return failed('FKR-INP-001', true);
  if (protectedPathsInScope(scope, DEFAULT_PROTECTED, files).length) return failed('FKR-POL-002', true);
  const scope_coverage = item.gold_modified.filter((id) => matchGlobs(id, scope)).length / item.gold_modified.length;
  let pack: Awaited<ReturnType<FlowEngine['buildContext']>>;
  try {
    pack = await engine.buildContext({
      ...request,
      taskScope: { taskId: FLOW_TASK_ID, description: request.task, paths: scope, checks: FLOW_CHECKS },
    });
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code !== 'string' || !code.startsWith('FKR-')) throw error;
    return { ...failed(code, false), scope_coverage };
  }
  const exposed = pack.files.filter((f) => f.level !== 'L0').map((f) => f.id);
  return {
    scope,
    scope_error: false,
    error: null,
    scope_coverage,
    ...score(exposed, item.gold_modified, item.gold_read),
    rendered_tokens: renderedTokens(pack.rendered),
    exposed,
    gold_full: root ? goldFull(pack.rendered, root, item.gold_modified) : 0,
  };
}
export async function evaluateContext(
  cases: GoldCase[],
  repo: string,
  budget = 8000,
  diagnose = false,
  params?: ContextRequest['params'],
) {
  loadCases(cases.map((item) => JSON.stringify(item)).join('\n'));
  const dumpDir = process.env['FOKER_CTX_GOLD_DUMP'];
  if (dumpDir) {
    // Cada id debe ser un nombre de archivo, sin permitir rutas fuera del directorio.
    if (cases.some((item) => !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(item.id))) {
      throw new Error('Id inválido para FOKER_CTX_GOLD_DUMP');
    }
    mkdirSync(dumpDir, { recursive: true });
  }
  const temp = mkdtempSync(join(tmpdir(), 'foker-ctx-gold-'));
  try {
    const synthetic = join(temp, 'fixture-a');
    generate(synthetic);
    const mono = join(temp, 'monorepo-pnpm');
    cpSync(join(repo, 'fixtures/monorepo-pnpm'), mono, { recursive: true });
    const roots: Record<string, string> = { 'fixture-a': synthetic, 'monorepo-pnpm': mono };
    const engines = { 'fixture-a': await openEngine(synthetic), 'monorepo-pnpm': await openEngine(mono) };
    for (const engine of Object.values(engines)) await engine.refresh();
    // begin valida el alcance también contra rutas protegidas omitidas del mapa; se pasan sus ids.
    const mapFiles: Record<string, string[]> = {};
    for (const [fixture, engine] of Object.entries(engines)) {
      mapFiles[fixture] = Object.keys((JSON.parse(await engine.exportMapJson()) as { files: object }).files);
    }
    const rows = [];
    for (const item of cases) {
      const engine = engines[item.fixture];
      if (!engine || !item.id || !item.task) throw new Error('Caso ctx-gold inválido');
      const request: ContextRequest = {
        task: item.task,
        budgetTokens: budget,
        ...(params ? { params } : {}),
        ...(item.anchors ? { anchors: item.anchors } : {}),
      };
      const pack = await engine.buildContext(request);
      const flow = await flowPack(engine, request, pack, item, mapFiles[item.fixture] ?? [], roots[item.fixture]);
      if (dumpDir) writeFileSync(join(dumpDir, `${item.id}.txt`), pack.rendered);
      const exposed = pack.files.filter((f) => f.level !== 'L0').map((f) => f.id);
      const misses = [];
      if (diagnose) {
        const wide = await engine.buildContext({
          task: item.task,
          budgetTokens: 200000,
          ...(params ? { params } : {}),
          ...(item.anchors ? { anchors: item.anchors } : {}),
        });
        const ranking = [...wide.files].sort(
          (a, b) => b.score - a.score || Buffer.compare(Buffer.from(a.id), Buffer.from(b.id)),
        );
        for (const id of [...new Set([...item.gold_modified, ...(item.gold_read ?? [])])].filter(
          (id) => !exposed.includes(id),
        )) {
          const file = pack.files.find((f) => f.id === id);
          const candidate = ranking.find((f) => f.id === id);
          const excluded = pack.excluded.find((f) => f.id === id);
          const exists = engine.fileInfo(id);
          const seeded =
            candidate?.reasons.some((r) =>
              /^(ANCHOR|PATH_MENTION|SYMBOL_MENTION|LEXICAL:|DIRTY|TASK_SCOPE|SKILL_CONTEXT)/.test(r),
            ) ?? false;
          misses.push({
            id,
            gold: item.gold_modified.includes(id) ? 'modified' : 'read',
            status: !exists
              ? 'ausente del mapa (no recuperable con parámetros)'
              : file?.level === 'L0'
                ? 'L0 solamente'
                : (excluded?.reason ??
                  (candidate ? 'BUDGET (fuera de los 20 descartes publicados)' : 'exclusión dura / sin candidato')),
            seeded,
            rank: candidate ? ranking.indexOf(candidate) + 1 : null,
            score: candidate?.score ?? null,
            reasons: candidate?.reasons ?? [],
            diagnostics: pack.diagnostics.filter((d) => d.subject === id),
          });
        }
      }
      const rendered_tokens = renderedTokens(pack.rendered);
      if (pack.budget.used < rendered_tokens) throw new Error(`budget.used < rendered_tokens en ${item.id}`);
      rows.push({
        id: item.id,
        fixture: item.fixture,
        split: item.split,
        ...score(exposed, item.gold_modified, item.gold_read),
        gold_full: goldFull(pack.rendered, roots[item.fixture] as string, item.gold_modified),
        tokens: pack.budget.used,
        rendered_tokens,
        rendered: pack.rendered,
        rendered_bytes: Buffer.byteLength(pack.rendered),
        bytes: renderedBytes(pack.rendered),
        exposed,
        gold_modified: item.gold_modified,
        misses,
        sections: pack.sections.map(({ id, tokens }) => ({ id, tokens })),
        occupants: pack.files.map(({ id, level, tokens }) => ({ id, level, tokens })),
        flow,
      });
    }
    if (!rows.length) throw new Error('Suite vacía');
    const metrics = summarize(rows);
    const recall = metrics.recall as number;
    const median = metrics.median_tokens as number;
    return {
      budget,
      ...metrics,
      recall,
      precision: metrics.precision as number,
      median_tokens: median,
      target: recall >= 0.8 && median <= 8000,
      blocks_m3: recall < 0.6,
      splits: summarizeSplits(rows),
      rows,
    };
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}
export async function main(args: string[]): Promise<void> {
  const repo = fileURLToPath(new URL('../../', import.meta.url));
  const source = resolve(args[0] ?? join(repo, 'benchmarks/ctx-gold/cases.jsonl'));
  const budget = Number(args[1] ?? 8000);
  if (!Number.isInteger(budget) || budget <= 0) throw new Error('Presupuesto inválido');
  const cases = loadCases(readFileSync(source, 'utf8'));
  const report = await evaluateContext(cases, repo, budget);
  const date = new Date().toISOString().slice(0, 10);
  const base = resolve(args[2] ?? join(repo, `benchmarks/reports/ctx-gold-${date}`));
  mkdirSync(dirname(base), { recursive: true });
  writeFileSync(`${base}.json`, `${JSON.stringify(report, null, 2)}\n`);
  const summary = `Casos: ${report.cases}; recall@pack: ${report.recall.toFixed(4)}; precisión: ${report.precision.toFixed(4)}; mediana/media tokens: ${report.median_tokens}/${report.mean_tokens}; mediana/media rendered_tokens: ${report.median_rendered_tokens}/${report.mean_rendered_tokens}.\n\nREQ-CTX-003 TARGET recall ≥ 0,80: ${report.recall >= 0.8 ? 'SÍ' : 'NO'}; mediana ≤ 8000: ${report.median_tokens <= 8000 ? 'SÍ' : 'NO'}; recall < 0,6 bloquea M3: ${report.blocks_m3 ? 'SÍ' : 'NO'}.\n\nFlujo begin sin scope (ADR-032): recall ${report.flow?.recall.toFixed(4)}; precisión ${report.flow?.precision.toFixed(4)}; cobertura de alcance ${report.flow?.scope_coverage.toFixed(4)}; errores de alcance ${report.flow?.scope_errors}; context_error ${report.flow?.context_errors}; mediana/media rendered_tokens ${report.flow?.median_rendered_tokens}/${report.flow?.mean_rendered_tokens}.`;
  writeFileSync(
    `${base}.md`,
    `# ctx-gold · ${date}\n\n${summary}\n\n${Object.entries(report.splits)
      .map(
        ([split, metrics]) =>
          `${split}: ${metrics.cases} casos; recall ${metrics.recall?.toFixed(4) ?? 'sin casos'}; precisión ${metrics.precision?.toFixed(4) ?? 'sin casos'}; mediana/media tokens ${metrics.median_tokens ?? 'sin casos'}/${metrics.mean_tokens ?? 'sin casos'}; mediana/media rendered_tokens ${metrics.median_rendered_tokens ?? 'sin casos'}/${metrics.mean_rendered_tokens ?? 'sin casos'}.`,
      )
      .join(
        '\n\n',
      )}\n\nMedia macro por caso. Fixture A: anclas solo si están declaradas; monorepo-pnpm: casos con anclas. Los tests nuevos aún ausentes del mapa cuentan como misses.\n\n| Caso | Split | Recall | Precisión | Tokens | Rendered tokens |\n|---|---|---:|---:|---:|---:|\n${report.rows.map((r) => `| ${r.id} | ${r.split} | ${r.recall.toFixed(3)} | ${r.precision.toFixed(3)} | ${r.tokens} | ${r.rendered_tokens} |`).join('\n')}\n`,
  );
  console.log(summary);
  console.log(`Flujo begin (ADR-032): ${JSON.stringify(report.flow)}`);
  console.log(JSON.stringify(report.splits, null, 2));
  console.log(`Informes: ${base}.{json,md}`);
}
