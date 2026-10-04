import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ContextParams } from '@foker/core';
import { evaluateContext, type GoldCase, loadCases } from './ctx-gold.js';

/** Usa exclusivamente el split persistido; la semilla no reasigna validación. */
export function splitCases(cases: GoldCase[]) {
  loadCases(cases.map((item) => JSON.stringify(item)).join('\n'));
  const ordered = [...cases].sort((a, b) => a.id.localeCompare(b.id, 'en'));
  const calibration = ordered.filter((c) => c.split === 'calibration');
  const validation = ordered.filter((c) => c.split === 'validation');
  if (!calibration.length || !validation.length) throw new Error('Split vacío');
  return { calibration, validation };
}
export function configurations(): ContextParams[] {
  const params: ContextParams[] = [];
  for (const bm25Top of [20, 80])
    for (const wLex of [0.2, 0.6, 1.2])
      for (const reverse of [0, 1, 2])
        for (const coreFiles of [0, 15])
          for (const l2Count of [0, 5])
            for (const marginFraction of [0, 0.05])
              params.push({
                bm25Top,
                wLex,
                rFix: 0.5 * reverse,
                rModify: 0.5 * reverse,
                rTest: 0.4 * reverse,
                rRefactor: 0.7 * reverse,
                rAdd: 0.1 * reverse,
                rExplain: 0.3 * reverse,
                coreFiles,
                l2Count,
                marginFraction,
              });
  return params;
}
type Report = Awaited<ReturnType<typeof evaluateContext>>;
export function summarize(report: Report) {
  return { recall: report.recall, precision: report.precision, median_tokens: report.median_tokens };
}
export function better(a: ReturnType<typeof summarize>, b: ReturnType<typeof summarize>) {
  return (
    a.median_tokens <= 8000 &&
    (b.median_tokens > 8000 || a.recall > b.recall || (a.recall === b.recall && a.precision > b.precision))
  );
}
export async function main(args: string[]): Promise<void> {
  const seed = args[0] ?? '37';
  if (!/^[a-zA-Z0-9_-]{1,40}$/.test(seed)) throw new Error('Semilla inválida');
  const repo = fileURLToPath(new URL('../../', import.meta.url));
  const source = readFileSync(join(repo, 'benchmarks/ctx-gold/cases.jsonl'), 'utf8');
  const cases = loadCases(source);
  const { calibration, validation } = splitCases(cases);
  const baseline = {
    calibration: summarize(await evaluateContext(calibration, repo)),
    validation: summarize(await evaluateContext(validation, repo)),
  };
  const rows = [];
  let selected = { index: -1, params: {} as ContextParams, calibration: baseline.calibration };
  // La validación no se evalúa ni se usa para seleccionar ninguna configuración.
  for (const [index, params] of configurations().entries()) {
    const result = summarize(await evaluateContext(calibration, repo, 8000, false, params));
    rows.push({ index, params, calibration: result });
    if (better(result, selected.calibration)) selected = { index, params, calibration: result };
    if ((index + 1) % 24 === 0) console.log(`Calibración ${index + 1}/144`);
  }
  const heldOut = summarize(await evaluateContext(validation, repo, 8000, false, selected.params));
  const accepted = heldOut.recall > baseline.validation.recall && heldOut.median_tokens <= 8000;
  const report = {
    seed,
    dataset_sha256: createHash('sha256').update(source).digest('hex'),
    split: { calibration: calibration.map((c) => c.id), validation: validation.map((c) => c.id) },
    baseline,
    rows,
    selected: { ...selected, validation: heldOut, accepted },
  };
  const base = join(repo, `benchmarks/reports/calibracion-${seed}`);
  writeFileSync(`${base}.json`, `${JSON.stringify(report, null, 2)}\n`);
  const metrics = (r: ReturnType<typeof summarize>) =>
    `${r.recall.toFixed(4)} | ${r.precision.toFixed(4)} | ${r.median_tokens}`;
  writeFileSync(
    `${base}.md`,
    `# Calibración FKR-037 · semilla ${seed}\n\nSplit persistido en cases.jsonl, estratificado aproximadamente 50/50 por fixture y tipo de tarea. La semilla identifica el informe y no cambia la pertenencia. Dataset SHA-256: ${report.dataset_sha256}.\n\nCalibración (${calibration.length}): ${report.split.calibration.join(', ')}.\n\nValidación (${validation.length}): ${report.split.validation.join(', ')}.\n\nRejilla predefinida por diagnóstico: 144 configuraciones. Maximizar recall macro en calibración sujeto a mediana ≤ 8.000; desempate por precisión macro y después conservar el primer resultado (baseline incluido). La validación se consulta solo para baseline y configuración elegida, nunca para desempatar ni explorar alternativas. Parámetros no indicados mantienen defaults originales. No se modifican tareas, gold ni semillas.\n\n| Conjunto | Configuración | Recall | Precisión | Mediana tokens |\n|---|---|---:|---:|---:|\n| Calibración | Antes | ${metrics(baseline.calibration)} |\n| Calibración | Elegida | ${metrics(selected.calibration)} |\n| Validación | Antes | ${metrics(baseline.validation)} |\n| Validación | Elegida | ${metrics(heldOut)} |\n\nElegida: ${selected.index < 0 ? 'baseline' : selected.index}; params: \`${JSON.stringify(selected.params)}\`. Decisión: ${accepted ? 'Aceptar defaults' : 'Rechazar cambio de defaults'}.\n\n| Nº | Parámetros | Recall calibración | Precisión calibración | Mediana tokens |\n|---:|---|---:|---:|---:|\n${rows.map((row) => `| ${row.index} | ${JSON.stringify(row.params)} | ${metrics(row.calibration)} |`).join('\n')}\n\nLa suite tiene ${cases.length} casos; REQ-CTX-003 exige un mínimo de 60. El split evita usar validación en el ajuste, pero no aporta independencia entre tareas parecidas de la misma fixture ni demuestra generalización a otros repositorios. Tokens del estimador bytes-lf/3.2@1, no de un tokenizer externo.\n`,
  );
  console.log(JSON.stringify({ baseline, selected: report.selected }, null, 2));
}
