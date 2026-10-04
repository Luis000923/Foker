import { execFile, spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access, realpath } from 'node:fs/promises';
import { delimiter, isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { CheckResult } from '@foker/schemas';
import { DEFAULT_POLICY, policyError } from './policy.js';
import { redactSecrets } from './secrets/index.js';

export function redact(
  text: string,
  env: NodeJS.ProcessEnv = process.env,
  allowlist: readonly string[] = DEFAULT_POLICY.env_allowlist,
): string {
  const secrets = Object.entries(env)
    .filter(([key, value]) => !allowlist.includes(key) && redactableEnv(key, value))
    .map(([, value]) => value as string)
    .sort((a, b) => b.length - a.length);
  for (const secret of secrets) text = text.split(secret).join('[REDACTED:env]');
  return redactSecrets(text);
}
/** Variables de entorno de metadatos del shell y de npm/pnpm que no son secretos y aparecen en la salida. */
export const NON_SECRET_ENV = new Set([
  'PWD',
  'OLDPWD',
  'INIT_CWD',
  'SHLVL',
  '_',
  'TERM',
  'TERM_PROGRAM',
  'COLORTERM',
  'SHELL',
  'USER',
  'LOGNAME',
  'HOSTNAME',
  'LANGUAGE',
  'NODE',
  'npm_execpath',
  'npm_node_execpath',
  'npm_lifecycle_event',
  'npm_lifecycle_script',
  'npm_package_name',
  'npm_package_version',
  'npm_package_json',
]);

/**
 * Un valor se redacta salvo que sea de una variable de metadatos conocida o tenga menos de 4 caracteres
 * (redactar `1` destroza la salida y no protege nada). No se exime por la forma del valor: un secreto
 * puede ser numérico o empezar por `/`.
 */
export function redactableEnv(key: string, value: string | undefined): value is string {
  return Boolean(value) && (value as string).length >= 4 && !NON_SECRET_ENV.has(key);
}
const affectedMarker = '$' + '{affected_packages}';

export interface ExecutableCheck {
  name?: string;
  check?: string;
  run: string[];
  timeout_s?: number;
  cwd?: string;
  env_allowlist?: string[];
}
export interface ExecOptions {
  root: string;
  /** Salida completa capturada (hasta 1 MiB), ya redactada. */
  onOutput?: (output: string) => void;
  affectedPackages?: string[];
  env?: NodeJS.ProcessEnv;
  envAllowlist?: string[];
  timeoutMs?: number;
  signal?: AbortSignal;
}
async function windowsExecutable(command: string, cwd: string, env: NodeJS.ProcessEnv): Promise<string | undefined> {
  const extensions = (env['PATHEXT'] ?? '.COM;.EXE;.BAT;.CMD').split(';');
  const dirs = command.includes('/') || command.includes('\\') ? [''] : (env['PATH'] ?? '').split(delimiter);
  for (const dir of dirs)
    for (const ext of ['', ...extensions]) {
      const candidate = resolve(cwd, dir, command + ext);
      try {
        await access(candidate, constants.X_OK);
        return candidate;
      } catch {
        /* next candidate */
      }
    }
  return undefined;
}
/** Construcción pura; los shims de Windows requieren cmd.exe (ADR-022). */
export function buildSpawnCommand(
  executable: string,
  args: readonly string[],
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): { executable: string; args: string[]; windowsVerbatimArguments: boolean } {
  if (platform !== 'win32' || !/\.(cmd|bat)$/i.test(executable))
    return { executable, args: [...args], windowsVerbatimArguments: false };
  // El path puede contener espacios, pero no sintaxis ni expansión de cmd.exe.
  if (
    [...executable].some((char) => char.charCodeAt(0) < 32) ||
    /["%&|<>^!()]/.test(executable) ||
    args.some((arg) => !arg || /[^A-Za-z0-9_@+=:,./\\-]/.test(arg))
  )
    throw policyError('FKR-VAL-004', 'Shim .cmd/.bat rechazado: ejecutable o argumento inseguro para cmd.exe.');
  return {
    executable: env['ComSpec'] || 'cmd.exe',
    args: ['/d', '/s', '/c', `""${executable}"${args.length ? ` ${args.join(' ')}` : ''}"`],
    windowsVerbatimArguments: true,
  };
}
export async function runCheck(
  check: ExecutableCheck,
  options: ExecOptions,
): Promise<CheckResult & { notExecuted?: true; code?: 'FKR-VAL-004' }> {
  const started = performance.now();
  const aborted = (): CheckResult & { notExecuted: true } => ({
    check: check.name ?? check.check ?? check.run[0] ?? '',
    status: 'skipped',
    exit_code: null,
    duration_ms: Math.max(0, Math.round(performance.now() - started)),
    findings: [{ message: 'Check no ejecutado: la señal ya está abortada.' }],
    output_tail: '',
    notExecuted: true,
  });
  if (options.signal?.aborted) return aborted();
  const packages = options.affectedPackages ?? [];
  if (packages.some((p) => !/^[@a-z0-9][\w.\-/@]*$/.test(p)))
    throw policyError('FKR-INP-001', 'Nombre de paquete inválido');
  if (!check.run.length || check.run.some((arg, i) => arg.includes('${') && (i === 0 || arg !== affectedMarker)))
    throw policyError('FKR-INP-001', 'argv inválido');
  const argv = check.run.flatMap((arg) => (arg === affectedMarker ? packages.map((p) => `--filter=${p}`) : [arg]));
  const root = await realpath(options.root);
  if (check.cwd && (isAbsolute(check.cwd) || check.cwd.includes('\\')))
    throw policyError('FKR-POL-001', 'cwd inválido');
  const cwd = await realpath(resolve(root, check.cwd ?? '.'));
  const rel = relative(root, cwd);
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel))
    throw policyError('FKR-POL-001', 'cwd fuera del root');
  const inputEnv = options.env ?? process.env;
  const allowlist = options.envAllowlist ?? check.env_allowlist ?? DEFAULT_POLICY.env_allowlist;
  const env = Object.fromEntries(Object.entries(inputEnv).filter(([key]) => allowlist.includes(key)));
  const result = (status: CheckResult['status'], exit_code: number | null, output = ''): CheckResult => {
    const safeOutput = redact(output, inputEnv, allowlist);
    options.onOutput?.(safeOutput);
    return {
      check: check.name ?? check.check ?? check.run[0] ?? '',
      status,
      exit_code,
      duration_ms: Math.max(0, Math.round(performance.now() - started)),
      findings: [],
      output_tail: safeOutput.split(/\r?\n/).slice(-50).join('\n'),
    };
  };
  let executable = argv.shift();
  if (process.platform === 'win32' && executable) executable = await windowsExecutable(executable, cwd, inputEnv);
  if (options.signal?.aborted) return aborted();
  if (!executable) return { ...result('skipped', null), notExecuted: true, code: 'FKR-VAL-004' };
  let command: ReturnType<typeof buildSpawnCommand>;
  try {
    command = buildSpawnCommand(executable, argv, process.platform, inputEnv);
  } catch (error) {
    return {
      ...result('skipped', null),
      findings: [{ code: 'FKR-VAL-004', message: (error as Error).message }],
      notExecuted: true,
      code: 'FKR-VAL-004',
    };
  }
  if (options.signal?.aborted) return aborted();
  return new Promise((resolveResult) => {
    const child = spawn(command.executable, command.args, {
      windowsVerbatimArguments: command.windowsVerbatimArguments,
      cwd,
      env,
      shell: false,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = Buffer.alloc(0);
    let timedOut = false;
    let settled = false;
    const capture = (chunk: Buffer) => {
      output = Buffer.concat([output, chunk]);
      if (output.length > 1024 * 1024) output = output.subarray(output.length - 1024 * 1024);
    };
    child.stdout.on('data', capture);
    child.stderr.on('data', capture);
    const kill = () => {
      timedOut = true;
      if (!child.pid) return;
      if (process.platform === 'win32')
        execFile(
          join(process.env['SystemRoot'] ?? 'C:\\Windows', 'System32', 'taskkill.exe'),
          ['/pid', String(child.pid), '/T', '/F'],
          () => {},
        );
      else {
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch {
          /* already exited */
        }
      }
    };
    const timer = setTimeout(kill, options.timeoutMs ?? (check.timeout_s ?? 300) * 1000);
    const finish = (value: CheckResult & { notExecuted?: true; code?: 'FKR-VAL-004' }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', kill);
      resolveResult(value);
    };
    options.signal?.addEventListener('abort', kill, { once: true });
    if (options.signal?.aborted) kill();
    child.on('error', () => finish({ ...result('skipped', null), notExecuted: true, code: 'FKR-VAL-004' }));
    child.on('close', (code) =>
      finish(result(timedOut ? 'timeout' : code === 0 ? 'pass' : 'fail', code, output.toString('utf8'))),
    );
  });
}
