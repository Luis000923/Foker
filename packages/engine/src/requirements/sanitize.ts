/**
 * Texto libre del usuario → valor Markdown inerte de una línea.
 * Los valores se tratan como datos de producto: nunca pueden abrir bloques, encabezados, HTML,
 * enlaces, imágenes, celdas nuevas ni comentarios donde esconder instrucciones.
 */

// Controles C0/C1, separadores Unicode y marcas bidi (Trojan Source).
// biome-ignore lint/suspicious/noControlCharactersInRegex: se eliminan a propósito.
const INVISIBLE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u2064\ufeff]/g;
// Inline: énfasis, código, enlaces/imágenes, celdas y tachado. `<`, `>` y `&` pasan a entidades.
const INLINE = /[\\`*_[\]|~]/g;
// Al inicio: encabezados, listas, citas y listas numeradas.
const LEADING = /^(?:[#+-]|\d+[.)])/;

/** Frases típicas de inyección de instrucciones. Heurística: solo marca, nunca reescribe. */
const INJECTION = [
  /\b(?:ignore|disregard|forget)\b.{0,40}\b(?:previous|above|prior|all)\b.{0,20}\b(?:instructions?|rules?|prompts?)\b/i,
  /\b(?:ignora|olvida|omite)\b.{0,40}\b(?:instrucciones|reglas|indicaciones)\b/i,
  /\b(?:system|developer)\s*(?:prompt|message|mensaje)\b/i,
  /<\/?\s*(?:system|assistant|user|instructions?)\s*>/i,
  /\b(?:you are now|ahora eres|act[uú]a como)\b/i,
  /\b(?:run|execute|ejecuta)\b.{0,20}\b(?:rm\s+-rf|curl|wget|sudo|powershell)\b/i,
];

/** Normaliza espacios, elimina controles e invisibles y recorta a `max` caracteres. */
export function normalizeText(value: string, max = 500): string {
  const clean = value.normalize('NFC').replace(INVISIBLE, '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

/** Escapa un valor para una celda de tabla o un elemento de lista Markdown. */
export function escapeMarkdown(value: string, max = 500): string {
  return normalizeText(value, max)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(INLINE, (c) => `\\${c}`)
    .replace(LEADING, (c) => `\\${c}`);
}

/** `true` si el texto contiene patrones de inyección de instrucciones conocidos. */
export function looksLikeInstruction(value: string): boolean {
  const text = normalizeText(value, 2000);
  return INJECTION.some((pattern) => pattern.test(text));
}
