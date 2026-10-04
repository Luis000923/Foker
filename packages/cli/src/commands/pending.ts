import { FokerError } from '@foker/core';
import { type Command, type Flag, flag } from '../types.js';

function pending(name: string, description: string, issue: string, flags: Flag[], maxArgs = 0): Command {
  return {
    name,
    description,
    flags,
    maxArgs,
    async run() {
      throw new FokerError('FKR-INP-001', `${name}: no implementado todavía (${issue}).`);
    },
  };
}
const b = (name: string, description: string) => flag(name, 'boolean', description);
const s = (name: string, description: string) => flag(name, 'string', description);
const taskFlags = [s('scope', 'Ámbito'), s('profile', 'Perfil'), s('skill', 'Skill'), s('reason', 'Razón')];
export const pendingCommands: Command[] = [
  pending(
    'init',
    'Inicializa Foker',
    'FKR-067',
    [
      s('template', 'Plantilla'),
      s('from-spec', 'Especificación'),
      s('targets', 'Anfitriones'),
      b('dry-run', 'Previsualiza archivos'),
      b('force', 'Fuerza inicialización'),
    ],
    1,
  ),
  pending('mcp', 'Arranca MCP stdio', 'FKR-050', [s('root', 'Raíz')]),
  pending('validate', 'Ejecuta checks', 'FKR-048', [
    s('profile', 'Perfil'),
    s('checks', 'Checks'),
    s('packages', 'Paquetes'),
    b('changed', 'Solo cambios'),
  ]),
  pending('task', 'Gestiona tareas', 'FKR-048', taskFlags),
  ...['begin', 'submit', 'status', 'list', 'approve', 'reject', 'unblock', 'cancel', 'verify'].map((n) =>
    pending(`task ${n}`, `Tareas: ${n}`, 'FKR-048', taskFlags, n === 'list' ? 0 : 1),
  ),
  pending('skill', 'Gestiona skills', 'FKR-061', [b('strict', 'Validación estricta')]),
  ...['list', 'show', 'validate', 'new'].map((n) =>
    pending(
      `skill ${n}`,
      `Skills: ${n}`,
      'FKR-061',
      [b('strict', 'Validación estricta'), ...(n === 'new' ? [b('dry-run', 'Previsualiza archivos')] : [])],
      n === 'list' ? 0 : 1,
    ),
  ),
  pending('sync', 'Genera integraciones', 'FKR-066', [
    s('target', 'Anfitriones'),
    b('check', 'Comprueba diferencias'),
    b('dry-run', 'Previsualiza archivos'),
  ]),
  pending('doctor', 'Diagnostica el entorno', 'FKR-069', [b('fix', 'Aplica correcciones seguras')]),
  pending('trust', 'Confía en el workspace', 'FKR-041', [b('yes', 'Confirma confianza')]),
  pending('policy check', 'Evalúa una acción contra la política', 'FKR-040', [
    s('hook', 'Anfitrión del hook'),
    s('path', 'Ruta'),
    s('command', 'Comando'),
  ]),
];
