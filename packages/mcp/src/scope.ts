import { directoryScope, protectedPathsInScope, rankPackFiles } from '@foker/engine';
import type { ContextPack, ProjectMap } from '@foker/schemas';

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function scopeSuggestions(project: ProjectMap, protectedPaths: string[], pack?: ContextPack): string[] {
  const candidates = [
    ...(pack ? rankPackFiles(pack.files).map((file) => directoryScope(file.id)) : []),
    ...project.project.packages.map((pkg) => (pkg.path === '.' ? '**' : `${pkg.path}/**`)).sort(compare),
  ];
  return [...new Set(candidates)]
    .filter((scope) => !protectedPathsInScope([scope], protectedPaths, Object.keys(project.files)).length)
    .slice(0, 5);
}
