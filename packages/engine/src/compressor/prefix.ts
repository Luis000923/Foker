import { createHash } from 'node:crypto';
import { OUTPUT_DIRECTIVE } from './directive.js';

export interface StaticPrefix {
  text: string;
  /** Huella del prefijo: si cambia entre llamadas, el caché del anfitrión se invalida. */
  sha256: string;
}

/**
 * Prefijo estático y estable: directiva, reglas y skills ordenadas por nombre.
 * Sin datos volátiles (tarea, fechas, rutas absolutas): ADR-016.
 */
export function composeStaticPrefix(input: {
  rules?: string;
  skills?: { name: string; body: string }[];
}): StaticPrefix {
  const skills = [...(input.skills ?? [])].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const text = [
    OUTPUT_DIRECTIVE,
    ...(input.rules ? [`# rules\n${input.rules.trim()}`] : []),
    ...skills.map((s) => `# skill: ${s.name}\n${s.body.trim()}`),
  ]
    .join('\n\n')
    .replaceAll('\r\n', '\n');
  return { text, sha256: createHash('sha256').update(text).digest('hex') };
}
