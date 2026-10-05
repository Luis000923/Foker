import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { readManifest } from '../validate-manifest.js';
import { type FixtureBTask, image, PROTECTED, runTaskB, setupScript, submission } from './fixture-b.js';

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

it('un renombre conserva la ruta protegida antigua y no intenta leer el symlink borrado', async () => {
  const work = mkdtempSync(join(tmpdir(), 'fixture-b-rename-'));
  dirs.push(work);
  git(work, 'init', '-q');
  writeFileSync(join(work, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n');
  writeFileSync(join(work, 'target.ts'), 'export {};\n');
  symlinkSync('target.ts', join(work, 'old-link.ts'));
  git(work, 'add', '-A');
  git(work, 'commit', '-qm', 'preparado');
  const prepared = git(work, 'rev-parse', 'HEAD').trim();
  renameSync(join(work, 'pnpm-lock.yaml'), join(work, 'renamed.yaml'));
  renameSync(join(work, 'old-link.ts'), join(work, 'new-link.ts'));
  const sub = await submission(work, prepared);
  expect(sub.violations).toEqual(['pnpm-lock.yaml']);
  expect(sub.names.sort()).toEqual(['new-link.ts', 'old-link.ts', 'pnpm-lock.yaml', 'renamed.yaml']);
  expect(sub.patch).toContain('deleted file mode 120000');
  expect(sub.patch).toContain('new file mode 120000');
  expect(sub.patch).not.toContain('rename from');
});

it('la evaluación usa la instantánea del home anterior al anfitrión', async () => {
  const root = mkdtempSync(join(tmpdir(), 'fixture-b-home-'));
  dirs.push(root);
  const repo = join(root, 'full', 'x');
  mkdirSync(repo, { recursive: true });
  const fixture = task('pnpm@10.12.1');
  mkdirSync(join(root, 'private', fixture.id, 'hidden'), { recursive: true });
  git(repo, 'init', '-q');
  writeFileSync(join(repo, 'a.ts'), 'export {};\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-qm', 'base');
  fixture.base = git(repo, 'rev-parse', 'HEAD').trim();
  const manifest = readManifest(join(process.cwd(), 'benchmarks/manifest.yaml'));
  const base = join(root, 'run');
  let agentHome = '';
  await runTaskB({
    task: fixture,
    arm: 'control',
    repetition: 1,
    manifest,
    paths: { root },
    workDir: base,
    simulate: async () => {
      writeFileSync(join(agentHome, 'config'), 'alterado');
      writeFileSync(join(agentHome, 'injected'), 'intruso');
    },
    backend: {
      prepare: async (_work, home) => {
        agentHome = home;
        writeFileSync(join(home, 'config'), 'preparado');
        symlinkSync('config', join(home, 'link'));
      },
      host: async () => {
        throw new Error('No se usa anfitrión en esta prueba');
      },
      evaluate: async (_work, home) => {
        expect(home).toBe(join(base, 'prepared-home'));
        expect(home).not.toBe(agentHome);
        expect(readFileSync(join(home, 'config'), 'utf8')).toBe('preparado');
        expect(readlinkSync(join(home, 'link'))).toBe('config');
        expect(() => readFileSync(join(home, 'injected'))).toThrow();
        return {};
      },
    },
  });
});
