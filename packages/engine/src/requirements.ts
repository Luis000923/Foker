import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { normalizePath } from '@foker/core';

/** Documentos de requisitos, en orden de preferencia. */
export const REQUIREMENTS_FILES = ['REQUIREMENTS.md', 'foker.md'] as const;
/** Tope de la sección de requisitos en el pack (estimador de Foker: bytes·5/16). */
export const REQUIREMENTS_MAX_TOKENS = 1500;

export interface RequirementsSection {
  heading: string;
  body: string;
}

const tokens = (text: string) => Math.ceil((Buffer.byteLength(text) * 5) / 16);

/** Términos de la tarea: minúsculas, sin tildes, de 4 o más letras. */
export function terms(text: string): Set<string> {
  return new Set(
    text
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((t) => t.length >= 4),
  );
}

/** Parte un Markdown en secciones `##` (sin frontmatter); el preámbulo va como sección sin título. */
export function splitSections(markdown: string): RequirementsSection[] {
  const text = markdown.replace(/\r\n/g, '\n').replace(/^---\n[\s\S]*?\n---\n/, '');
  const sections: RequirementsSection[] = [];
  let current: RequirementsSection = { heading: '', body: '' };
  let fence = false;
  for (const line of text.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    const heading = !fence && line.match(/^##\s+(.+?)\s*#*\s*$/);
    if (heading) {
      if (current.heading || current.body.trim()) sections.push(current);
      current = { heading: heading[1] ?? '', body: '' };
    } else current.body += `${line}\n`;
  }
  if (current.heading || current.body.trim()) sections.push(current);
  return sections.map((s) => ({ heading: s.heading, body: s.body.trim() }));
}

/**
 * Elige las secciones relevantes para la tarea: puntúa coincidencias de términos (título ×3,
 * cuerpo ×1), conserva el orden del documento y respeta [`REQUIREMENTS_MAX_TOKENS`]. Si nada
 * coincide devuelve solo el índice de títulos para que el agente pida lo que necesite.
 * Determinista: mismo documento y tarea → mismo texto.
 */
export function selectRequirements(markdown: string, task: string, maxTokens = REQUIREMENTS_MAX_TOKENS): string {
  const sections = splitSections(markdown).filter((s) => s.heading);
  if (sections.length === 0) return '';
  const wanted = terms(task);
  const scored = sections.map((section, index) => {
    const head = terms(section.heading);
    const body = terms(section.body);
    let score = 0;
    for (const t of wanted) score += (head.has(t) ? 3 : 0) + (body.has(t) ? 1 : 0);
    return { section, index, score };
  });
  const ranked = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score || a.index - b.index);
  const chosen: typeof ranked = [];
  let used = 0;
  for (const entry of ranked) {
    const cost = tokens(`## ${entry.section.heading}\n${entry.section.body}\n`);
    if (used + cost > maxTokens) continue;
    chosen.push(entry);
    used += cost;
  }
  const index = `Secciones: ${sections.map((s) => s.heading).join(' · ')}`;
  if (chosen.length === 0) return index;
  const body = chosen
    .sort((a, b) => a.index - b.index)
    .map((e) => `## ${e.section.heading}\n${e.section.body}`)
    .join('\n\n');
  const omitted = sections.length - chosen.length;
  return omitted > 0 ? `${body}\n\n(${omitted} secciones omitidas) ${index}` : body;
}

/** Lee el primer documento de requisitos existente y elige sus secciones para la tarea. */
export async function gatherRequirements(
  root: string,
  task: string,
): Promise<{ id: string; body: string } | undefined> {
  for (const id of REQUIREMENTS_FILES) {
    let text: string;
    try {
      text = await readFile(join(root, normalizePath(root, id)), 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw error;
    }
    const body = selectRequirements(text, task);
    return body ? { id, body } : undefined;
  }
  return undefined;
}
