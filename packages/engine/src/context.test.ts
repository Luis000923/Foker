import { execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
import { stringify } from 'yaml';
import { gatherContextInputs } from './context.js';
import { skillTemplate } from './skills/index.js';

it('lee reglas y skill sin frontmatter y su contexto requerido', async () => {
  const root = mkdtempSync(join(tmpdir(), 'foker-inputs-'));
  try {
    const directory = join(root, 'foker/skills/button');
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(root, 'foker/rules.md'), 'Reglas del proyecto');
    writeFileSync(join(directory, 'SKILL.md'), `${skillTemplate('button').markdown}Cuerpo de la skill`);
    writeFileSync(
      join(directory, 'foker.skill.yaml'),
      stringify({
        ...skillTemplate('button').manifest,
        required_context: { files: ['src/button.ts'], symbols: ['Button'] },
      }),
    );
    expect(await gatherContextInputs(root, { skill: 'button' })).toMatchObject({
      rules: 'Reglas del proyecto',
      skill: {
        name: 'button',
        body: expect.stringContaining('Cuerpo de la skill'),
        requiredFiles: ['src/button.ts'],
        requiredSymbols: ['Button'],
      },
    });
    await expect(gatherContextInputs(root, { skill: 'missing' })).rejects.toMatchObject({ code: 'FKR-SKL-001' });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const exec = promisify(execFile);
const hasGit = await exec('git', ['--version']).then(
  () => true,
  () => false,
);
it.skipIf(!hasGit)('recoge archivos modificados y renombrados con ids POSIX', async () => {
  const root = mkdtempSync(join(tmpdir(), 'foker-inputs-git-'));
  const git = (...args: string[]) => exec('git', args, { cwd: root });
  try {
    await git('init');
    writeFileSync(join(root, 'file with spaces.ts'), 'export const a = 1;');
    await git('add', '.');
    await git('-c', 'user.name=Foker', '-c', 'user.email=foker@example.invalid', 'commit', '-m', 'fixture');
    writeFileSync(join(root, 'file with spaces.ts'), 'export const a = 2;');
    expect((await gatherContextInputs(root)).dirtyFiles).toEqual(['file with spaces.ts']);
    await git('mv', 'file with spaces.ts', 'renamed.ts');
    expect((await gatherContextInputs(root)).dirtyFiles).toEqual(['renamed.ts']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it.runIf(hasGit)('rebasa las rutas de git al root cuando es un subdirectorio del repositorio', async () => {
  const repo = mkdtempSync(join(tmpdir(), 'foker-inputs-subdir-'));
  const git = (...args: string[]) => exec('git', args, { cwd: repo });
  try {
    await git('init');
    mkdirSync(join(repo, 'packages/app/src'), { recursive: true });
    writeFileSync(join(repo, 'packages/app/src/a.ts'), 'export const a = 1;\n');
    writeFileSync(join(repo, 'outside.ts'), 'export const o = 1;\n');
    const inputs = await gatherContextInputs(join(repo, 'packages/app'));
    expect(inputs.dirtyFiles).toEqual(['src/a.ts']);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
