import { stripVTControlCharacters } from 'node:util';
import type { CheckResult, Finding } from '@foker/schemas';

/** Hallazgos con ubicación que se listan por check antes de remitir a `--json`. */
export const MAX_FINDINGS = 20;
/** Líneas de salida que se muestran cuando un check falla sin hallazgos con ubicación. */
export const MAX_TAIL_LINES = 15;
const MAX_MESSAGE = 200;

/** Ruido sin señal: adornos del reporter, marcos de pila de dependencias y resúmenes. */
const NOISE = [
  /^[━─═│┃╭╮╰╯┌┐└┘├┤\s]*$/u,
  // Marcos de pila de dependencias, del runtime o de herramientas instaladas fuera del proyecto.
  /^at .*(?:node_modules|\/\.cache\/|node:internal|\(node:)/,
  /node_modules\/\.pnpm\//,
  /^\[?ELIFECYCLE\]?/,
  /^(?:Found \d+ (?:errors?|warnings?)|Checked \d+ files?|× Some errors were emitted)/,
];

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

function oneLine(text: string): string {
  const line = stripVTControlCharacters(text).split(/\r?\n/)[0]?.trim() ?? '';
  return line.length > MAX_MESSAGE ? `${line.slice(0, MAX_MESSAGE - 1)}…` : line;
}

function location(f: Finding): string {
  if (!f.file) return '';
  return `${f.file}${f.line ? `:${f.line}${f.col ? `:${f.col}` : ''}` : ''} `;
}

/** Últimas líneas útiles de la salida: sin ANSI, adornos, pila de node_modules ni repeticiones. */
export function usefulTail(output: string, max = MAX_TAIL_LINES): string[] {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const raw of stripVTControlCharacters(output).split(/\r?\n/)) {
    const line = raw.replace(/[━─]{3,}/gu, '').trimEnd();
    const key = line.trim();
    if (!key || NOISE.some((re) => re.test(key)) || seen.has(key)) continue;
    seen.add(key);
    lines.push(line.length > MAX_MESSAGE ? `${line.slice(0, MAX_MESSAGE - 1)}…` : line);
  }
  return lines.slice(-max);
}

/**
 * Salida humana de validate y check-security. En éxito, una línea (estado, checks, tiempo). En
 * fallo, por check: `archivo:línea:col regla mensaje`, o la cola útil si no hay ubicación.
 */
export function formatValidation(command: string, data: { status: string; checks?: CheckResult[] | null }): string {
  const checks = data.checks ?? [];
  const total = checks.reduce((sum, c) => sum + c.duration_ms, 0);
  const failing = checks.filter((c) => c.status !== 'pass' && c.status !== 'skipped');
  const passed = checks.filter((c) => c.status === 'pass').length;
  if (failing.length === 0)
    return `${command}: ${data.status} (${passed}/${checks.length} checks, ${seconds(total)})\n`;
  const out = [`${command}: ${data.status} (${failing.length}/${checks.length} checks fallan, ${seconds(total)})`];
  for (const check of failing) {
    out.push(`- ${check.check}: ${check.status}${check.exit_code === null ? '' : ` (exit ${check.exit_code})`}`);
    const located = check.findings.filter((f) => f.file);
    if (located.length) {
      for (const f of located.slice(0, MAX_FINDINGS))
        out.push(`  ${location(f)}${f.rule ? `${f.rule} ` : ''}${oneLine(f.message)}`);
      if (located.length > MAX_FINDINGS)
        out.push(`  (+${located.length - MAX_FINDINGS} más; ${command} --json para el detalle)`);
    } else {
      for (const line of usefulTail(check.output_tail)) out.push(`  ${line}`);
    }
  }
  return `${out.join('\n')}\n`;
}
