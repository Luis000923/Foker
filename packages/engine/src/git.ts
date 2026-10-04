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
export async function gitDirtyFiles(root: string, includeRenameSource = false): Promise<string[]> {
  const prefixOut = await gitRead(root, ['rev-parse', '--show-prefix']);
  if (prefixOut === null) return [];
  const prefix = prefixOut.trim().replaceAll('\\', '/');
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
      const path = posix.normalize(value.replaceAll('\\', '/'));
      if (path.startsWith(prefix)) files.push(path.slice(prefix.length));
    }
  }
  return [...new Set(files)].sort();
}
