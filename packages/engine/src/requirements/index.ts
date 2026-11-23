import { randomBytes } from 'node:crypto';
import { lstat, mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { FokerError, normalizePath } from '@foker/core';
import { renderTokensCss } from '../design/tokens.js';
import { type ResolvedRequirements, resolveRequirements } from './model.js';
import {
  REQUIREMENTS_MARKER,
  REQUIREMENTS_SECTIONS,
  type RenderOptions,
  renderRequirements,
  type SectionId,
} from './render.js';
import { buildDesignTokens, type TokenBuild } from './tokens.js';

export * from './contrast.js';
export * from './model.js';
export * from './render.js';
export { escapeMarkdown, looksLikeInstruction, normalizeText } from './sanitize.js';
export * from './tokens.js';

export const REQUIREMENTS_FILE = 'REQUIREMENTS.md';
export const ANSWERS_FILE = 'foker/requirements.answers.json';
export const TOKENS_FILE = 'foker/design-tokens.json';

export interface RequirementsFile {
  path: string;
  content: string;
  /** Ya existe con otro contenido: escribirlo exige confirmación o `--force`. */
  conflict: boolean;
}
export interface RequirementsPlan {
  resolved: ResolvedRequirements;
  build: TokenBuild;
  files: RequirementsFile[];
}

/** Lectura que distingue «no existe» de cualquier otro fallo y rechaza enlaces simbólicos. */
async function existing(root: string, path: string): Promise<string | undefined> {
  // Plantilla en un directorio que init aún no ha creado: nada que comparar.
  if (!(await lstat(root).catch(() => undefined))) return undefined;
  const absolute = join(root, normalizePath(root, path));
  const info = await lstat(absolute).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return undefined;
    throw error;
  });
  if (!info) return undefined;
  if (info.isSymbolicLink() || !info.isFile())
    throw new FokerError('FKR-INP-001', `Destino inseguro o incompatible: ${path}`);
  return readFile(absolute, 'utf8');
}

/** Respuestas validadas y canónicas: el JSON guardado reproduce el Markdown byte a byte. */
export function canonicalAnswers(answers: unknown): string {
  const sort = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(sort)
      : value && typeof value === 'object'
        ? Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((k) => [k, sort((value as Record<string, unknown>)[k])]),
          )
        : value;
  return `${JSON.stringify(sort(answers), null, 2)}\n`;
}

/**
 * Calcula REQUIREMENTS.md, respuestas y Design Tokens sin escribir nada. Puro salvo lecturas para
 * detectar conflictos; seguro de llamar antes de confirmar.
 */
export async function planRequirements(
  root: string,
  answers: unknown,
  options: Omit<RenderOptions, 'tokensPath' | 'answersPath'> & { tokensPath?: string },
): Promise<RequirementsPlan> {
  const resolved = resolveRequirements(answers);
  const build = buildDesignTokens(
    options.name
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'app',
    resolved,
  );
  const tokensPath = options.tokensPath ?? TOKENS_FILE;
  const render: RenderOptions = { ...options, tokensPath, answersPath: ANSWERS_FILE };
  const contents: [string, string][] = [
    [REQUIREMENTS_FILE, renderRequirements(resolved, build, render)],
    [ANSWERS_FILE, canonicalAnswers(answers)],
    [tokensPath, `${JSON.stringify(build.tokens, null, 2)}\n`],
    [options.cssPath, renderTokensCss(build.tokens)],
  ];
  const files: RequirementsFile[] = [];
  for (const [path, content] of contents) {
    const current = await existing(root, path);
    files.push({ path, content, conflict: current !== undefined && current !== content });
  }
  return { resolved, build, files };
}

/**
 * Escritura atómica: archivo temporal exclusivo en el mismo directorio, fsync y rename. Una
 * interrupción (SIGINT) deja el archivo anterior intacto o el nuevo completo, nunca uno a medias.
 */
export async function writeFileAtomic(root: string, path: string, content: string): Promise<void> {
  await mkdir(root, { recursive: true });
  const relative = normalizePath(root, path);
  const target = join(root, relative);
  // Ningún componente de la ruta puede ser un enlace: impide escribir fuera de root vía symlink.
  let current = root;
  for (const part of relative.split('/').slice(0, -1)) {
    current = join(current, part);
    const info = await lstat(current).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return undefined;
      throw error;
    });
    if (!info) break;
    if (info.isSymbolicLink() || !info.isDirectory())
      throw new FokerError('FKR-INP-001', `Destino inseguro o incompatible: ${path}`);
  }
  await mkdir(dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  const handle = await open(temporary, 'wx', 0o644);
  try {
    await handle.writeFile(content, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

/** Aplica el plan: primero comprueba todos los destinos, luego escribe cada archivo de forma atómica. */
export async function applyRequirements(root: string, files: RequirementsFile[]): Promise<string[]> {
  for (const file of files) await existing(root, file.path);
  const written: string[] = [];
  for (const file of files) {
    await writeFileAtomic(root, file.path, file.content);
    written.push(file.path);
  }
  return written;
}

/** Ids de sección válidos para `foker context --spec`. */
export const SECTION_IDS: readonly SectionId[] = REQUIREMENTS_SECTIONS.map((s) => s.id);

/**
 * Extrae las secciones pedidas de REQUIREMENTS.md por su encabezado fijo. Devuelve `undefined` si
 * el archivo no existe o no lo generó Foker; lanza FKR-INP-001 ante un id desconocido.
 */
export async function readRequirementsSections(root: string, ids: string[]): Promise<string | undefined> {
  const unknown = ids.filter((id) => !(SECTION_IDS as readonly string[]).includes(id));
  if (unknown.length)
    throw new FokerError(
      'FKR-INP-001',
      `Sección desconocida: ${unknown.join(', ')} (válidas: ${SECTION_IDS.join(', ')})`,
    );
  const text = await existing(root, REQUIREMENTS_FILE);
  if (text === undefined || !text.startsWith(REQUIREMENTS_MARKER)) return undefined;
  return extractSections(text, ids as SectionId[]);
}

/** Secciones en el orden del documento; cada una va de su `## Título` al siguiente `## `. */
export function extractSections(markdown: string, ids: SectionId[]): string {
  const wanted = new Set(REQUIREMENTS_SECTIONS.filter((s) => ids.includes(s.id)).map((s) => `## ${s.title}`));
  const out: string[] = [];
  let keep = false;
  let fence = false;
  for (const line of markdown.split('\n')) {
    if (line.startsWith('```')) fence = !fence;
    if (!fence && line.startsWith('## ')) keep = wanted.has(line.trimEnd());
    else if (!fence && line.startsWith('# ')) keep = false;
    if (keep) out.push(line);
  }
  return out.join('\n').trim();
}
