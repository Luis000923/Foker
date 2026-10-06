import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rename, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { hashCanonicalJson } from '@foker/core';
import { afterEach, expect, it } from 'vitest';
import { treeSnapshot } from './baseline.js';
import { TaskStore } from './index.js';

const exec = promisify(execFile);
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function fixture(ignore = 'dist/\n') {
  const root = await mkdtemp(join(tmpdir(), 'foker-review-098-'));
  roots.push(root);
  await exec('git', ['init', '-q'], { cwd: root });
  await writeFile(join(root, '.gitignore'), ignore);
  await mkdir(join(root, 'dist/nested'), { recursive: true });
  await writeFile(join(root, 'dist/x.js'), 'old');
  return { root, store: new TaskStore(root) };
}
const input = { description: 'Revisión ADR-037', scope: { paths: ['src/**'] as [string] } };
it('fila 1: secreto anidado en directorio colapsado permanece visible', async () => {
  const { root, store } = await fixture();
  await writeFile(join(root, 'dist/nested/.env'), 'old');
  const task = await store.begin(input);
  await writeFile(join(root, 'dist/nested/.env'), 'new');
  expect(await store.diffSinceBaseline(task)).toEqual([{ path: 'dist/nested/.env', change: 'modified' }]);
});
it('fila 2: info/exclude y excludesFile no ocultan cambios; .gitignore que se ignora sigue visible', async () => {
  const { root, store } = await fixture();
  const task = await store.begin(input);
  await writeFile(join(root, '.git/info/exclude'), 'fuera.txt\n');
  await writeFile(join(root, '.git/global-ignore'), 'global.txt\n');
  await exec('git', ['config', 'core.excludesFile', join(root, '.git/global-ignore')], { cwd: root });
  await writeFile(join(root, 'fuera.txt'), 'x');
  await writeFile(join(root, 'global.txt'), 'x');
  await mkdir(join(root, 'new'), { recursive: true });
  await writeFile(join(root, 'new/.gitignore'), '.gitignore\nsecret.txt\n');
  await writeFile(join(root, 'new/secret.txt'), 'x');
  await writeFile(join(root, 'dist/nested/.gitignore'), '.gitignore\n');
  expect(await store.diffSinceBaseline(task)).toEqual([
    { path: 'dist/nested/.gitignore', change: 'added' },
    { path: 'fuera.txt', change: 'added' },
    { path: 'global.txt', change: 'added' },
    { path: 'new/.gitignore', change: 'added' },
  ]);
});
it('fila 3: alternativas y ./ conservan la semántica de matchGlobs', async () => {
  const { root, store } = await fixture('private/\ndist/\n');
  await mkdir(join(root, 'private'), { recursive: true });
  await writeFile(
    join(root, 'foker.config.yaml'),
    'version: 1\npolicy:\n  protected_paths: ["private/*.{json,yaml}", "./confidential"]\n',
  );
  await writeFile(join(root, 'private/a.yaml'), 'old');
  const task = await store.begin(input);
  await writeFile(join(root, 'private/a.yaml'), 'new');
  await writeFile(join(root, 'dist/nested/confidential'), 'new');
  expect(await store.diffSinceBaseline(task)).toEqual([
    { path: 'dist/nested/confidential', change: 'added' },
    { path: 'private/a.yaml', change: 'modified' },
  ]);
});
it('fila 4: configuración alternativa llega a begin y al diff de submit', async () => {
  const { root } = await fixture('private/\ndist/\n');
  await mkdir(join(root, 'private'), { recursive: true });
  await writeFile(
    join(root, 'custom.yaml'),
    'version: 1\npolicy:\n  protected_paths: ["private/**"]\n  secret_globs: ["dist/**/*.token"]\n',
  );
  const store = new TaskStore(root, { configPath: 'custom.yaml' });
  await writeFile(join(root, 'private/a.txt'), 'old');
  const task = await store.begin(input);
  await writeFile(join(root, 'private/a.txt'), 'new');
  await writeFile(join(root, 'dist/nested/a.token'), 'new');
  expect(await store.diffSinceBaseline(task)).toEqual([
    { path: 'dist/nested/a.token', change: 'added' },
    { path: 'private/a.txt', change: 'modified' },
  ]);
});
it('fila 5: fallo solo en submit reutiliza exclusiones; fallo solo en begin conserva none', async () => {
  const { root, store } = await fixture();
  const gitTask = await store.begin(input);
  await rename(join(root, '.git'), join(root, '.git-disabled'));
  // El git desactivado queda fuera del árbol para no introducir cambios de la propia prueba.
  const backup = await mkdtemp(join(tmpdir(), 'foker-git-backup-'));
  roots.push(backup);
  await rename(join(root, '.git-disabled'), join(backup, 'git'));
  expect(await store.diffSinceBaseline(gitTask)).toEqual([]);
  const noneTask = await store.begin(input);
  await rename(join(backup, 'git'), join(root, '.git'));
  expect(await store.diffSinceBaseline(noneTask)).toEqual([]);
});
it.skipIf(process.platform === 'win32')(
  'fila 6: nombres POSIX con barra invertida no excluyen archivos versionados',
  async () => {
    const { root, store } = await fixture('protected\\file.txt\n');
    await mkdir(join(root, 'protected'));
    await writeFile(join(root, 'protected/file.txt'), 'old');
    await writeFile(join(root, 'protected\\file.txt'), 'ignored');
    await exec('git', ['add', '-f', 'protected/file.txt'], { cwd: root });
    // Gitignore necesita escapar la barra invertida literal.
    await writeFile(join(root, '.gitignore'), 'protected\\\\file.txt\n');
    const task = await store.begin(input);
    await writeFile(join(root, 'protected/file.txt'), 'new');
    expect(await store.diffSinceBaseline(task)).toEqual([{ path: 'protected/file.txt', change: 'modified' }]);
  },
);
it('fila 7: enlaces nuevos y cambio de destino protegido cuentan sin seguirlos', async () => {
  const { root, store } = await fixture('.env\n');
  await symlink('/destino-inexistente', join(root, '.env'));
  const task = await store.begin(input);
  await unlink(join(root, '.env'));
  await symlink('/otro-destino-inexistente', join(root, '.env'));
  await symlink(root, join(root, 'loop'));
  expect(await store.diffSinceBaseline(task)).toEqual([
    { path: '.env', change: 'modified' },
    { path: 'loop', change: 'added' },
  ]);
});
it('baseline antiguo sin modo se autentica y conserva none', async () => {
  const { root, store } = await fixture();
  const task = await store.begin(input);
  const path = join(root, `.foker/tasks/${task.task_id}.baseline.json`);
  const { snapshot } = JSON.parse(await readFile(path, 'utf8'));
  const legacy = { snapshot, tree: await treeSnapshot(root, null) };
  await writeFile(path, JSON.stringify(legacy));
  task.baseline.snapshot_hash = hashCanonicalJson(JSON.stringify(legacy));
  expect(await store.diffSinceBaseline(task)).toEqual([]);
});

it('modo y exclusiones guardados están autenticados', async () => {
  const { root, store } = await fixture();
  const task = await store.begin(input);
  const path = join(root, `.foker/tasks/${task.task_id}.baseline.json`);
  const baseline = JSON.parse(await readFile(path, 'utf8'));
  baseline.exclusions.files.push('fuera.txt');
  await writeFile(path, JSON.stringify(baseline));
  await expect(store.diffSinceBaseline(task)).rejects.toMatchObject({ name: 'BaselineTamperedError' });
});

it('fila 7: sustituir archivo por enlace con los mismos bytes del destino cambia el árbol', async () => {
  const { root, store } = await fixture('.env\n');
  await writeFile(join(root, '.env'), '/destino-inexistente');
  const task = await store.begin(input);
  await unlink(join(root, '.env'));
  await symlink('/destino-inexistente', join(root, '.env'));
  expect(await store.diffSinceBaseline(task)).toEqual([{ path: '.env', change: 'modified' }]);
});
