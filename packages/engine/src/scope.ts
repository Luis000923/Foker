import { readdir } from 'node:fs/promises';
import { join, posix } from 'node:path';
import { FokerError, matchGlobs, normalizePath } from '@foker/core';

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
