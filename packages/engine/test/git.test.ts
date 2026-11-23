import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FokerError } from '@foker/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { gitRead, isExpectedGitFailure } from '../src/git.js';

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
  });
  afterEach(async () => {
    process.env['PATH'] = path;
    await rm(dir, { recursive: true, force: true });
  });

  it('no silencia ENOENT (git ausente) como null', async () => {
    process.env['PATH'] = join(dir, 'sin-binarios');
    const failure = await gitRead(dir, ['rev-parse', 'HEAD']).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(FokerError);
    expect((failure as FokerError).code).toBe('FKR-MAP-001');
    expect((failure as FokerError).message).toContain('ENOENT');
  });

  it('no silencia un directorio de trabajo inexistente', async () => {
    await expect(gitRead(join(dir, 'no-existe'), ['status'])).rejects.toBeInstanceOf(FokerError);
  });

  it.skipIf(!hasGit)('devuelve null fuera de un repositorio (exit 128)', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'foker-nogit-'));
    try {
      process.env['GIT_CEILING_DIRECTORIES'] = tmpdir();
      expect(await gitRead(outside, ['rev-parse', 'HEAD'])).toBeNull();
    } finally {
      delete process.env['GIT_CEILING_DIRECTORIES'];
      await rm(outside, { recursive: true, force: true });
    }
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
