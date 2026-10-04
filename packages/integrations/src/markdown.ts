/** Bloques gestionados en Markdown (REQ-PRJ-002): `<!-- foker:begin v1 -->` … `<!-- foker:end -->`. */

export const BLOCK_VERSION = 1;
const BEGIN = /<!-- foker:begin v(\d+) -->\r?\n/;
const END = '<!-- foker:end -->';

export interface BlockLocation {
  start: number;
  end: number;
  /** Contenido entre los marcadores. */
  body: string;
}

/** Localiza el bloque gestionado; `null` si no hay o está mal cerrado. */
export function findBlock(content: string): BlockLocation | null {
  const begin = BEGIN.exec(content);
  if (!begin) return null;
  const bodyStart = begin.index + begin[0].length;
  const endIndex = content.indexOf(END, bodyStart);
  if (endIndex < 0) return null;
  let end = endIndex + END.length;
  if (content[end] === '\r') end++;
  if (content[end] === '\n') end++;
  return { start: begin.index, end, body: content.slice(bodyStart, endIndex) };
}

/** Texto completo del bloque con marcadores. `body` debe terminar en salto de línea. */
export function renderBlock(body: string): string {
  const normalized = body.endsWith('\n') ? body : `${body}\n`;
  return `<!-- foker:begin v${BLOCK_VERSION} -->\n${normalized}${END}\n`;
}

/**
 * Inserta o reemplaza el bloque preservando byte a byte el resto del archivo.
 * `header` (p. ej. `@AGENTS.md`) se garantiza como primera línea si falta.
 */
export function upsertBlock(content: string | undefined, body: string, header?: string): string {
  let text = content ?? '';
  if (header && !text.split(/\r?\n/).some((line) => line.trim() === header)) {
    text = text.length ? `${header}\n\n${text}` : `${header}\n`;
  }
  const block = renderBlock(body);
  const found = findBlock(text);
  if (found) return text.slice(0, found.start) + block + text.slice(found.end);
  if (!text.length) return block;
  const separator = text.endsWith('\n\n') ? '' : text.endsWith('\n') ? '\n' : '\n\n';
  return `${text}${separator}${block}`;
}

/** Quita el bloque gestionado (y la línea en blanco que lo precedía si la añadimos nosotros). */
export function removeBlock(content: string): string {
  const found = findBlock(content);
  if (!found) return content;
  let start = found.start;
  if (content.slice(Math.max(0, start - 2), start) === '\n\n') start -= 1;
  return content.slice(0, start) + content.slice(found.end);
}
