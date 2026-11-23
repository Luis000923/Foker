import { execFile } from 'node:child_process';
import { posix } from 'node:path';
import { promisify } from 'node:util';
import { FokerError } from '@foker/core';

const exec = promisify(execFile);
/** Salidas con las que Git informa un resultado negativo esperado: 128 = no es repositorio, revisión o ruta inexistente; 1 = sin coincidencias. */
export const EXPECTED_GIT_EXIT_CODES: ReadonlySet<number> = new Set([1, 128]);

/** `true` si el fallo es una respuesta de Git; `false` si es del entorno (binario ausente, timeout, buffer). */
export function isExpectedGitFailure(error: unknown): boolean {
  const { code, killed, signal } = (error ?? {}) as { code?: unknown; killed?: boolean; signal?: unknown };
  return typeof code === 'number' && EXPECTED_GIT_EXIT_CODES.has(code) && !killed && !signal;
}

/** Ejecuta Git de solo lectura. `null` solo para respuestas negativas de Git; los fallos del entorno se propagan. */
export async function gitRead(root: string, args: string[]): Promise<string | null> {
  try {
    return (await exec('git', args, { cwd: root, timeout: 5000, maxBuffer: 16 * 1024 * 1024 })).stdout;
  } catch (error) {
    if (isExpectedGitFailure(error)) return null;
    const { code, killed } = (error ?? {}) as { code?: unknown; killed?: boolean };
    const reason =
      code === 'ENOENT'
        ? 'git no está instalado o el directorio no existe (ENOENT)'
        : killed || code === 'ETIMEDOUT'
          ? 'timeout de 5 s'
          : code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER'
            ? 'salida mayor de 16 MiB'
            : `${String(code ?? 'error')}: ${error instanceof Error ? error.message : String(error)}`;
    throw new FokerError('FKR-MAP-001', `git ${args[0] ?? ''} falló: ${reason}`, { cause: error });
  }
}
/** Exclusiones procedentes exclusivamente de los .gitignore del árbol. */
export interface GitIgnored {
  files: Set<string>;
  directories: Set<string>;
}
const separators = (value: string) => (process.platform === 'win32' ? value.replaceAll('\\', '/') : value);
export async function gitIgnoredPaths(root: string): Promise<GitIgnored | null> {
  const output = await gitRead(root, [
    'ls-files',
    '--others',
    '--ignored',
    '--exclude-per-directory=.gitignore',
    '--directory',
    '-z',
    '--',
    '.',
  ]);
  if (output === null) return null;
  const files = new Set<string>();
  const directories = new Set<string>();
  for (const value of output.split('\0').filter(Boolean)) {
    const path = posix.normalize(separators(value));
    if (path.endsWith('/')) directories.add(path.slice(0, -1));
    else files.add(path);
  }
  return { files, directories };
}

export async function gitDirtyFiles(root: string, includeRenameSource = false): Promise<string[]> {
  const prefixOut = await gitRead(root, ['rev-parse', '--show-prefix']);
  if (prefixOut === null) return [];
  const prefix = separators(prefixOut.trim());
  const entries =
    (await gitRead(root, ['status', '--porcelain', '-z', '--untracked-files=all', '--', '.']))?.split('\0') ?? [];
  const files: string[] = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry) continue;
    const paths = [entry.slice(3)];
    if (/^[RC]|^.[RC]/.test(entry)) {
      const source = entries[++i] ?? '';
      if (includeRenameSource) paths.push(source);
    }
    for (const value of paths) {
      const path = posix.normalize(separators(value));
      if (path.startsWith(prefix)) files.push(path.slice(prefix.length));
    }
  }
  return [...new Set(files)].sort();
}
