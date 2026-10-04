import { lstat, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { estimateTokens, FokerError, matchGlobs, normalizePath } from '@foker/core';
import { type FokerSkill, formatIssues, validate } from '@foker/schemas';
import { parse, stringify } from 'yaml';
import { loadConfig } from '../config.js';

export const validSkillName = (name: string) => name.length <= 64 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name);
const packaged = fileURLToPath(new URL('../../skills/', import.meta.url));
const development = fileURLToPath(new URL('../../../../skills/', import.meta.url));
export const headingSlug = (heading: string) =>
  heading
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s/g, '-');
export function skillTemplate(name: string) {
  return {
    markdown: `---\nname: ${name}\ndescription: Procedimiento para ${name}.\n---\n\n# ${name}\n\n## Procedimiento\n1. Solicita contexto y limita los cambios al alcance autorizado.\n2. Ejecuta los checks y corrige los hallazgos antes de entregar.\n\n## Errores comunes\n- Ampliar el alcance sin autorización.\n`,
    manifest: {
      schema_version: 1,
      name,
      version: '1.0.0',
      purpose: `Procedimiento para ${name}`,
      triggers: { keywords: [name] },
      constraints: ['Respetar el alcance autorizado'],
      tools: ['foker_context', 'foker_check', 'foker_task_submit'],
      workflow_ref: 'SKILL.md#procedimiento',
      validation: { checks: ['typecheck', 'lint', 'test'] },
      outputs: [{ kind: 'modified_files', within_scope: true }],
      permissions: { network: false },
    },
  };
}
export async function validateSkill(dir: string, options: { strict?: boolean } = {}) {
  const errors: string[] = [];
  const warnings: string[] = [];
  let markdown = '';
  let body = '';
  let manifest: FokerSkill | undefined;
  let description = '';
  try {
    for (const path of [dir, join(dir, 'SKILL.md'), join(dir, 'foker.skill.yaml')])
      if ((await lstat(path)).isSymbolicLink()) throw new Error('No se permiten enlaces simbólicos');
    markdown = await readFile(join(dir, 'SKILL.md'), 'utf8');
    const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(markdown);
    if (!match) throw new Error('Falta frontmatter de SKILL.md');
    const front: unknown = parse(match[1] ?? '');
    if (!front || typeof front !== 'object' || Array.isArray(front)) throw new Error('Frontmatter inválido');
    const fields = front as Record<string, unknown>;
    const name = basename(dir);
    if (!validSkillName(name) || fields['name'] !== name) errors.push('Nombre inválido o distinto al directorio');
    if (
      typeof fields['description'] !== 'string' ||
      fields['description'].length < 1 ||
      fields['description'].length > 1024
    )
      errors.push('description debe tener 1–1024 caracteres');
    else description = fields['description'];
    for (const field of Object.keys(fields))
      if (!['name', 'description', 'license', 'compatibility', 'metadata', 'allowed-tools'].includes(field))
        warnings.push(`Campo no estándar: ${field}`);
    body = markdown.slice(match[0].length);
    const result = validate<FokerSkill>('foker-skill', parse(await readFile(join(dir, 'foker.skill.yaml'), 'utf8')));
    if (!result.ok) errors.push(formatIssues(result.issues));
    else {
      manifest = result.value;
      if (manifest.name !== name) errors.push('name del contrato distinto al directorio');
      const anchor = manifest.workflow_ref.split('#')[1];
      const headings = [...body.matchAll(/^ {0,3}#{1,6}\s+(.+?)\s*#*\s*$/gm)].map((m) => headingSlug(m[1] ?? ''));
      if (anchor !== undefined && !headings.includes(anchor))
        errors.push('workflow_ref debe apuntar a un encabezado existente');
    }
    if (markdown.split(/\r?\n/).length > 500) warnings.push('SKILL.md supera 500 líneas');
    if (estimateTokens(markdown) > 5000) warnings.push('SKILL.md supera 5000 tokens');
    for (const [label, pattern] of [
      ['descarga y shell', /(?:curl|wget)[^\n]*\|\s*(?:sh|bash)\b/i],
      ['instrucciones anteriores', /ignore previous|ignora las instrucciones anteriores/i],
      ['URL externa', /https?:\/\/[^\s)]+/i],
      ['borrado recursivo', /\brm\s+-rf\b/i],
      ['base64 largo', /[A-Za-z0-9+/]{100,}={0,2}/],
    ] as const)
      if (pattern.test(markdown)) warnings.push(`Patrón sospechoso: ${label}`);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  if (options.strict) errors.push(...warnings);
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    markdown,
    body,
    manifest,
    description,
    name: basename(dir),
    dir,
  };
}
async function directories(path: string) {
  try {
    return (await readdir(path, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}
export async function listSkills(
  root: string,
  options: { configPath?: string; config?: Awaited<ReturnType<typeof loadConfig>>['config'] } = {},
) {
  const config = options.config ?? (await loadConfig(root, options)).config;
  const included = (await directories(packaged)).length ? packaged : development;
  const entries = new Map<string, { name: string; dir: string; source: string }>();
  for (const [base, source] of [
    [included, 'included'],
    [join(root, normalizePath(root, 'foker/skills')), 'project'],
  ] as const)
    for (const name of await directories(base)) entries.set(name, { name, dir: join(base, name), source });
  return [...entries.values()]
    .filter((e) => !config.skills.disabled.includes(e.name))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}
export async function loadSkill(root: string, name: string, options: { configPath?: string } = {}) {
  if (!validSkillName(name)) throw new FokerError('FKR-SKL-001', `Skill inexistente: ${name}`);
  const entry = (await listSkills(root, options)).find((e) => e.name === name);
  if (!entry) throw new FokerError('FKR-SKL-001', `Skill inexistente: ${name}`);
  const result = await validateSkill(entry.dir);
  if (!result.valid || !result.manifest) throw new FokerError('FKR-SKL-002', result.errors.join('; '));
  return { ...result, manifest: result.manifest, source: entry.source };
}
/** Predicado de intersección; conserva ambos conjuntos de globs sin aproximarlos. */
export function effectiveWritePaths(taskScope: readonly string[], skillPermissions: { write_paths?: string[] }) {
  return (path: string) =>
    matchGlobs(path, [...taskScope]) &&
    (skillPermissions.write_paths === undefined || matchGlobs(path, skillPermissions.write_paths));
}
export async function newSkill(root: string, name: string, dryRun = false) {
  if (!validSkillName(name)) throw new FokerError('FKR-INP-001', 'Nombre de skill inválido');
  const dir = join(root, normalizePath(root, `foker/skills/${name}`));
  try {
    await lstat(dir);
    throw new FokerError('FKR-INP-001', 'La skill ya existe');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const files = [`foker/skills/${name}/SKILL.md`, `foker/skills/${name}/foker.skill.yaml`];
  if (!dryRun) {
    await mkdir(join(root, normalizePath(root, 'foker/skills')), { recursive: true });
    await mkdir(dir);
    const template = skillTemplate(name);
    await writeFile(join(dir, 'SKILL.md'), template.markdown, { flag: 'wx' });
    await writeFile(join(dir, 'foker.skill.yaml'), stringify(template.manifest), { flag: 'wx' });
  }
  return files;
}
