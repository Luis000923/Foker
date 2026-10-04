import { readFileSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { FokerError, listSkills, loadConfig, normalizePath } from '@foker/engine';
import { HOST_IDS, type HostId, loadRoles, planSync, type SkillInput } from '@foker/integrations';
import { type Command, flag } from '../types.js';

/** Archivos de una skill (sin ocultos), con rutas POSIX relativas a su directorio. */
async function skillFiles(dir: string, prefix = ''): Promise<SkillInput['files']> {
  const out: SkillInput['files'] = [];
  for (const entry of (await readdir(join(dir, prefix), { withFileTypes: true })).sort((a, b) =>
    a.name < b.name ? -1 : 1,
  )) {
    if (entry.name.startsWith('.')) continue;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...(await skillFiles(dir, rel)));
    else if (entry.isFile()) out.push({ path: rel, content: await readFile(join(dir, rel), 'utf8') });
  }
  return out;
}

function parseTargets(value: string | undefined, configured: string[]): HostId[] {
  const raw = value
    ? value
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
    : configured;
  const unknown = raw.filter((t) => !(HOST_IDS as readonly string[]).includes(t));
  if (unknown.length) throw new FokerError('FKR-INP-001', `Anfitrión desconocido: ${unknown.join(', ')}`);
  return [...new Set(raw as HostId[])].sort();
}

/** Ejecuta `foker sync` y devuelve el plan aplicado (lo reutiliza `foker init`). */
export async function runSync(
  root: string,
  options: { targets?: string; check?: boolean; dryRun?: boolean; force?: boolean; configPath?: string },
) {
  const { config } = await loadConfig(root, options.configPath ? { configPath: options.configPath } : {});
  const targets = parseTargets(options.targets, config.integrations.targets ?? []);
  const skills: SkillInput[] = [];
  for (const entry of await listSkills(root, options.configPath ? { configPath: options.configPath } : {})) {
    skills.push({ name: entry.name, files: await skillFiles(entry.dir) });
  }
  const plan = planSync(
    {
      targets,
      skills,
      roles: await loadRoles(),
      protectedPaths: config.policy.protected_paths ?? [],
      secretGlobs: config.policy.secret_globs ?? [],
    },
    {
      read: (path) => {
        try {
          return readFileSync(join(root, normalizePath(root, path)), 'utf8');
        } catch {
          return undefined;
        }
      },
    },
    { force: options.force ?? false },
  );
  const apply = !options.check && !options.dryRun && plan.conflicts.length === 0;
  if (apply) {
    for (const write of plan.writes) {
      const path = join(root, normalizePath(root, write.path));
      if (write.content === null) await rm(path, { force: true });
      else {
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, write.content, 'utf8');
      }
    }
  }
  return { targets, plan, applied: apply };
}

export const syncCommand: Command = {
  name: 'sync',
  description: 'Genera o actualiza la configuración de los agentes anfitriones',
  maxArgs: 0,
  flags: [
    flag('target', 'string', 'Anfitriones separados por comas (claude-code, opencode, antigravity)'),
    flag('check', 'boolean', 'Sale con 1 si los archivos difieren de lo que generaría; no escribe'),
    flag('force', 'boolean', 'Sobrescribe contenido gestionado editado a mano'),
  ],
  async run(ctx) {
    const { targets, plan, applied } = await runSync(ctx.cwd, {
      targets: String(ctx.flags['target'] ?? ''),
      check: Boolean(ctx.flags['check']),
      dryRun: Boolean(ctx.flags['dry-run']),
      force: Boolean(ctx.flags['force']),
      ...(ctx.flags['config'] ? { configPath: String(ctx.flags['config']) } : {}),
    });
    const changes = plan.writes.map((w) => ({ path: w.path, action: w.content === null ? 'delete' : 'write' }));
    const data = { targets, changes, conflicts: plan.conflicts, applied };
    if (plan.conflicts.length > 0) {
      return {
        data,
        warnings: [],
        errors: plan.conflicts.map((c) => ({
          code: 'FKR-SYN-001',
          message: `${c.path}: ${c.reason}`,
          hint: 'Revisa el cambio o ejecuta foker sync --force',
        })),
        exitCode: 1,
      };
    }
    const human = changes.length
      ? `${changes.map((c) => `${c.action === 'delete' ? '-' : '~'} ${c.path}`).join('\n')}\n`
      : 'sync: sin cambios\n';
    return { data, warnings: [], human, exitCode: ctx.flags['check'] && changes.length > 0 ? 1 : 0 };
  },
};
