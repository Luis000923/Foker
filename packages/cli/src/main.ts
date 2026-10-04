import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { type ParseArgsConfig, parseArgs } from 'node:util';
import { FokerError } from '@foker/core';
import { errorCode } from '@foker/schemas';
import { commands, globalFlags, help } from './registry.js';
import type { Message, Result } from './types.js';
export interface IO {
  stdout(text: string): void;
  stderr(text: string): void;
  isTTY: boolean;
  confirm?: (message: string) => Promise<boolean>;
  trustBaseDir?: string;
}
const version = (createRequire(import.meta.url)('../package.json') as { version: string }).version;
export async function main(argv: string[], env: NodeJS.ProcessEnv, io: IO): Promise<number> {
  const start = performance.now();
  // Reconocer el primer posicional sin depender de que parseArgs acepte todos los flags.
  const stringFlags = new Set(
    [...globalFlags, ...commands.flatMap((c) => c.flags)]
      .filter((f) => f.type !== 'boolean')
      .flatMap((f) => [`--${f.name}`, ...(f.short ? [`-${f.short}`] : [])]),
  );
  let firstPositional: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    if (arg === '--') {
      firstPositional = argv[i + 1];
      break;
    }
    if (!arg.startsWith('-')) {
      firstPositional = arg;
      break;
    }
    if (stringFlags.has(arg) && argv[i + 1] && !argv[i + 1]?.startsWith('-')) i++;
  }
  const mcpMode = firstPositional === 'mcp';
  let commandName = mcpMode ? 'mcp' : 'foker';
  let json = argv.includes('--json');
  let ci = env['CI'] === 'true' || argv.includes('--ci');
  let debug = argv.includes('--debug');
  let quiet = argv.includes('--quiet');
  let result: Result = { data: null, warnings: [], exitCode: 0 };
  const errors: Message[] = [];
  let human: string | undefined;
  try {
    const options: NonNullable<ParseArgsConfig['options']> = {};
    for (const f of [...globalFlags, ...commands.flatMap((c) => c.flags)]) {
      options[f.name] = {
        type: f.type === 'boolean' ? 'boolean' : 'string',
        ...(f.type === 'string[]' ? { multiple: true } : {}),
        ...(f.short ? { short: f.short } : {}),
      };
    }
    options['help'] = { type: 'boolean', short: 'h' };
    let parsed: ReturnType<typeof parseArgs>;
    try {
      parsed = parseArgs({ args: argv, options, allowPositionals: true, tokens: true });
    } catch (error) {
      throw new FokerError('FKR-INP-001', error instanceof Error ? error.message : String(error));
    }
    json = Boolean(parsed.values['json']);
    ci = env['CI'] === 'true' || Boolean(parsed.values['ci']);
    debug = Boolean(parsed.values['debug']);
    quiet = Boolean(parsed.values['quiet']);
    const command = [...commands]
      .sort((a, b) => b.name.length - a.name.length)
      .find((c) => c.name.split(' ').every((part, i) => parsed.positionals[i] === part));
    commandName = command?.name ?? parsed.positionals[0] ?? 'foker';
    json ||= commandName === 'context' && parsed.values['format'] === 'json';
    const allowed = new Set([...globalFlags, ...(command?.flags ?? [])].map((f) => f.name));
    for (const token of parsed.tokens ?? []) {
      if (token.kind === 'option' && !allowed.has(token.name))
        throw new FokerError('FKR-INP-001', `Flag inválido para ${commandName}: --${token.name}`);
    }
    const args = parsed.positionals.slice(command?.name.split(' ').length ?? 0);
    if (parsed.positionals.length && !command)
      throw new FokerError('FKR-INP-001', `Comando desconocido: ${commandName}`);
    if (command && args.length > command.maxArgs)
      throw new FokerError('FKR-INP-001', `Argumentos inválidos para ${command.name}`);
    if (parsed.values['version']) {
      result.data = { version };
      human = `${version}\n`;
    } else if (parsed.values['help'] || !command) {
      human = help(command?.name);
      result.data = { help: human };
    } else {
      const flags: Record<string, boolean | string | string[]> = {};
      for (const f of [...globalFlags, ...command.flags]) {
        const value = parsed.values[f.name] ?? f.default;
        flags[f.name] = Array.isArray(value) ? value.map(String) : value;
      }
      result = await command.run({
        env,
        ...(io.confirm ? { confirm: io.confirm } : {}),
        ...(io.trustBaseDir ? { trustBaseDir: io.trustBaseDir } : {}),
        display: io.stderr,
        cwd: resolve(String(flags['cwd'] || process.cwd())),
        flags,
        args,
        nonInteractive: ci || Boolean(flags['non-interactive']) || !io.isTTY,
        color: !ci && !flags['no-color'] && env['NO_COLOR'] === undefined && io.isTTY,
        log: (message) => {
          if (!quiet && (debug || flags['verbose'])) io.stderr(`${message}\n`);
        },
      });
    }
  } catch (error) {
    const failure =
      error instanceof FokerError
        ? error
        : error instanceof Error && 'code' in error && typeof error.code === 'string' && error.code.startsWith('FKR-')
          ? new FokerError(error.code as ConstructorParameters<typeof FokerError>[0], error.message)
          : new FokerError('FKR-INT-001', error instanceof Error ? error.message : String(error));
    result.exitCode = errorCode(failure.code)?.exit ?? 10;
    errors.push({ code: failure.code, message: failure.message });
    if (debug && !mcpMode) io.stderr(`${failure.stack ?? failure.message}\n`);
  }
  const duration = Math.max(0, Math.round(performance.now() - start));
  if (mcpMode && (errors.length || (!argv.includes('--help') && !argv.includes('-h') && !argv.includes('--version')))) {
    for (const error of errors)
      io.stderr(
        `${JSON.stringify({ ts: new Date().toISOString(), level: 'error', event: 'startup', code: error.code, message: error.message })}\n`,
      );
    return result.exitCode;
  }
  if (json || result.json || (ci && errors.length > 0))
    io.stdout(
      `${JSON.stringify({ schema: 'foker.cli/v1', command: commandName, ok: result.exitCode === 0, exit_code: result.exitCode, data: result.data, warnings: result.warnings, errors, duration_ms: duration })}\n`,
    );
  else {
    for (const error of errors) io.stderr(`${error.code}: ${error.message}\n`);
    if (!quiet) {
      for (const warning of result.warnings) io.stderr(`${warning.code}: ${warning.message}\n`);
      if (!errors.length) {
        const data = result.data as { files?: number; symbols?: number; plannedFiles?: string[] } | null;
        const summary = data?.plannedFiles
          ? `Crearía: ${data.plannedFiles.join(', ')}`
          : commandName === 'map'
            ? `${data?.files} archivos, ${data?.symbols} símbolos; ${result.exitCode === 1 ? 'desactualizado' : 'correcto'}`
            : 'correcto';
        io.stdout(result.human ?? human ?? `${commandName}: ${summary}\n`);
      }
    }
  }
  if (debug) io.stderr(`Duración: ${duration} ms\n`);
  return result.exitCode;
}
