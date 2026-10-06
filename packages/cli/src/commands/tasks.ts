import { userInfo } from 'node:os';
import { FokerError } from '@foker/core';
import {
  assertUnprotectedScope,
  loadConfig,
  openEngine,
  submitTask,
  TaskStore,
  validateProfile,
  verifyTask,
} from '@foker/engine';
import type { ProjectMap } from '@foker/schemas';
import { type Command, type Context, flag } from '../types.js';

const list = (value: boolean | string | string[] | undefined) =>
  String(value ?? '')
    .split(',')
    .filter(Boolean);
const exit = (state: string) =>
  ['REJECTED', 'FAILED', 'fail'].includes(state)
    ? 1
    : ['AWAITING_APPROVAL', 'BLOCKED', 'blocked'].includes(state)
      ? 6
      : 0;
const options = (ctx: Context) => ({
  ...(ctx.trustBaseDir ? { trustBaseDir: ctx.trustBaseDir } : {}),
  ...(ctx.flags['config'] ? { configPath: String(ctx.flags['config']) } : {}),
});
export const validateCommand: Command = {
  name: 'validate',
  description: 'Ejecuta checks',
  maxArgs: 0,
  flags: [
    flag('profile', 'string', 'Perfil (default)'),
    flag('checks', 'string', 'Lista de checks'),
    flag('packages', 'string', 'Lista de paquetes'),
    flag('changed', 'boolean', 'Solo cambios'),
  ],
  async run(ctx) {
    const data = await validateProfile(ctx.cwd, {
      ...options(ctx),
      profile: String(ctx.flags['profile'] || 'default'),
      ...(ctx.flags['checks'] ? { checks: list(ctx.flags['checks']) } : {}),
      ...(ctx.flags['packages'] ? { packages: list(ctx.flags['packages']) } : {}),
      changed: Boolean(ctx.flags['changed']),
    });
    return { data, warnings: [], exitCode: exit(data.status), human: `validate: ${data.status}\n` };
  },
};
const flags = [
  flag('scope', 'string[]', 'Ámbito (repetible)'),
  flag('profile', 'string', 'Perfil'),
  flag('skill', 'string', 'Skill'),
  flag('reason', 'string', 'Razón'),
  flag('summary', 'string', 'Resumen del intento'),
  flag('yes', 'boolean', 'Confirma en CI explícito'),
];
export const taskCommands: Command[] = [
  'begin',
  'submit',
  'status',
  'list',
  'approve',
  'reject',
  'unblock',
  'cancel',
  'verify',
].map((action) => ({
  name: `task ${action}`,
  description: `Tareas: ${action}`,
  flags,
  maxArgs: action === 'list' ? 0 : 1,
  async run(ctx) {
    const store = new TaskStore(ctx.cwd, { actor: `cli:${userInfo().username}` });
    const id = ctx.args[0];
    if (!id && !['list', 'status'].includes(action)) throw new FokerError('FKR-INP-001', 'Falta descripción o task_id');
    let data: unknown;
    let code = 0;
    const scope = ctx.flags['scope'] as [string, ...string[]];
    if (['approve', 'reject', 'unblock'].includes(action)) {
      const explicitCI = ctx.flags['ci'] && ctx.env['CI'] === 'true';
      if (!explicitCI && (ctx.nonInteractive || !ctx.confirm))
        return { data: null, warnings: [], exitCode: 6, human: 'Acción humana requiere TTY y confirmación\n' };
      if (!explicitCI && !(await ctx.confirm?.(`¿Confirmar ${action} ${id}? [s/N] `)))
        return { data: null, warnings: [], exitCode: 6 };
      const actor = `cli:${userInfo().username}`;
      const reason = ctx.flags['reason'] ? String(ctx.flags['reason']) : undefined;
      data =
        action === 'approve'
          ? await store.approve(id as string, actor, reason)
          : action === 'reject'
            ? await store.reject(id as string, actor, reason)
            : await store.unblock(id as string, actor, reason, scope.length ? { paths: scope } : undefined);
      code = action === 'reject' ? 1 : exit((data as { state: string }).state);
    } else if (action === 'begin') {
      const loaded = await loadConfig(ctx.cwd, ctx.flags['config'] ? { configPath: String(ctx.flags['config']) } : {});
      const engine = await openEngine(ctx.cwd, { ...loaded.mapConfig, readOnly: true });
      await engine.refresh();
      const project = JSON.parse(await engine.exportMapJson()) as ProjectMap;
      assertUnprotectedScope(scope, loaded.policy.protected_paths, Object.keys(project.files));
      data = await new TaskStore(ctx.cwd, {
        actor: `cli:${userInfo().username}`,
        maxActive: loaded.policy.tasks.max_active ?? 5,
        ...options(ctx),
      }).begin({
        description: id as string,
        scope: { paths: scope },
        profile: String(ctx.flags['profile'] || 'default'),
        ...(ctx.flags['skill'] ? { skill: String(ctx.flags['skill']) } : {}),
        max_attempts: loaded.policy.tasks.max_attempts_default ?? 3,
      });
    } else if (action === 'submit') {
      data = await submitTask(ctx.cwd, id as string, {
        ...options(ctx),
        ...(ctx.flags['summary'] ? { summary: String(ctx.flags['summary']) } : {}),
      });
      code = exit((data as { state: string }).state);
    } else if (action === 'verify') {
      const verified = await verifyTask(ctx.cwd, id as string, options(ctx));
      data = verified;
      code = verified.matches ? exit(verified.evidence.result) : 1;
    } else if (action === 'cancel') data = await store.cancel(id as string);
    else {
      data = id ? await store.get(id) : await store.list();
      if (id) code = exit((data as { state: string }).state);
    }
    return { data, warnings: [], exitCode: code, human: `${JSON.stringify(data, null, 2)}\n` };
  },
}));
