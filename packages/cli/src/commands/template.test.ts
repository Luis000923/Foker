import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '@foker/engine';
import { validate } from '@foker/schemas';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { parse } from 'yaml';
import { main } from '../main.js';
import { readSpec, templateDestination } from './init.js';

const ignoreFixture = vi.hoisted(() => ({ omitFoker: false }));
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    readFile: async (...args: Parameters<typeof actual.readFile>) => {
      const content = await actual.readFile(...args);
      if (
        ignoreFixture.omitFoker &&
        typeof content === 'string' &&
        /templates.*[\\/]_?\.?gitignore$/.test(String(args[0]))
      )
        return content.replace(/^\.foker\/\r?\n/gm, '');
      return content;
    },
  };
});

let parent: string;
let root: string;
beforeEach(async () => {
  parent = await mkdtemp(join(tmpdir(), 'foker-template-'));
  root = join(parent, 'mi-proyecto');
});
afterEach(async () => {
  await rm(parent, { recursive: true, force: true });
});
async function run(...args: string[]) {
  let stdout = '';
  const exit = await main(
    ['--cwd', parent, '--json', ...args],
    {},
    {
      stdout: (s) => {
        stdout += s;
      },
      stderr: () => {},
      isTTY: false,
    },
  );
  return { exit, output: JSON.parse(stdout) };
}
async function contents(dir: string, prefix = ''): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const entry of await readdir(join(dir, prefix), { withFileTypes: true })) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) Object.assign(result, await contents(dir, path));
    else result[path] = await readFile(join(dir, path), 'utf8');
  }
  return result;
}
const init = ['init', 'mi-proyecto', '--template', 'nextjs-turbo', '--targets', 'claude-code'];

it('genera estructura, configuración y especificación válidas; versiones exactas y mapa sin instalar', async () => {
  const result = await run(...init);
  expect(result.exit).toBe(0);
  expect(result.output.data.files).toMatchSnapshot();
  expect(result.output.data.synced).toContain('.mcp.json');
  const files = await contents(root);
  expect(Object.keys(files).sort()).toMatchSnapshot('archivos generados con sync');
  for (const [path, text] of Object.entries(files)) {
    if (path.endsWith('.json')) expect(() => JSON.parse(text)).not.toThrow();
    if (path.endsWith('package.json')) {
      const pkg = JSON.parse(text);
      for (const section of ['dependencies', 'devDependencies', 'peerDependencies']) {
        for (const version of Object.values(pkg[section] ?? {})) {
          expect(String(version)).not.toMatch(/[~^]/);
        }
      }
    }
  }
  expect(JSON.parse(files['package.json'] ?? '{}').name).toBe('mi-proyecto');
  const yaml = parse(files['foker.config.yaml'] ?? '');
  expect(validate('foker-config', yaml).ok).toBe(true);
  expect((await loadConfig(root)).config.template).toEqual({ name: 'nextjs-turbo', version: '0.1.0' });
  expect(yaml.validation.profiles).toEqual({
    quick: { checks: ['typecheck'] },
    default: { checks: ['typecheck', 'lint', 'test', 'secrets'] },
    security: { checks: ['secrets', 'audit'] },
  });
  for (const check of ['typecheck', 'lint', 'test']) {
    expect(yaml.validation.checks[check].run).toEqual(['pnpm', 'turbo', 'run', check, '${affected_packages}']);
  }
  expect((await readSpec(root, 'foker.md')).name).toBe('mi-proyecto');
  for (const header of [
    'Content-Security-Policy',
    'Strict-Transport-Security',
    'X-Content-Type-Options',
    'Referrer-Policy',
  ]) {
    expect(files['apps/web/next.config.ts']).toContain(header);
  }
  expect(files['apps/web/next.config.ts']).toContain('buildCsp(env.NODE_ENV)');
  expect(files['.gitignore']?.split('\n')).toContain('*.tsbuildinfo');
  expect(files['apps/web/lib/security/csp.ts']).toContain("default-src 'self'");
  expect(files['apps/web/lib/security/csp.ts']).toContain("frame-ancestors 'none'");
  // 'unsafe-eval' solo en desarrollo (FKR-104); la lógica se prueba en csp.test.ts del proyecto generado.
  expect(files['apps/web/lib/security/csp.ts']).toContain("nodeEnv === 'development' ? \" 'unsafe-eval'\" : ''");
  expect(files['apps/web/lib/security/csp.test.ts']).toContain("'unsafe-eval'");
  expect(parse(files['pnpm-workspace.yaml'] ?? '')).toMatchObject({ minimumReleaseAge: 1440, allowBuilds: {} });
  expect(JSON.parse(files['turbo.json'] ?? '{}')).not.toHaveProperty('remoteCache');
  const mapped = await run('--cwd', root, 'map', '--export', 'map.json');
  expect(mapped.exit).toBe(0);
  const map = JSON.parse(await readFile(join(root, 'map.json'), 'utf8'));
  for (const name of ['web', 'ui', 'config-typescript', 'config-eslint']) {
    expect(map.project.packages).toContainEqual(
      expect.objectContaining({ id: `pkg:@repo/${name}`, path: name === 'web' ? 'apps/web' : `packages/${name}` }),
    );
  }
  expect(existsSync(join(root, 'node_modules'))).toBe(false);
});

