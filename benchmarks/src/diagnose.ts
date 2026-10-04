import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateContext, type GoldCase } from './ctx-gold.js';

export async function main(): Promise<void> {
  const repo = fileURLToPath(new URL('../../', import.meta.url));
  const cases = readFileSync(join(repo, 'benchmarks/ctx-gold/cases.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as GoldCase);
  const report = await evaluateContext(cases, repo, 8000, true);
  let text = `# ctx-gold · diagnóstico FKR-037\n\nBaseline anterior a calibración. Recall macro ${report.recall.toFixed(4)}; precisión ${report.precision.toFixed(4)}; mediana ${report.median_tokens} tokens.\n\nLa precisión ya cumple §20.5: ids distintos con nivel ≥ L1, intersección con gold_modified ∪ gold_read. L0 y el contorno core no cuentan. Sin corrección de fórmula. La suite tiene 30 casos (20 fixture-a y 10 monorepo-pnpm): no satisface aún el mínimo normativo de 60.\n\nPosiciones y razones obtenidas de un pack de 200.000 tokens con la misma petición; el ranking no depende del presupuesto. Semillado significa razón directa, no DEPENDENCY_OF/DEPENDENT_OF/CORE. Los descartes publicados se limitan a 20; fuera de ellos BUDGET se deduce del recorrido exhaustivo del selector actual (sin corte de ranking). Un archivo ausente del mapa nunca puede entrar, aunque se suba su peso.\n`;
  for (const row of report.rows.filter((r) => r.misses.length)) {
    text += `\n## ${row.id} (${row.fixture})\n\nRecall ${row.recall.toFixed(3)}; precisión ${row.precision.toFixed(3)}; usados ${row.tokens}.\n\n| Archivo gold ausente | Tipo | Causa | Semillado | Posición | Score | Razones |\n|---|---|---|---|---:|---:|---|\n`;
    for (const miss of row.misses)
      text += `| ${miss.id} | ${miss.gold} | ${miss.status} | ${miss.seeded ? 'sí' : 'no'} | ${miss.rank ?? '—'} | ${miss.score ?? '—'} | ${miss.reasons.join(', ') || '—'} |\n`;
    text += `\nPresupuesto por sección: ${row.sections.map((s) => `${s.id}: ${s.tokens}`).join('; ')}.\n\nOcupantes (metadatos deduplicados; los tokens del core se contabilizan por sección aunque un archivo también aparezca a L1+):\n\n| Archivo | Nivel | Tokens |\n|---|---|---:|\n${row.occupants.map((f) => `| ${f.id} | ${f.level} | ${f.tokens} |`).join('\n')}\n`;
  }
  text +=
    '\n## Implicaciones para la búsqueda\n\nEvaluar pesos léxicos, top BM25, recorrido inverso y reserva core: los misses de posición baja compiten con firmas de numerosos candidatos y el contorno estático. Evaluar nº L2 y umbral de ancla para comprobar su coste. No usar gold como semillas. Los tests nuevos ausentes y el desajuste entre lenguaje de tarea y documentos léxicos necesitan cambios de algoritmo/dataset, no ajuste de pesos.\n';
  writeFileSync(join(repo, 'benchmarks/reports/ctx-gold-diagnostico.md'), text);
  console.log(`Diagnóstico: recall ${report.recall}; precisión ${report.precision}; mediana ${report.median_tokens}`);
}
