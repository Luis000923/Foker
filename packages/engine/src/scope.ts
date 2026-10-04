import { FokerError, matchGlobs } from '@foker/core';

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
