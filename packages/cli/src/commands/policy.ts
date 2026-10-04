import { isAbsolute, relative } from 'node:path';
import { FokerError, loadConfig, matchGlobs, normalizePath, TaskStore } from '@foker/engine';
import { type Command, flag } from '../types.js';

/** Comandos de shell que Foker niega siempre (T14). */
const DANGEROUS = [/\bgit\s+push\b/, /\bgit\s+reset\s+--hard\b/, /\bgit\s+clean\b/, /\bgit\s+checkout\s+--\s+\./];
const WRITE_OPS = /(>|\brm\b|\bmv\b|\bcp\b|\btee\b|\bsed\s+-i|\btruncate\b|\bchmod\b|\bln\b)/;

interface Decision {
  allowed: boolean;
  reason?: string;
}

export function evaluatePath(root: string, path: string, protectedPaths: string[]): Decision {
  const rel = isAbsolute(path) ? relative(root, path) : path;
  let id: string;
  try {
    id = normalizePath(root, rel);
  } catch {
    return { allowed: false, reason: `Ruta fuera del proyecto o inválida: ${path}` };
  }
  if (matchGlobs(id, protectedPaths)) {
    return { allowed: false, reason: `${id} es una ruta protegida de Foker; requiere intervención humana.` };
  }
  return { allowed: true };
}

export function evaluateCommand(command: string, protectedPaths: string[]): Decision {
  for (const pattern of DANGEROUS) {
    if (pattern.test(command))
      return { allowed: false, reason: `Comando no permitido por la política de Foker: ${command}` };
  }
  // Escrituras de shell sobre rutas protegidas literales (.foker/, foker.config.yaml…).
  const literals = protectedPaths
    .map((g) => g.replace(/\/?\*\*.*$/, '').replace(/^\*\*\//, ''))
    .filter((l) => l.length > 1);
  if (WRITE_OPS.test(command) && literals.some((l) => command.includes(l))) {
    return { allowed: false, reason: 'El comando modifica una ruta protegida de Foker.' };
  }
  return { allowed: true };
}

interface HookInput {
  hook_event_name?: string;
  tool_name?: string;
  tool_input?: { file_path?: string; command?: string };
  cwd?: string;
  stop_hook_active?: boolean;
}

export const policyCheckCommand: Command = {
  name: 'policy check',
  description: 'Evalúa una acción contra la política (lo usan los hooks generados por sync)',
  maxArgs: 0,
  flags: [
    flag('hook', 'string', 'Formato del anfitrión que llama (claude-code); lee el JSON del hook por stdin'),
    flag('event', 'string', 'Evento del hook (stop)'),
    flag('path', 'string', 'Ruta a evaluar'),
    flag('command', 'string', 'Comando de shell a evaluar'),
  ],
  async run(ctx) {
    const hook = String(ctx.flags['hook'] ?? '');
    if (hook && hook !== 'claude-code') throw new FokerError('FKR-INP-001', `Hook no soportado: ${hook}`);
    let input: HookInput = {};
    if (hook) {
      const text = ctx.stdin ? await ctx.stdin() : '';
      try {
        input = text.trim() ? (JSON.parse(text) as HookInput) : {};
      } catch {
        throw new FokerError('FKR-INP-001', 'Entrada del hook no es JSON');
      }
    }
    const root = ctx.flags['cwd'] ? ctx.cwd : (input.cwd ?? ctx.cwd);
    const { config } = await loadConfig(root);
    const protectedPaths = config.policy.protected_paths ?? [];

    if (hook && (ctx.flags['event'] === 'stop' || input.hook_event_name === 'Stop')) {
      if (input.stop_hook_active) return { data: { allowed: true }, warnings: [], human: '', exitCode: 0 };
      const running = (await new TaskStore(root).list()).filter((t) => t.state === 'RUNNING');
      if (running.length === 0) return { data: { allowed: true }, warnings: [], human: '', exitCode: 0 };
      const reason = `Hay tareas de Foker en RUNNING sin enviar (${running.map((t) => t.task_id).join(', ')}). Llama a foker_task_submit o cancélalas antes de terminar.`;
      return {
        data: { allowed: false, reason },
        warnings: [],
        human: `${JSON.stringify({ decision: 'block', reason })}\n`,
        exitCode: 0,
      };
    }

    const path = hook ? input.tool_input?.file_path : (ctx.flags['path'] as string | undefined) || undefined;
    const command = hook ? input.tool_input?.command : (ctx.flags['command'] as string | undefined) || undefined;
    let decision: Decision = { allowed: true };
    if (path) decision = evaluatePath(root, path, protectedPaths);
    if (decision.allowed && command) decision = evaluateCommand(command, protectedPaths);

    if (hook) {
      const human = decision.allowed
        ? ''
        : `${JSON.stringify({
            hookSpecificOutput: {
              hookEventName: 'PreToolUse',
              permissionDecision: 'deny',
              permissionDecisionReason: decision.reason,
            },
          })}\n`;
      return { data: decision, warnings: [], human, exitCode: 0 };
    }
    return { data: decision, warnings: [], exitCode: decision.allowed ? 0 : 5 };
  },
};
