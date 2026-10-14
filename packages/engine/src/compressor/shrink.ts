import { extname } from 'node:path';

/** Extensiones que nunca se comprimen: el código va por el mapa AST (`foker map`). */
const BYPASS_EXTENSIONS = new Set(['.html', '.htm', '.tsx', '.jsx']);

export type ShrinkFormat = 'json' | 'yaml' | 'csv' | 'log' | 'text';

export interface ShrinkResult {
  text: string;
  format: ShrinkFormat;
  /** `true` si el archivo está excluido por extensión. */
  bypassed: boolean;
  originalChars: number;
  shrunkChars: number;
}

export interface ShrinkOptions {
  /** Ruta de origen; decide el bypass y ayuda a detectar el formato. */
  path?: string;
  format?: ShrinkFormat;
  /** Líneas finales de un log que se conservan íntegras. */
  tailLines?: number;
}

/** `true` si el archivo debe ir por el AST de Rust y no por el compresor. */
export function isBypassed(path: string | undefined): boolean {
  return path !== undefined && BYPASS_EXTENSIONS.has(extname(path).toLowerCase());
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: coincide con secuencias ANSI.
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;
const SIGNAL = /error|warn|fail|✗|✖|×|panic|exception|fatal|denied|not |never|no |TS\d{3,5}|ELIFECYCLE/i;
const PASS = /^\s*(?:✓|✔|PASS\b|ok\b)/;

function detect(text: string, path: string | undefined): ShrinkFormat {
  const ext = path ? extname(path).toLowerCase() : '';
  if (ext === '.json') return 'json';
  if (ext === '.yaml' || ext === '.yml') return 'yaml';
  if (ext === '.csv') return 'csv';
  if (ext === '.log' || ext === '.txt') return 'log';
  const head = text.trimStart();
  if (head.startsWith('{') || head.startsWith('[')) return 'json';
  const lines = text.split('\n').filter((l) => l.trim());
  const cells = lines[0]?.split(',').length ?? 0;
  if (cells > 1 && lines.length > 1 && lines.slice(0, 5).every((l) => l.split(',').length === cells)) return 'csv';
  if (lines.length && lines.every((l) => /^\s*(?:#|-\s|[\w.-]+:(?:\s|$))/.test(l))) return 'yaml';
  return 'log';
}

/** JSON mínimo; las listas de ≥ 3 objetos con las mismas claves pasan a forma tabular. */
function shrinkJson(text: string): string {
  const value: unknown = JSON.parse(text);
  const tabular = (node: unknown): unknown => {
    if (Array.isArray(node)) {
      const rows = node.map(tabular);
      const first = rows[0];
      if (
        rows.length >= 3 &&
        first !== null &&
        typeof first === 'object' &&
        !Array.isArray(first) &&
        Object.keys(first).length > 0
      ) {
        const keys = Object.keys(first);
        const uniform = rows.every(
          (r) =>
            r !== null &&
            typeof r === 'object' &&
            !Array.isArray(r) &&
            Object.keys(r).length === keys.length &&
            keys.every((k) => k in (r as object)),
        );
        if (uniform) return { $cols: keys, $rows: rows.map((r) => keys.map((k) => (r as Record<string, unknown>)[k])) };
      }
      return rows;
    }
    if (node !== null && typeof node === 'object')
      return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, tabular(v)]));
    return node;
  };
  return JSON.stringify(tabular(value));
}

/** Quita comentarios completos, líneas vacías y espacios finales; respeta los bloques `|` y `>`. */
function shrinkYaml(text: string): string {
  const out: string[] = [];
  let blockIndent = -1;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\s+$/, '');
    const indent = line.length - line.trimStart().length;
    if (blockIndent >= 0) {
      if (line === '' || indent > blockIndent) {
        out.push(line);
        continue;
      }
      blockIndent = -1;
    }
    if (line === '' || line.trimStart().startsWith('#')) continue;
    if (/[:-]\s*[|>][+-]?\d*\s*$/.test(line)) blockIndent = indent;
    out.push(line);
  }
  return out.join('\n');
}

/** Quita líneas vacías y espacios finales; colapsa filas consecutivas idénticas. */
function shrinkCsv(text: string): string {
  return collapse(
    text
      .split('\n')
      .map((l) => l.replace(/\s+$/, ''))
      .filter((l) => l !== ''),
  ).join('\n');
}

function collapse(lines: string[]): string[] {
  const out: string[] = [];
  let count = 0;
  for (const [i, line] of lines.entries()) {
    count++;
    if (lines[i + 1] !== line) {
      out.push(count > 1 ? `${line} (x${count})` : line);
      count = 0;
    }
  }
  return out;
}

/** Log de compilación o tests: conserva errores, avisos, contexto y cola; resume el resto. */
function shrinkLog(text: string, tailLines: number): string {
  const lines = text
    .replace(ANSI, '')
    .split(/\r?\n/)
    .map((l) => l.replace(/^.*\r/, '').replace(/\s+$/, ''))
    .filter((l) => l !== '');
  const keep = new Set<number>();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string;
    if (PASS.test(line) && !SIGNAL.test(line)) continue;
    if (SIGNAL.test(line)) for (let j = Math.max(0, i - 1); j <= Math.min(lines.length - 1, i + 2); j++) keep.add(j);
  }
  for (let i = Math.max(0, lines.length - tailLines); i < lines.length; i++) keep.add(i);
  const out: string[] = [];
  let omitted = 0;
  let passed = 0;
  const flush = () => {
    if (omitted) out.push(`… ${omitted} líneas omitidas${passed ? ` (${passed} superadas)` : ''}`);
    omitted = 0;
    passed = 0;
  };
  for (const [i, line] of lines.entries()) {
    if (keep.has(i)) {
      flush();
      out.push(line);
    } else {
      omitted++;
      if (PASS.test(line)) passed++;
    }
  }
  flush();
  return collapse(out).join('\n');
}

/**
 * Comprime una carga de herramienta (JSON, YAML, CSV o log) sin tocar código ni avisos.
 * Nunca lanza: ante un error de formato devuelve el texto original. Nunca devuelve más que el original.
 */
export function shrinkPayload(text: string, options: ShrinkOptions = {}): ShrinkResult {
  const original = text.length;
  if (isBypassed(options.path))
    return { text, format: 'text', bypassed: true, originalChars: original, shrunkChars: original };
  const format = options.format ?? detect(text, options.path);
  let shrunk = text;
  try {
    if (format === 'json') shrunk = shrinkJson(text);
    else if (format === 'yaml') shrunk = shrinkYaml(text);
    else if (format === 'csv') shrunk = shrinkCsv(text);
    else if (format === 'log') shrunk = shrinkLog(text, options.tailLines ?? 20);
  } catch {
    shrunk = text;
  }
  const result = shrunk.length < original ? shrunk : text;
  return { text: result, format, bypassed: false, originalChars: original, shrunkChars: result.length };
}
