import { FokerError } from '@foker/core';
import { loadConfig, TrustStore } from '@foker/engine';
import { type Command, flag } from '../types.js';
export const trustCommand: Command = {
  name: 'trust',
  description: 'Confía en el workspace',
  flags: [flag('yes', 'boolean', 'Confirma confianza')],
  maxArgs: 0,
  async run(ctx) {
    if (ctx.flags['yes'] && !(ctx.flags['ci'] && ctx.env['CI'] === 'true'))
      throw new FokerError('FKR-INP-001', '--yes exige --ci y CI=true');
    if (!ctx.flags['yes'] && (ctx.nonInteractive || !ctx.confirm))
      throw new FokerError('FKR-POL-010', 'Trust requiere confirmación por TTY');
    const loaded = await loadConfig(ctx.cwd, ctx.flags['config'] ? { configPath: String(ctx.flags['config']) } : {});
    for (const [name, check] of Object.entries(loaded.config.validation.checks))
      ctx.display(`${name}: ${JSON.stringify(check && 'run' in check ? check.run : check)}\n`);
    if (!ctx.flags['yes'] && !(await ctx.confirm?.('¿Confiar en estos comandos? [s/N] ')))
      throw new FokerError('FKR-POL-010', 'Confianza no concedida');
    await new TrustStore(ctx.trustBaseDir).approve(ctx.cwd, loaded.commandsHash);
    return { data: { trusted: true, commands_hash: loaded.commandsHash }, warnings: [], exitCode: 0 };
  },
};
