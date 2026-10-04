import { type ContextRequest, FokerError, openEngine } from '@foker/core';
import { gatherContextInputs, loadConfig } from '@foker/engine';
import { type Command, flag } from '../types.js';

export const contextCommand: Command = {
  name: 'context',
  description: 'Construye un Context Pack',
  maxArgs: 1,
  flags: [
    flag('anchor', 'string[]', 'Ruta o símbolo (repetible)'),
    ...['intent', 'budget', 'skill', 'task', 'format'].map((name) => flag(name, 'string', name)),
    flag('explain', 'boolean', 'Explica selección'),
  ],
  async run(ctx) {
    if (ctx.flags['task']) throw new FokerError('FKR-INP-001', '--task requiere FKR-045.');
    const task = ctx.args[0];
    if (!task) throw new FokerError('FKR-INP-001', 'Indica una tarea.');
    const format = ctx.flags['format'] || 'md';
    if (format !== 'md' && format !== 'json') throw new FokerError('FKR-INP-001', '--format debe ser md o json.');
    const budget = ctx.flags['budget'] ? Number(ctx.flags['budget']) : undefined;
    if (budget !== undefined && (!Number.isInteger(budget) || budget < 1000 || budget > 200000))
      throw new FokerError('FKR-INP-001', '--budget debe ser un entero entre 1000 y 200000.');
    const intent = ctx.flags['intent'] ? String(ctx.flags['intent']) : undefined;
    if (intent && !['fix', 'add', 'modify', 'refactor', 'test', 'explain'].includes(intent))
      throw new FokerError('FKR-INP-001', '--intent inválido.');
    const anchors = ctx.flags['anchor'] as string[];
    const inputs = await gatherContextInputs(ctx.cwd, {
      ...(ctx.flags['skill'] ? { skill: String(ctx.flags['skill']) } : {}),
      ...(ctx.flags['config'] ? { configPath: String(ctx.flags['config']) } : {}),
    });
    const loaded = await loadConfig(ctx.cwd, ctx.flags['config'] ? { configPath: String(ctx.flags['config']) } : {});
    const engine = await openEngine(ctx.cwd, { ...loaded.mapConfig, readOnly: true });
    const pack = await engine.buildContext({
      task,
      ...inputs,
      anchors: {
        files: anchors.filter((a) => !a.includes('#') && (a.includes('/') || /\.[\w]+$/.test(a))),
        symbols: anchors.filter((a) => a.includes('#') || (!a.includes('/') && !/\.[\w]+$/.test(a))),
      },
      coreFiles: loaded.config.context.core_files,
      budgetTokens: budget ?? loaded.config.context.default_budget_tokens,
      ...(intent ? { intent: intent as NonNullable<ContextRequest['intent']> } : {}),
      explain: Boolean(ctx.flags['explain']),
    });
    return {
      data: JSON.parse(pack.json),
      human: pack.rendered,
      json: format === 'json',
      warnings: pack.diagnostics.map(({ code, message }) => ({ code, message })),
      exitCode: 0,
    };
  },
};
