import { lstat, readdir, readFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { FokerError } from '@foker/core';
import { scanSecurity } from '@foker/policy';
import type { Finding } from '@foker/schemas';

const SKIP_DIRS = new Set(['node_modules', '.git', '.next', '.foker', 'dist', 'build', 'coverage', 'target', '.turbo']);
const EXTENSIONS = /\.(?:[cm]?[jt]s|[jt]sx)$/;
const MAX_BYTES = 1024 * 1024;
const MAX_FILES = 20_000;

export interface SecurityReport {
  scanned: number;
  findings: Finding[];
}

/** Recorre `root` (o `subdir`) sin seguir enlaces y aplica las reglas de `@foker/policy`. */
export async function checkSecurity(root: string, subdir = '.'): Promise<SecurityReport> {
  const files: { path: string; content: string }[] = [];
  async function walk(dir: string): Promise<void> {
    for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      if (files.length >= MAX_FILES) return;
      const path = join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) await walk(path);
      } else if (entry.isFile() && EXTENSIONS.test(entry.name) && (await lstat(path)).size <= MAX_BYTES) {
        files.push({
          path: relative(root, path).split(sep).join('/'),
          content: await readFile(path, 'utf8'),
        });
      }
    }
  }
  const start = resolve(root, subdir);
  const inside = relative(root, start);
  if (inside.startsWith('..') || isAbsolute(inside))
    throw new FokerError('FKR-INP-001', 'La ruta debe estar dentro del proyecto');
  await walk(start);
  return { scanned: files.length, findings: scanSecurity(files) };
}
