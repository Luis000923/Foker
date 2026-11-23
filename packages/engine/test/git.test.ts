import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FokerError } from '@foker/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { drainGitWarnings, GIT_UNAVAILABLE_WARNING, gitDirtyFiles, gitRead, isExpectedGitFailure } from '../src/git.js';

const hasGit = (() => {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

describe('gitRead', () => {
  let dir: string;
  let path: string | undefined;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'foker-git-'));
    path = process.env['PATH'];
    drainGitWarnings();
  });
  afterEach(async () => {
    process.env['PATH'] = path;
    drainGitWarnings();
    await rm(dir, { recursive: true, force: true });
  });

  describe('ENOENT: git no disponible (modo degradado explícito)', () => {
    it('devuelve null y deja un aviso visible, sin lanzar', async () => {
      process.env['PATH'] = join(dir, 'sin-binarios');
      expect(await gitRead(dir, ['rev-parse', 'HEAD'])).toBeNull();
      expect(drainGitWarnings()).toEqual([GIT_UNAVAILABLE_WARNING]);
      expect(GIT_UNAVAILABLE_WARNING).toContain('instantáneas de hashes');
    });

    it('los avisos se deduplican y drainGitWarnings los vacía', async () => {
      process.env['PATH'] = join(dir, 'sin-binarios');
      await gitRead(dir, ['status']);
      await gitRead(dir, ['rev-parse', 'HEAD']);
      expect(drainGitWarnings()).toHaveLength(1);
      expect(drainGitWarnings()).toEqual([]);
    });

    it('los derivados degradan en silencio funcional: sin cambios locales, sin romper', async () => {
      process.env['PATH'] = join(dir, 'sin-binarios');
      expect(await gitDirtyFiles(dir)).toEqual([]);
      expect(drainGitWarnings()).toEqual([GIT_UNAVAILABLE_WARNING]);
    });

    it('un directorio de trabajo inexistente NO es «git no disponible»: se propaga', async () => {
      const failure = await gitRead(join(dir, 'no-existe'), ['status']).catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(FokerError);
      expect((failure as FokerError).code).toBe('FKR-MAP-001');
      expect((failure as FokerError).message).toContain('ENOENT');
      expect(drainGitWarnings()).toEqual([]);
    });
  });

  describe.skipIf(!hasGit)('con git instalado', () => {
    it('devuelve null fuera de un repositorio (exit 128) sin avisos', async () => {
      const outside = await mkdtemp(join(tmpdir(), 'foker-nogit-'));
      try {
        process.env['GIT_CEILING_DIRECTORIES'] = tmpdir();
        expect(await gitRead(outside, ['rev-parse', 'HEAD'])).toBeNull();
        expect(drainGitWarnings()).toEqual([]);
      } finally {
        delete process.env['GIT_CEILING_DIRECTORIES'];
        await rm(outside, { recursive: true, force: true });
      }
    });

    it('maxBuffer se propaga como FKR-MAP-001 y no se confunde con un timeout', async () => {
      const failure = await gitRead(dir, ['--version'], { timeoutMs: 5000, maxBufferBytes: 1 }).catch(
        (error: unknown) => error,
      );
      expect(failure).toBeInstanceOf(FokerError);
      expect((failure as FokerError).code).toBe('FKR-MAP-001');
      expect((failure as FokerError).message).toContain('salida mayor de 1 bytes');
      expect((failure as FokerError).message).not.toContain('timeout');
      expect(drainGitWarnings()).toEqual([]);
    });

    it('timeout se propaga como FKR-MAP-001', async () => {
      const repo = await mkdtemp(join(tmpdir(), 'foker-git-repo-'));
      try {
        execFileSync('git', ['init', '-q'], { cwd: repo });
        // `cat-file --batch` espera por stdin, que execFile deja abierto: bloquea hasta el timeout.
        const failure = await gitRead(repo, ['cat-file', '--batch'], { timeoutMs: 300, maxBufferBytes: 1024 }).catch(
          (error: unknown) => error,
        );
        expect(failure).toBeInstanceOf(FokerError);
        expect((failure as FokerError).code).toBe('FKR-MAP-001');
        expect((failure as FokerError).message).toContain('timeout de 300 ms');
        expect(drainGitWarnings()).toEqual([]);
      } finally {
        await rm(repo, { recursive: true, force: true });
      }
    });
  });

  it('clasifica fallos esperados y de entorno', () => {
    expect(isExpectedGitFailure({ code: 128 })).toBe(true);
    expect(isExpectedGitFailure({ code: 1 })).toBe(true);
    expect(isExpectedGitFailure({ code: 129 })).toBe(false);
    expect(isExpectedGitFailure({ code: 'ENOENT' })).toBe(false);
    expect(isExpectedGitFailure({ code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' })).toBe(false);
    expect(isExpectedGitFailure({ code: null, killed: true, signal: 'SIGTERM' })).toBe(false);
    expect(isExpectedGitFailure({ code: 'ETIMEDOUT' })).toBe(false);
  });
});
