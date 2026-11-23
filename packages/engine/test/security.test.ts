import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FokerError } from '@foker/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkSecurity, isInside } from '../src/security.js';

describe('checkSecurity: validación de subdir', () => {
  let base: string;
  let root: string;
  let outside: string;
  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), 'foker-sec-'));
    root = join(base, 'root');
    outside = join(base, 'outside');
    await mkdir(join(root, '..config'), { recursive: true });
    await mkdir(outside, { recursive: true });
    await writeFile(join(root, '..config', 'a.ts'), 'export const a = 1;\n');
    await writeFile(join(outside, 'b.ts'), 'export const b = 1;\n');
  });
  afterEach(async () => {
    await rm(base, { recursive: true, force: true });
  });

  it('acepta un subdirectorio cuyo nombre empieza por ".." dentro de root', async () => {
    const report = await checkSecurity(root, '..config');
    expect(report.scanned).toBe(1);
  });

  it('rechaza con FokerError un subdir symlink que apunta fuera de root', async () => {
    await symlink(outside, join(root, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
    const failure = await checkSecurity(root, 'escape').catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(FokerError);
    expect((failure as FokerError).code).toBe('FKR-INP-001');
  });

  it('rechaza saltos al padre', async () => {
    await expect(checkSecurity(root, '../outside')).rejects.toMatchObject({ code: 'FKR-INP-001' });
  });

  it('isInside distingue ".." de "..config"', () => {
    expect(isInside('/r', '/r/..config')).toBe(true);
    expect(isInside('/r', '/r')).toBe(true);
    expect(isInside('/r', '/other')).toBe(false);
    expect(isInside('/r/a', '/r')).toBe(false);
  });
});