it('segunda ejecución sin force falla sin modificar ningún archivo', async () => {
  expect((await run(...init)).exit).toBe(0);
  const before = await contents(root);
  expect((await run(...init)).exit).toBe(2);
  expect(await contents(root)).toEqual(before);
});

it('dry-run lista los archivos sin crear el destino y coincide con la ejecución', async () => {
  const preview = await run('--dry-run', ...init);
  expect(preview.exit).toBe(0);
  expect(existsSync(root)).toBe(false);
  const real = await run(...init);
  expect(preview.output.data.files).toEqual(real.output.data.files);
  expect(preview.output.data.synced).toEqual(real.output.data.synced);
});

it('rechaza directorios ocupados; force avisa y conserva archivos ajenos', async () => {
  await mkdir(root);
  await writeFile(join(root, 'ajeno.txt'), 'conservar');
  await writeFile(join(root, 'package.json'), '{}');
  const before = await contents(root);
  expect((await run(...init)).exit).toBe(2);
  expect(await contents(root)).toEqual(before);
  const preview = await run('--dry-run', ...init, '--force');
  expect(preview.output.warnings).toEqual([{ code: 'FKR-INP-001', message: 'Se sobrescribe package.json' }]);
  expect(await contents(root)).toEqual(before);
  const result = await run(...init, '--force');
  expect(result.exit).toBe(0);
  expect(result.output.warnings).toEqual(preview.output.warnings);
  expect(await readFile(join(root, 'ajeno.txt'), 'utf8')).toBe('conservar');
});

it('from-spec usa nombre, descripción y opciones validados', async () => {
  await mkdir(root);
  await writeFile(
    join(root, 'foker.md'),
    '---\nfoker_spec: 1\nname: aurora\ndescription: Métricas\ntemplate:\n  name: nextjs-turbo\n  options: {dark_mode: true}\n---\n# Aurora\n',
  );
  expect((await run('init', 'mi-proyecto', '--force', '--from-spec', 'foker.md', '--targets', 'opencode')).exit).toBe(
    0,
  );
  expect(JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).name).toBe('aurora');
  expect((await readSpec(root, 'foker.md')).name).toBe('aurora');
  expect((await loadConfig(root)).config).toMatchObject({
    project: { name: 'aurora', description: 'Métricas' },
    template: { options: { dark_mode: true } },
    integrations: { targets: ['opencode'] },
  });
});

it('preflight rechaza enlaces y colisiones antes de escribir', async () => {
  await mkdir(root);
  const outside = join(parent, 'outside');
  await mkdir(outside);
  await writeFile(join(outside, 'sentinel'), 'conservar');
  await symlink(outside, join(root, 'apps'), 'junction');
  expect((await run(...init, '--force')).exit).toBe(2);
  expect(await readdir(root)).toEqual(['apps']);
  expect(await readdir(outside)).toEqual(['sentinel']);
  await rm(join(root, 'apps'));
  await writeFile(join(root, 'apps'), 'colisión');
  expect((await run(...init, '--force')).exit).toBe(2);
  expect(await readdir(root)).toEqual(['apps']);
});

it('restaura gitignore empaquetados en cualquier nivel', () => {
  expect(templateDestination('_gitignore')).toBe('.gitignore');
  expect(templateDestination('apps/web/_gitignore')).toBe('apps/web/.gitignore');
  expect(templateDestination('otra/plantilla/packages/ui/_gitignore')).toBe('otra/plantilla/packages/ui/.gitignore');
  expect(templateDestination('_gitignore/package.json')).toBe('_gitignore/package.json');
});

it('acepta un destino con solo .git y conserva sus archivos', async () => {
  await mkdir(join(root, '.git'), { recursive: true });
  await writeFile(join(root, '.git/HEAD'), 'ref: refs/heads/main\n');
  expect((await run(...init)).exit).toBe(0);
  expect(await readFile(join(root, '.git/HEAD'), 'utf8')).toBe('ref: refs/heads/main\n');
  expect(
    (await readFile(join(root, '.gitignore'), 'utf8')).split('\n').filter((line) => line === '.foker/'),
  ).toHaveLength(1);
  expect((await run(...init, '--force')).exit).toBe(0);
  expect(
    (await readFile(join(root, '.gitignore'), 'utf8')).split('\n').filter((line) => line === '.foker/'),
  ).toHaveLength(1);
});

it('rechaza .git acompañado de cualquier otro contenido sin force', async () => {
  await mkdir(join(root, '.git'), { recursive: true });
  await writeFile(join(root, '.otro'), 'conservar');
  const before = await contents(root);
  expect((await run(...init)).exit).toBe(2);
  expect(await contents(root)).toEqual(before);
});

it('añade .foker/ cuando el gitignore de la plantilla no lo incluye', async () => {
  ignoreFixture.omitFoker = true;
  try {
    const preview = await run('--dry-run', ...init);
    expect(preview.exit).toBe(0);
    expect(existsSync(root)).toBe(false);
    const real = await run(...init);
    expect(real.exit).toBe(0);
    expect(real.output.data.files).toEqual(preview.output.data.files);
    const ignore = await readFile(join(root, '.gitignore'), 'utf8');
    expect(ignore).toContain('node_modules/');
    expect(ignore.split('\n').filter((line) => line === '.foker/')).toHaveLength(1);
  } finally {
    ignoreFixture.omitFoker = false;
  }
});
