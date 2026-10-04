import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join, posix } from 'node:path';
import { promisify } from 'node:util';
import { type ContextRequest, FokerError } from '@foker/core';
import { parse as parseYaml } from 'yaml';

const exec = promisify(execFile);
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
  const rules = await optionalFile(join(root, 'foker/rules.md'));
  let skill: ContextRequest['skill'];
  if (options.skill !== undefined) {
    const name = options.skill;
    if (!/^[\w-]+$/.test(name)) throw new FokerError('FKR-SKL-001', `Skill inexistente: ${name}`);
    const directory = join(root, 'foker/skills', name);
    const source = await optionalFile(join(directory, 'SKILL.md'));
    if (source === undefined) throw new FokerError('FKR-SKL-001', `Skill inexistente: ${name}`);
    skill = {
      name,
      body: source.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, ''),
      requiredFiles: [],
      requiredSymbols: [],
    };
    const manifest = await optionalFile(join(directory, 'foker.skill.yaml'));
    if (manifest !== undefined) {
      const parsed = parseYaml(manifest) as { required_context?: { files?: unknown; symbols?: unknown } } | null;
      const strings = (value: unknown): string[] =>
        Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
      skill.requiredFiles = strings(parsed?.required_context?.files);
      skill.requiredSymbols = strings(parsed?.required_context?.symbols);
    }
  }
  let dirtyFiles: string[] = [];
  try {
    // git devuelve rutas relativas a la raíz del repositorio; el root de Foker puede ser un subdirectorio.
    const { stdout: prefixOut } = await exec('git', ['rev-parse', '--show-prefix'], { cwd: root, timeout: 5000 });
    const prefix = prefixOut.trim().replaceAll('\\', '/');
    const { stdout } = await exec('git', ['status', '--porcelain', '-z', '--untracked-files=all', '--', '.'], {
      cwd: root,
      timeout: 5000,
    });
    const entries = stdout.split('\0');
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (!entry) continue;
      const path = posix.normalize(entry.slice(3).replaceAll('\\', '/'));
      if (path.startsWith(prefix)) dirtyFiles.push(path.slice(prefix.length));
      if (/^[RC]|^.[RC]/.test(entry)) i++;
    }
    dirtyFiles = [...new Set(dirtyFiles)].sort();
  } catch {
    dirtyFiles = [];
  }
  return { ...(rules === undefined ? {} : { rules }), ...(skill ? { skill } : {}), dirtyFiles };
}
