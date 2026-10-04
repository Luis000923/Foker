import { resolve } from 'node:path';
import { FokerError } from '@foker/engine';
import { runStdio } from '@foker/mcp';
import { type Command, flag } from '../types.js';

export const mcpCommand: Command = {
  name: 'mcp',
  description: 'Arranca MCP stdio',
  maxArgs: 0,
  flags: [flag('root', 'string', 'Raíz')],
  async run(ctx) {
    try {
      await runStdio({
        root: resolve(ctx.cwd, String(ctx.flags['root'] || '.')),
        ...(ctx.trustBaseDir ? { trustBaseDir: ctx.trustBaseDir } : {}),
      });
    } catch (error) {
      const data = (error as { data?: { code?: string } }).data;
      if (data?.code === 'FKR-CFG-002') throw new FokerError('FKR-CFG-002', 'Root inexistente o no es directorio.');
      throw error;
    }
    return { data: null, warnings: [], exitCode: 0, human: '' };
  },
};
