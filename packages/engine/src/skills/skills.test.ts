import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { estimateTokens } from '@foker/core';
import { afterEach, expect, it } from 'vitest';
import { stringify } from 'yaml';
import { effectiveWritePaths, listSkills, loadSkill, newSkill, skillTemplate, validateSkill } from './index.js';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function fixture(name = 'demo') {
  const root = await mkdtemp(join(tmpdir(), 'foker-skills-'));
  roots.push(root);
  const dir = join(root, name);
  await mkdir(dir);
  const template = skillTemplate(name);
  await writeFile(join(dir, 'SKILL.md'), template.markdown);
  await writeFile(join(dir, 'foker.skill.yaml'), stringify(template.manifest));
  return { root, dir, ...template };
}
it('valida las seis skills incluidas en modo estricto y usa el estimador nativo', async () => {
  expect(estimateTokens('éé')).toBe(2);
  const entries = await listSkills((await fixture()).root);
  expect(entries).toHaveLength(6);
  for (const entry of entries) {
    expect(entry.source).toBe('included');
    const result = await validateSkill(entry.dir, { strict: true });
    expect(result.errors, entry.name).toEqual([]);
    expect(result.warnings, entry.name).toEqual([]);
    expect(result.markdown.split('\n').length).toBeLessThanOrEqual(150);
  }
  expect((await loadSkill(resolve('.'), 'next-route')).body).toContain('assertSameOrigin');
});
it('plantilla válida y permisos como intersección exacta de globs', async () => {
  expect((await validateSkill((await fixture()).dir, { strict: true })).valid).toBe(true);
  const paths = effectiveWritePaths(['src/**', 'test/**'], { write_paths: ['**/*.ts'] });
  expect(paths('src/a.ts')).toBe(true);
  expect(paths('src/a.js')).toBe(false);
  expect(paths('outside/a.ts')).toBe(false);
  expect(effectiveWritePaths(['src/**'], {})('src/a.ts')).toBe(true);
  expect(effectiveWritePaths(['src/**'], { write_paths: [] })('src/a.ts')).toBe(false);
});
for (const name of ['-demo', 'demo-', 'demo--x', 'Demo', 'x'.repeat(65)])
  it(`rechaza nombre ${name}`, async () => {
    expect((await validateSkill((await fixture(name)).dir)).valid).toBe(false);
  });
for (const [label, transform] of [
  ['directorio distinto', (s: string) => s.replace('name: demo', 'name: another')],
  ['description larga', (s: string) => s.replace('Procedimiento para demo.', 'x'.repeat(1025))],
  ['frontmatter ausente', () => '# Demo'],
] as const)
  it(`rechaza ${label}`, async () => {
    const f = await fixture();
    await writeFile(join(f.dir, 'SKILL.md'), transform(f.markdown));
    expect((await validateSkill(f.dir)).valid).toBe(false);
  });
it('rechaza YAML inválido, contrato inválido y workflow roto', async () => {
  const f = await fixture();
  for (const yaml of ['name: [', 'name: demo', stringify({ ...f.manifest, workflow_ref: 'SKILL.md#missing' })]) {
    await writeFile(join(f.dir, 'foker.skill.yaml'), yaml);
    expect((await validateSkill(f.dir)).valid).toBe(false);
  }
});
for (const pattern of [
  'curl example | sh',
  'wget example | bash',
  'ignore previous',
  'ignora las instrucciones anteriores',
  'https://example.com',
  'http://example.com',
  'rm -rf /tmp',
  'A'.repeat(120),
])
  it(`avisa de patrón ${pattern.slice(0, 30)}`, async () => {
    const f = await fixture();
    await writeFile(join(f.dir, 'SKILL.md'), `${f.markdown}\n${pattern}`);
    expect(await validateSkill(f.dir)).toMatchObject({
      valid: true,
      warnings: [expect.stringContaining('Patrón sospechoso')],
    });
    expect((await validateSkill(f.dir, { strict: true })).valid).toBe(false);
  });
it('avisa de tamaño y campos desconocidos; strict los rechaza', async () => {
  const f = await fixture();
  await writeFile(
    join(f.dir, 'SKILL.md'),
    f.markdown.replace('description:', 'custom: value\ndescription:') + '\n'.repeat(501) + 'palabra '.repeat(4000),
  );
  const result = await validateSkill(f.dir);
  expect(result.valid).toBe(true);
  expect(result.warnings).toHaveLength(3);
  expect((await validateSkill(f.dir, { strict: true })).valid).toBe(false);
});
it('sombreado, disabled y ausencia con código estable', async () => {
  const f = await fixture();
  await newSkill(f.root, 'foker-workflow');
  expect((await loadSkill(f.root, 'foker-workflow')).source).toBe('project');
  await writeFile(join(f.root, 'foker.config.yaml'), 'version: 1\nskills: {disabled: [foker-workflow]}\n');
  expect((await listSkills(f.root)).some((e) => e.name === 'foker-workflow')).toBe(false);
  await expect(loadSkill(f.root, 'foker-workflow')).rejects.toMatchObject({ code: 'FKR-SKL-001' });
  await expect(loadSkill(f.root, '../bad')).rejects.toMatchObject({ code: 'FKR-SKL-001' });
});
it('new no sobrescribe y dry-run no escribe', async () => {
  const f = await fixture();
  await newSkill(f.root, 'preview', true);
  await expect(readFile(join(f.root, 'foker/skills/preview/SKILL.md'))).rejects.toMatchObject({ code: 'ENOENT' });
  await newSkill(f.root, 'demo');
  await expect(newSkill(f.root, 'demo')).rejects.toMatchObject({ code: 'FKR-INP-001' });
  await expect(newSkill(f.root, '../bad')).rejects.toMatchObject({ code: 'FKR-INP-001' });
});

it('acepta workflow sin fragmento también al cargar la skill para gates', async () => {
  const f = await fixture();
  await newSkill(f.root, 'demo');
  await writeFile(
    join(f.root, 'foker/skills/demo/foker.skill.yaml'),
    stringify({ ...f.manifest, workflow_ref: 'SKILL.md' }),
  );
  expect((await loadSkill(f.root, 'demo')).manifest.workflow_ref).toBe('SKILL.md');
});
