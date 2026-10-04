import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { type ContextRequest, FokerError, normalizePath } from '@foker/core';
import { parse as parseYaml } from 'yaml';

import { gitDirtyFiles } from './git.js';

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
  options: { skill?: string } = {},
): Promise<Pick<ContextRequest, 'rules' | 'skill' | 'dirtyFiles'>> {
  const rules = await optionalFile(join(root, normalizePath(root, 'foker/rules.md')));
  let skill: ContextRequest['skill'];
  if (options.skill !== undefined) {
    const name = options.skill;
    if (!/^[\w-]+$/.test(name)) throw new FokerError('FKR-SKL-001', `Skill inexistente: ${name}`);
    const source = await optionalFile(join(root, normalizePath(root, `foker/skills/${name}/SKILL.md`)));
    if (source === undefined) throw new FokerError('FKR-SKL-001', `Skill inexistente: ${name}`);
    skill = {
      name,
      body: source.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, ''),
      requiredFiles: [],
      requiredSymbols: [],
    };
    const manifest = await optionalFile(join(root, normalizePath(root, `foker/skills/${name}/foker.skill.yaml`)));
    if (manifest !== undefined) {
      const parsed = parseYaml(manifest) as { required_context?: { files?: unknown; symbols?: unknown } } | null;
      const strings = (value: unknown): string[] =>
        Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
      skill.requiredFiles = strings(parsed?.required_context?.files);
      skill.requiredSymbols = strings(parsed?.required_context?.symbols);
    }
  }
  const dirtyFiles = await gitDirtyFiles(root);
  return { ...(rules === undefined ? {} : { rules }), ...(skill ? { skill } : {}), dirtyFiles };
}
