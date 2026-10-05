import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { implementerBody } from './content.js';
import { splitFrontmatter } from './text.js';
import type { Role } from './types.js';

/** `roles/` empaquetado (publicado) o el del repositorio (desarrollo). */
const packaged = fileURLToPath(new URL('../roles/', import.meta.url));
const development = fileURLToPath(new URL('../../../roles/', import.meta.url));

/** Interpreta un rol canónico (frontmatter YAML + cuerpo). */
export function parseRole(markdown: string): Role {
  const { frontmatter, body } = splitFrontmatter(markdown);
  const data = (parse(frontmatter) ?? {}) as Record<string, unknown>;
  const name = typeof data['name'] === 'string' ? data['name'] : '';
  const description = typeof data['description'] === 'string' ? data['description'] : '';
  const tools = Array.isArray(data['foker_tools']) ? data['foker_tools'].filter((t) => typeof t === 'string') : [];
  const native = data['native'] === 'edit' ? 'edit' : 'read';
  if (!/^foker-[a-z0-9-]+$/.test(name) || !description) throw new Error(`rol inválido: ${name || '(sin nombre)'}`);
  return { name, description, fokerTools: tools, native, body };
}

async function readRoles(dir: string): Promise<Role[]> {
  const names = (await readdir(dir)).filter((n) => n.endsWith('.md')).sort();
  return Promise.all(
    names.map(async (n) => {
      const role = parseRole(await readFile(`${dir}${n}`, 'utf8'));
      return role.name === 'foker-implementer' ? { ...role, body: implementerBody() } : role;
    }),
  );
}

/** Roles incluidos con Foker, ordenados por nombre. */
export async function loadRoles(): Promise<Role[]> {
  try {
    return await readRoles(packaged);
  } catch {
    return readRoles(development);
  }
}
