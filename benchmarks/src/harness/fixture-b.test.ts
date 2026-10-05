import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { type FixtureBTask, image, PROTECTED, setupScript, submission } from './fixture-b.js';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@invalid', '-c', 'commit.gpgsign=false', ...args], {
    cwd,
    encoding: 'utf8',
  });
const task = (manager: string, node = '24.16.0'): FixtureBTask => ({
  id: 'b-x-01',
  repo: 'x',
  base: 'a'.repeat(40),
  commit: 'b'.repeat(40),
  type: 'fix',
  statement: 's',
  environment: { manager, node, image_digest: 'node@sha256:0' },
  hidden_tests: [],
  gold_modified: [],
  commands: { install: 'i', build: 'b', f2p: 'f', p2p: 'p', quality: 'q' },
});

it('la entrega es el diff contra el árbol preparado y marca rutas protegidas y symlinks que escapan', async () => {
  const work = mkdtempSync(join(tmpdir(), 'fixture-b-sub-'));
  dirs.push(work);
  git(work, 'init', '-q');
  mkdirSync(join(work, 'src'));
  writeFileSync(join(work, 'src/a.ts'), 'export const a = 1;\n');
  // Symlink versionado por el upstream: forma parte del árbol preparado, no es una violación.
  symlinkSync('a.ts', join(work, 'src/upstream-link.ts'));
  git(work, 'add', '-A');
  git(work, 'commit', '-qm', 'preparado');
  const prepared = git(work, 'rev-parse', 'HEAD').trim();
  writeFileSync(join(work, 'src/a.ts'), 'export const a = 2;\n');
  writeFileSync(join(work, 'pnpm-lock.yaml'), 'x\n');
  symlinkSync('/etc/passwd', join(work, 'src/escape.ts'));
  symlinkSync('../../outside', join(work, 'src/up.ts'));
  symlinkSync('a.ts', join(work, 'src/inside.ts'));
  const sub = await submission(work, prepared);
  expect(sub.names.sort()).toEqual(['pnpm-lock.yaml', 'src/a.ts', 'src/escape.ts', 'src/inside.ts', 'src/up.ts']);
  expect(sub.violations.sort()).toEqual(['pnpm-lock.yaml', 'symlink:src/escape.ts', 'symlink:src/up.ts']);
  expect(sub.patch).toContain('export const a = 2;');
});

it('rutas protegidas y entorno por gestor', () => {
  for (const p of ['.git/config', '.foker/x', 'foker/rules.md', 'foker.config.yaml', '.mcp.json', 'pnpm-lock.yaml'])
    expect(PROTECTED.some((re) => re.test(p))).toBe(true);
  for (const p of ['src/foker.ts', 'packages/foker/a.ts', 'CLAUDE.md'])
    expect(PROTECTED.some((re) => re.test(p))).toBe(false);
  expect(setupScript(task('pnpm@10.12.1'))).toContain('corepack prepare pnpm@10.12.1 --activate');
  expect(setupScript(task('nub@0.8.3'))).toContain('nub-install.sh 0.8.3');
  expect(image(task('pnpm@10.12.1', '22'))).toBe('foker-bench-b:node-22');
});
