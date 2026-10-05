import { posix } from 'node:path';
import { protectedPathsInScope } from '@foker/engine';
import type { ContextPack, ProjectMap } from '@foker/schemas';

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const directoryScope = (file: string) => {
  const directory = posix.dirname(file);
  return directory === '.' ? '**' : `${directory}/**`;
};
const ranked = (files: ContextPack['files']) => [...files].sort((a, b) => b.score - a.score || compare(a.id, b.id));

/** La selección usa los niveles del pack preliminar, nunca texto renderizado. */
export function deriveScopePaths(pack: Pick<ContextPack, 'files'>): string[] {
  const targets = pack.files.filter((file) => file.level === 'L3');
  const files = targets.length ? targets : ranked(pack.files.filter((file) => file.level === 'L2')).slice(0, 3);
  return [...new Set(files.map((file) => directoryScope(file.id)))].sort(compare);
}

export function scopeSuggestions(project: ProjectMap, protectedPaths: string[], pack?: ContextPack): string[] {
  const candidates = [
    ...(pack ? ranked(pack.files).map((file) => directoryScope(file.id)) : []),
    ...project.project.packages.map((pkg) => (pkg.path === '.' ? '**' : `${pkg.path}/**`)).sort(compare),
  ];
  return [...new Set(candidates)]
    .filter((scope) => !protectedPathsInScope([scope], protectedPaths, Object.keys(project.files)).length)
    .slice(0, 5);
}
