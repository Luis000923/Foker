import { FokerError, listSkills, loadSkill, newSkill, validateSkill, validSkillName } from '@foker/engine';
import { type Command, flag } from '../types.js';
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
