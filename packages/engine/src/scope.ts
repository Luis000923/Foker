import { readdir } from 'node:fs/promises';
import { join, posix } from 'node:path';
import { FokerError, matchGlobs, normalizePath } from '@foker/core';
import type { ContextPack } from '@foker/schemas';

const literalPrefix = (glob: string) => glob.split(/[?*{[]/, 1)[0] ?? '';
const representative = (glob: string) =>
  glob
    .replace(/\*\*|\*|\?/g, 'x')
    .replace(/\{([^}]+)\}/g, (_, choices: string) => choices.split(',')[0] ?? 'x')
    .replace(/\[[^\]]+\]/g, 'x');

/** Detecta intersecciones potenciales incluso cuando el mapa omite rutas protegidas. */
export function protectedPathsInScope(scope: string[], protectedGlobs: string[], files: string[] = []): string[] {
  const paths = new Set(files.filter((path) => matchGlobs(path, scope) && matchGlobs(path, protectedGlobs)));
  for (const protectedGlob of protectedGlobs) {
    for (const glob of scope) {
      const prefixes = [literalPrefix(glob), literalPrefix(protectedGlob)];
      if (
        (prefixes[0] && matchGlobs(prefixes[0], [protectedGlob])) ||
        (prefixes[1] && matchGlobs(prefixes[1], [glob])) ||
        matchGlobs(representative(protectedGlob), [glob]) ||
        matchGlobs(representative(glob), [protectedGlob])
      )
        paths.add(protectedGlob);
    }
  }
  return [...paths].sort();
}

export function assertUnprotectedScope(scope: string[], protectedGlobs: string[], files: string[] = []): void {
  const protected_paths_in_scope = protectedPathsInScope(scope, protectedGlobs, files);
  if (protected_paths_in_scope.length)
    throw new FokerError('FKR-POL-002', `Alcance protegido: ${JSON.stringify({ protected_paths_in_scope })}`);
}

/** Admite archivos nuevos solo cuando su directorio ya existe; no sigue symlinks. */
export async function nonexistentScopePaths(root: string, scope: string[], files: string[]): Promise<string[]> {
  for (const glob of scope) {
    normalizePath(root, glob);
    matchGlobs('validation', [glob]);
  }
  const unmatched = scope.filter((glob) => !files.some((file) => matchGlobs(file, [glob])));
  if (!unmatched.length) return [];
  const directories = ['.'];
  async function walk(directory: string) {
    for (const entry of await readdir(join(root, directory), { withFileTypes: true })) {
      if (!entry.isDirectory() || ['.git', '.foker', 'node_modules'].includes(entry.name)) continue;
      const path = directory === '.' ? entry.name : `${directory}/${entry.name}`;
      directories.push(path);
      await walk(path);
    }
  }
  await walk('.');
  return unmatched.filter((glob) => {
    const parent = glob.endsWith('/') ? glob.slice(0, -1) : posix.dirname(glob);
    return !directories.some(
      (directory) =>
        // Ancla el directorio al root: «src» como glob de basename también
        // coincidiría con packages/catalog/src y aceptaría un «src/**» inventado.
        (parent === '.' && directory === '.') ||
        matchGlobs(`root/${directory}`, [`root/${glob}`, `root/${parent}`]) ||
        matchGlobs(`root/${directory}/`, [`root/${glob}`, `root/${parent}`]),
    );
  });
}

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
/**
 * Directorio de un archivo como alcance glob. Un archivo de la raíz se acota a sí mismo:
 * `**` intersecta siempre las rutas protegidas y begin lo rechazaría (ADR-032).
 */
export const directoryScope = (file: string) => {
  const directory = posix.dirname(file);
  return directory === '.' ? file : `${directory}/**`;
};
/** Puntuación descendente, id ascendente en empate. */
export const rankPackFiles = (files: ContextPack['files']) =>
  [...files].sort((a, b) => b.score - a.score || compare(a.id, b.id));

const DIRECT = /^(ANCHOR|PATH_MENTION|SYMBOL_MENTION|LEXICAL:)/;
/** Señal propia de la tarea; CORE o DEPENDENCY_OF/DEPENDENT_OF solo llegan por el grafo. */
const directSignal = (file: ContextPack['files'][number]) => file.reasons.some((reason) => DIRECT.test(reason));

/**
 * Alcance derivado del pack preliminar (ADR-031 fase 2b); usa niveles, nunca texto renderizado.
 * Sin L3, toma tres L1/L2 con señal directa y luego L2 del grafo (ADR-036 D5).
 */
export function deriveScopePaths(pack: Pick<ContextPack, 'files'>): string[] {
  const targets = pack.files.filter((file) => file.level === 'L3');
  const candidates = pack.files.filter((file) => file.level === 'L2' || file.level === 'L1');
  const files = targets.length
    ? targets
    : [
        ...rankPackFiles(candidates.filter(directSignal)),
        ...rankPackFiles(candidates.filter((file) => file.level === 'L2' && !directSignal(file))),
      ].slice(0, 3);
  return [...new Set(files.map((file) => directoryScope(file.id)))].sort(compare);
}
