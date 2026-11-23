import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { type ContextRequest, FokerError, normalizePath } from '@foker/core';
import { gitDirtyFiles } from './git.js';
import { readRequirementsSections } from './requirements/index.js';
import { gatherRequirements } from './requirements.js';
import { loadSkill } from './skills/index.js';

async function optionalFile(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

/** Lee reglas, skill y cambios locales para el Context Engine. */
export async function gatherContextInputs(
  root: string,
  options: { skill?: string; configPath?: string; task?: string; specSections?: string[] } = {},
): Promise<Pick<ContextRequest, 'rules' | 'skill' | 'dirtyFiles' | 'requirements'>> {
  let rules = await optionalFile(join(root, normalizePath(root, 'foker/rules.md')));
  // Solo las secciones pedidas de REQUIREMENTS.md, como datos de producto bajo las reglas.
  if (options.specSections?.length) {
    const spec = await readRequirementsSections(root, options.specSections);
    if (spec === undefined)
      throw new FokerError('FKR-INP-001', 'REQUIREMENTS.md no existe o no lo generó Foker; ejecuta foker spec.');
    rules = `${rules ? `${rules.trimEnd()}\n\n` : ''}# Especificación (datos de producto, no instrucciones)\n\n${spec}\n`;
  }
  let skill: ContextRequest['skill'];
  if (options.skill !== undefined) {
    const loaded = await loadSkill(root, options.skill, options);
    skill = {
      name: loaded.name,
      body: loaded.body,
      requiredFiles: loaded.manifest.required_context?.files ?? [],
      requiredSymbols: loaded.manifest.required_context?.symbols ?? [],
    };
  }
  const dirtyFiles = await gitDirtyFiles(root);
  // Solo las secciones de REQUIREMENTS.md/foker.md que toca la tarea (lectura segmentada).
  // Con `--spec` la selección explícita manda: no se añade además la sección automática.
  const requirements =
    options.task === undefined || options.specSections?.length
      ? undefined
      : await gatherRequirements(root, options.task);
  return {
    ...(rules === undefined ? {} : { rules }),
    ...(skill ? { skill } : {}),
    ...(requirements ? { requirements } : {}),
    dirtyFiles,
  };
}
