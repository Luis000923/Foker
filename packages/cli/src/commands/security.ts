import type { Command } from '../types.js';
import { validateCommand } from './tasks.js';

export const checkSecurityCommand: Command = {
  name: 'check-security',
  description: 'Alias de validate --profile security (controles estáticos automatizables; no certifica ASVS)',
  maxArgs: 0,
  flags: [],
  async run(ctx) {
    return validateCommand.run({ ...ctx, flags: { ...ctx.flags, profile: 'security' } });
  },
};
