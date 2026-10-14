import {
  FokerError,
  installSkills,
  listSkills,
  loadSkill,
  newSkill,
  resolveSkillNames,
  validateSkill,
  validSkillName,
} from '@foker/engine';
import { type Command, flag } from '../types.js';
import { readSpec } from './init.js';
export const skillCommands: Command[] = ['list', 'show', 'validate', 'new'].map((action) => ({
  name: `skill ${action}`,
  description: `Skills: ${action}`,
  maxArgs: action === 'list' ? 0 : 1,
  flags: [flag('strict', 'boolean', 'Validación estricta')],
  async run(ctx) {
    const name = ctx.args[0];
    if (name !== undefined && !validSkillName(name)) throw new FokerError('FKR-INP-001', 'Nombre de skill inválido');
    const options = ctx.flags['config'] ? { configPath: String(ctx.flags['config']) } : {};
    if (action === 'new' || action === 'show') {
      if (!name) throw new FokerError('FKR-INP-001', 'Indica el nombre de la skill');
      if (action === 'new') {
        const files = await newSkill(ctx.cwd, name, Boolean(ctx.flags['dry-run']));
        return { data: { files }, human: files.join('\n'), warnings: [], exitCode: 0 };
      }
      const skill = await loadSkill(ctx.cwd, name, options);
      return {
        data: skill,
        human: skill.markdown,
        warnings: skill.warnings.map((message) => ({ code: 'FKR-SKL-002', message })),
        exitCode: 0,
      };
    }
    const entries = await listSkills(ctx.cwd, options);
    if (action === 'list')
      return {
        data: entries,
        human: entries.map((e) => `${e.name} (${e.source})`).join('\n'),
        warnings: [],
        exitCode: 0,
      };
    if (name && !entries.some((e) => e.name === name))
      throw new FokerError('FKR-SKL-001', `Skill inexistente: ${name}`);
    const results = await Promise.all(
      entries
        .filter((e) => !name || e.name === name)
        .map((e) => validateSkill(e.dir, { strict: Boolean(ctx.flags['strict']) })),
    );
    return {
      data: results,
      errors: results
        .filter((r) => !r.valid)
        .map((r) => ({ code: 'FKR-SKL-002', message: `${r.name}: ${r.errors.join('; ')}` })),
      human: results.map((r) => `${r.name}: ${r.valid ? 'válida' : 'FKR-SKL-002'} ${r.errors.join('; ')}`).join('\n'),
      warnings: results.flatMap((r) => r.warnings.map((message) => ({ code: 'FKR-SKL-002', message }))),
      exitCode: results.every((r) => r.valid) ? 0 : 3,
    };
  },
}));

/** Resuelve las skills de `architecture` en foker.md y las copia a foker/skills/ (zero-config). */
export const skillInstallCommand: Command = {
  name: 'skill install',
  description: 'Instala las skills que exige architecture en foker.md (copia, sin enlaces simbólicos)',
  maxArgs: 0,
  flags: [
    flag('yes', 'boolean', 'No pregunta (modo no interactivo)'),
    flag('from-spec', 'string', 'Ruta del foker.md (por defecto foker.md)'),
  ],
  async run(ctx) {
    const spec = await readSpec(ctx.cwd, String(ctx.flags['from-spec'] || 'foker.md'));
    const names = resolveSkillNames(spec);
    const dryRun = Boolean(ctx.flags['dry-run']);
    if (!dryRun && !ctx.flags['yes']) {
      if (ctx.nonInteractive || !ctx.confirm)
        throw new FokerError('FKR-INP-001', 'Usa --yes para instalar sin preguntar');
      if (!(await ctx.confirm(`Instalar ${names.length} skills en foker/skills/?`)))
        throw new FokerError('FKR-INP-001', 'Instalación cancelada');
    }
    const result = await installSkills(ctx.cwd, names, { dryRun });
    return {
      data: { resolved: names, ...result },
      errors: result.missing.map((name) => ({ code: 'FKR-SKL-001', message: `Skill inexistente: ${name}` })),
      human: `${dryRun ? 'Se instalarían' : 'Instaladas'}: ${result.installed.join(', ') || '—'}\nYa presentes: ${result.existing.join(', ') || '—'}\n`,
      warnings: [],
      exitCode: result.missing.length ? 3 : 0,
    };
  },
};
