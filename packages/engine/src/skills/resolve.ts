import { cp, lstat, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { FokerError, normalizePath } from '@foker/core';
import type { FokerMdFrontmatter } from '@foker/schemas';
import { listSkills, validateSkill } from './index.js';

/** Skills que toda especificación necesita. */
const BASE = ['foker-workflow', 'ts-strict-change', 'write-tests'];

const WEB_STACKS = new Set(['nextjs', 'next', 'react']);

/**
 * Resuelve los nombres de skills a partir de `architecture` en `foker.md`.
 * Tabla fija y determinista: sin red ni heurísticas.
 */
export function resolveSkillNames(spec: Pick<FokerMdFrontmatter, 'architecture'>): string[] {
  const arch = spec.architecture;
  const names = new Set(BASE);
  if (arch?.stack?.some((s) => WEB_STACKS.has(s))) for (const n of ['next-route', 'react-component']) names.add(n);
  if (arch?.auth || arch?.security?.owasp_asvs) names.add('secure-form');
  if (arch?.security?.owasp_asvs === 'L2' || arch?.security?.owasp_asvs === 'L3') names.add('asvs-l2-review');
  return [...names].sort();
}

export interface InstallSkillsResult {
  /** Skills copiadas a `foker/skills/`. */
  installed: string[];
  /** Skills ya presentes en el proyecto; no se sobrescriben. */
  existing: string[];
  /** Skills resueltas que no existen en el catálogo incluido. */
  missing: string[];
}

/**
 * Copia (no enlaza: ADR-010 prohíbe symlinks) las skills incluidas necesarias a `foker/skills/`.
 * Valida cada skill antes de escribir y no sobrescribe las del proyecto.
 */
export async function installSkills(
  root: string,
  names: readonly string[],
  options: { dryRun?: boolean } = {},
): Promise<InstallSkillsResult> {
  const catalog = new Map((await listSkills(root)).map((e) => [e.name, e]));
  const result: InstallSkillsResult = { installed: [], existing: [], missing: [] };
  for (const name of names) {
    const entry = catalog.get(name);
    if (!entry) {
      result.missing.push(name);
      continue;
    }
    if (entry.source === 'project') {
      result.existing.push(name);
      continue;
    }
    const check = await validateSkill(entry.dir);
    if (!check.valid) throw new FokerError('FKR-SKL-002', `${name}: ${check.errors.join('; ')}`);
    const dest = join(root, normalizePath(root, `foker/skills/${name}`));
    if (
      await lstat(dest).then(
        () => true,
        () => false,
      )
    ) {
      result.existing.push(name);
      continue;
    }
    if (!options.dryRun) {
      await mkdir(join(root, normalizePath(root, 'foker/skills')), { recursive: true });
      await cp(entry.dir, dest, { recursive: true, errorOnExist: true, force: false, dereference: false });
    }
    result.installed.push(name);
  }
  return result;
}
