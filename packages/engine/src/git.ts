import { execFile } from 'node:child_process';
import { posix } from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);
export async function gitRead(root: string, args: string[]): Promise<string | null> {
  try {
    return (await exec('git', args, { cwd: root, timeout: 5000, maxBuffer: 16 * 1024 * 1024 })).stdout;
  } catch {
    return null;
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
