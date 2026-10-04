import { createHash } from 'node:crypto';

/** `sha256:<hex>` de un texto (identifica contenido generado en el manifiesto). */
export function hashText(text: string): string {
  return `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`;
}

/** JSON con claves ordenadas, para comparar y hashear valores sin depender del orden. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.keys(value as Record<string, unknown>)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Comentario que llevan los archivos generados (FOKER-SPEC §13.3). */
export const GENERATED_NOTE = '<!-- generado por foker sync; no editar -->';

/** Inserta la nota de generado tras el frontmatter YAML (o al principio si no hay). */
export function withGeneratedNote(markdown: string): string {
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n/.exec(markdown);
  if (!match) return `${GENERATED_NOTE}\n${markdown}`;
  return `${match[0]}${GENERATED_NOTE}\n${markdown.slice(match[0].length)}`;
}

/** Separa frontmatter (texto YAML sin delimitadores) y cuerpo. */
export function splitFrontmatter(markdown: string): { frontmatter: string; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(markdown);
  return match
    ? { frontmatter: match[1] ?? '', body: markdown.slice(match[0].length) }
    : { frontmatter: '', body: markdown };
}
