import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FokerError } from '@foker/core';
import { errorCodes, validate } from '@foker/schemas';
import { expect, it } from 'vitest';
import { main } from './main.js';
import { commands } from './registry.js';

async function run(args: string[], env: NodeJS.ProcessEnv = {}) {
  let stdout = '';
  let stderr = '';
  const exit = await main(args, env, {
    stdout: (text) => {
      stdout += text;
    },
    stderr: (text) => {
      stderr += text;
    },
    isTTY: false,
  });
  return { exit, stdout, stderr };
}
function envelope(stdout: string) {
  const output = JSON.parse(stdout);
  expect(validate('cli-output', output).ok).toBe(true);
  return output;
}
it('ayuda global, por comando y versión', async () => {
  expect((await run(['--help'])).stdout).toContain('policy check');
  expect((await run(['map', '--help'])).stdout).toContain('--full');
  expect((await run(['--version'])).stdout.trim()).toBe('0.0.0');
  expect(envelope((await run(['--help', '--json'])).stdout).exit_code).toBe(0);
});
it('argumentos inválidos y comandos pendientes usan FKR-INP-001, exit 2', async () => {
  for (const args of [
    ['--unknown'],
    ['map', '--profile', 'x'],
    ['map', 'extra'],
    ['task', 'unknown'],
    ['map', '--dry-run'],
    ['map', '--config', 'custom.yaml'],
    ['map', '--check', '--export', '.foker/project-map.json'],
    ['init'],
  ]) {
    const result = await run([...args, '--json']);
    expect(result.exit).toBe(2);
    expect(envelope(result.stdout).errors[0].code).toBe('FKR-INP-001');
  }
  expect(envelope((await run(['task', 'submit', '--json'])).stdout).errors[0].message).toContain('FKR-048');
});
it('CI activa JSON en errores, tanto por flag como entorno', async () => {
  for (const [args, env] of [
    [['--ci', 'init'], {}],
    [['init'], { CI: 'true' }],
  ] as const) {
    expect(envelope((await run([...args], env)).stdout).exit_code).toBe(2);
  }
  expect((await run(['--version'], { CI: 'true' })).stdout.trim()).toBe('0.0.0');
});
it('mapea todos los errores y convierte excepciones inesperadas', async () => {
  const command = commands.find((c) => c.name === 'doctor');
  if (!command) throw new Error('Falta doctor');
  const original = command.run;
  try {
    for (const row of errorCodes().filter((row) => row.exit !== null)) {
      command.run = async () => {
        throw new FokerError(row.code as FokerError['code'], 'prueba');
      };
      expect((await run(['doctor', '--json'])).exit).toBe(row.exit);
    }
    command.run = async () => {
      throw new Error('fallo inesperado');
    };
    const result = await run(['doctor', '--json']);
    expect(result.exit).toBe(10);
    expect(envelope(result.stdout).errors[0].code).toBe('FKR-INT-001');
  } finally {
    command.run = original;
  }
});
it('normaliza opciones globales, arrays repetibles y logs a stderr', async () => {
  const command = commands.find((c) => c.name === 'context');
  if (!command) throw new Error('Falta context');
  const original = command.run;
  try {
    command.run = async (ctx) => {
      ctx.log('log');
      return {
        data: { flags: ctx.flags, nonInteractive: ctx.nonInteractive, color: ctx.color },
        warnings: [],
        exitCode: 0,
      };
    };
    const result = await run(
      ['context', 'tarea', '--anchor', 'a', '--anchor', 'b', '-v', '--config', 'custom.yaml', '--json'],
      { NO_COLOR: '' },
    );
    expect(envelope(result.stdout).data).toMatchObject({
      flags: { anchor: ['a', 'b'], config: 'custom.yaml' },
      nonInteractive: true,
      color: false,
    });
    expect(result.stderr).toContain('log');
  } finally {
    command.run = original;
  }
});
it('map guarda el dorado, comprueba cambios y exporta JSON válido sin escribir en dry-run', async () => {
  const fixture = new URL('../../../fixtures/monorepo-pnpm/', import.meta.url);
  const root = mkdtempSync(join(tmpdir(), 'foker-cli-'));
  cpSync(fixture, root, { recursive: true, filter: (src) => !src.includes('/expected') });
  const args = ['map', '--cwd', root, '--json'];
  try {
    expect((await run([...args, '--check'])).exit).toBe(1);
    expect(existsSync(join(root, '.foker/project-map.json'))).toBe(false);
    const first = envelope((await run([...args, '--stats'])).stdout);
    expect(first.data.contentHash).toBe(readFileSync(new URL('expected/content_hash.txt', fixture), 'utf8').trim());
    expect(first.data.stats.files).toBe(13);
    expect(existsSync(join(root, '.foker/project-map.json'))).toBe(true);
    expect((await run([...args, '--check'])).exit).toBe(0);
    const saved = readFileSync(join(root, '.foker/project-map.json'), 'utf8');
    writeFileSync(join(root, 'packages/core/src/cart/types.ts'), 'export const changed = 1;\n');
    expect((await run([...args, '--check'])).exit).toBe(1);
    expect(readFileSync(join(root, '.foker/project-map.json'), 'utf8')).toBe(saved);
    expect((await run([...args, '--export', './export.json', '--dry-run'])).exit).toBe(0);
    expect(existsSync(join(root, 'export.json'))).toBe(false);
    expect(readFileSync(join(root, '.foker/project-map.json'), 'utf8')).toBe(saved);
    expect((await run([...args, '--full', '--export', './export.json'])).exit).toBe(0);
    expect(validate('project-map', JSON.parse(readFileSync(join(root, 'export.json'), 'utf8'))).ok).toBe(true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it.each([
  { flags: ['--export', 'out.json', '--dry-run'], exit: 0 },
  { flags: ['--check'], exit: 1 },
])('map $flags conserva un mapa corrupto sin escribir', async ({ flags, exit }) => {
  const root = mkdtempSync(join(tmpdir(), 'foker-cli-read-only-'));
  try {
    writeFileSync(join(root, 'a.ts'), 'export const a = 1;\n');
    const foker = join(root, '.foker');
    mkdirSync(foker);
    const path = join(foker, 'project-map.json');
    writeFileSync(path, '{ no es json');
    const bytes = readFileSync(path);
    const files = readdirSync(foker, { recursive: true }).sort();
    const result = await run(['map', '--cwd', root, '--json', ...flags]);
    expect(result.exit).toBe(exit);
    expect(envelope(result.stdout).warnings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'FKR-MAP-005' })]),
    );
    expect(readFileSync(path)).toEqual(bytes);
    expect(readdirSync(foker, { recursive: true }).sort()).toEqual(files);
    expect(existsSync(join(foker, 'cache'))).toBe(false);
    expect(existsSync(join(root, 'out.json'))).toBe(false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it('context produce un pack válido con el ancla L3 sin guardar el mapa', async () => {
  const root = mkdtempSync(join(tmpdir(), 'foker-cli-context-'));
  try {
    cpSync(new URL('../../../fixtures/monorepo-pnpm/', import.meta.url), root, {
      recursive: true,
      filter: (src) => !src.includes('/expected'),
    });
    const args = [
      'context',
      'Añade la variante danger al botón',
      '--cwd',
      root,
      '--anchor',
      'packages/ui/src/button.tsx',
    ];
    const result = await run([...args, '--json']);
    expect(result.exit).toBe(0);
    const pack = envelope(result.stdout).data;
    expect(validate('context-pack', pack).ok).toBe(true);
    expect(pack.files).toContainEqual(expect.objectContaining({ id: 'packages/ui/src/button.tsx', level: 'L3' }));
    expect(existsSync(join(root, '.foker/project-map.json'))).toBe(false);
    expect((await run(args)).stdout).toBe(pack.rendered);
    expect(envelope((await run([...args, '--format', 'json'])).stdout).data.pack_hash).toBe(pack.pack_hash);
    expect((await run([...args, '--budget', '10', '--json'])).exit).toBe(2);
    expect(envelope((await run([...args, '--skill', 'missing', '--json'])).stdout).errors[0].code).toBe('FKR-SKL-001');
    expect(envelope((await run([...args, '--task', 'x', '--json'])).stdout).errors[0].message).toContain('FKR-045');
    mkdirSync(join(root, 'foker'), { recursive: true });
    writeFileSync(join(root, 'foker/rules.md'), 'Regla obligatoria '.repeat(2000));
    const tooSmall = await run([...args, '--budget', '1000', '--json']);
    expect(tooSmall.exit).toBe(1);
    expect(envelope(tooSmall.stdout).errors[0].code).toBe('FKR-CTX-001');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
