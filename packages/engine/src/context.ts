import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { type ContextRequest, normalizePath } from '@foker/core';
import { gitDirtyFiles } from './git.js';
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
  options: { skill?: string; configPath?: string } = {},
): Promise<Pick<ContextRequest, 'rules' | 'skill' | 'dirtyFiles'>> {
  const rules = await optionalFile(join(root, normalizePath(root, 'foker/rules.md')));
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
  return { ...(rules === undefined ? {} : { rules }), ...(skill ? { skill } : {}), dirtyFiles };
}
