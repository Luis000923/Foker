import { contextCommand } from './commands/context.js';
import { doctorCommand } from './commands/doctor.js';
import { initCommand } from './commands/init.js';
import { mapCommand } from './commands/map.js';
import { mcpCommand } from './commands/mcp.js';
import { pendingCommands } from './commands/pending.js';
import { policyCheckCommand } from './commands/policy.js';
import { skillCommands } from './commands/skills.js';
import { syncCommand } from './commands/sync.js';
import { taskCommands, validateCommand } from './commands/tasks.js';
import { trustCommand } from './commands/trust.js';
import { flag } from './types.js';
export const commands = [
  initCommand,
  mapCommand,
  contextCommand,
  mcpCommand,
  ...pendingCommands
    .filter((c) => c.name !== 'validate' && !c.name.startsWith('task') && !c.name.startsWith('skill'))
    .map((c) => (c.name === 'trust' ? trustCommand : c)),
  validateCommand,
  ...taskCommands,
  ...skillCommands,
  syncCommand,
  policyCheckCommand,
  doctorCommand,
];
export const globalFlags = [
  flag('dry-run', 'boolean', 'Previsualiza archivos sin escribir'),
  flag('cwd', 'string', 'Directorio de trabajo'),
  flag('config', 'string', 'Ruta de configuración'),
  ...['json', 'quiet', 'debug', 'no-color', 'ci', 'non-interactive', 'version', 'help'].map((name) =>
    flag(
      name,
      'boolean',
      {
        json: 'Salida JSON',
        quiet: 'Suprime salida humana',
        debug: 'Trazas y tiempos en stderr',
        'no-color': 'Sin color (también NO_COLOR)',
        ci: 'No interactivo, sin color, JSON en errores (también CI=true)',
        'non-interactive': 'Nunca pregunta',
        version: 'Muestra versión',
        help: 'Muestra ayuda',
      }[name] ?? name,
    ),
  ),
  { ...flag('verbose', 'boolean', 'Logs detallados en stderr'), short: 'v' },
];
export const exitCodes = [
  [0, 'Éxito'],
  [1, 'Resultado negativo esperado'],
  [2, 'Argumentos inválidos'],
  [3, 'Configuración inválida'],
  [4, 'Mapa o parseo irrecuperable'],
  [5, 'Violación de política'],
  [6, 'Requiere intervención humana'],
  [7, 'Timeout'],
  [10, 'Error interno'],
] as const;
export function help(name?: string): string {
  const command = commands.find((c) => c.name === name);
  const selected = command ? [command] : commands;
  return `Uso: foker ${name ?? '<comando>'} [flags]\n${selected.map((c) => `${c.name}: ${c.description}\n${c.flags.map((f) => `  --${f.name}: ${f.description}`).join('\n')}`).join('\n')}\nFlags globales:\n${globalFlags.map((f) => `  --${f.name}${f.short ? ` (-${f.short})` : ''}: ${f.description}`).join('\n')}\n`;
}
