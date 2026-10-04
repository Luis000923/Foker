import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { main } from '../main.js';
import { checkHost, fallbackIgnored, runDoctor } from './doctor.js';

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'foker-doctor-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const byId = (checks: { id: string; status: string }[]) => Object.fromEntries(checks.map((c) => [c.id, c.status]));

it('informa del entorno y de lo que falta en un proyecto vacío', async () => {
  const { checks } = await runDoctor(root, {}, {});
  const status = byId(checks);
  expect(status['node']).toBe('ok');
  expect(status['addon']).toBe('ok');
  expect(status['config']).toBe('warn');
  expect(status['rules']).toBe('warn');
  expect(status['gitignore']).toBe('warn');
  expect(['ok', 'warn']).toContain(status['sandbox']);
});

it('detecta reglas largas, otros servidores MCP, deriva de sync y política relajada', async () => {
  await mkdir(join(root, 'foker'), { recursive: true });
  await writeFile(join(root, 'foker/rules.md'), 'regla '.repeat(2000));
  await writeFile(join(root, '.mcp.json'), JSON.stringify({ mcpServers: { otro: { command: 'x' } } }));
  await writeFile(
    join(root, 'foker.config.yaml'),
    [
      'version: 1',
      'integrations:',
      '  targets: [claude-code]',
      'policy:',
      '  overrides:',
      '    - remove_protected_paths: [".mcp.json"]',
      '      justification: "lo gestiona otra herramienta"',
      '',
    ].join('\n'),
  );
  const { checks } = await runDoctor(root, { FOKER_SANDBOX: '1' }, {});
  const status = byId(checks);
  expect(status['rules']).toBe('warn');
  expect(status['mcp']).toBe('warn');
  expect(status['sync']).toBe('warn');
  expect(status['policy-override']).toBe('warn');
  expect(status['sandbox']).toBe('ok');
  expect(status['config']).toBe('ok');
});

it('--fix solo crea .foker/ y lo añade a .gitignore, sin duplicar', async () => {
  await writeFile(join(root, '.gitignore'), 'node_modules');
  let out = '';
  const io = { stdout: (s: string) => (out += s), stderr: () => {}, isTTY: false };
  expect(await main(['--cwd', root, '--json', 'doctor', '--fix'], {}, io)).toBe(0);
  expect(JSON.parse(out).data.fixed).toEqual(['.foker/', '.gitignore']);
  expect(await readFile(join(root, '.gitignore'), 'utf8')).toBe('node_modules\n.foker/\n');
  out = '';
  await main(['--cwd', root, '--json', 'doctor', '--fix'], {}, io);
  expect(JSON.parse(out).data.fixed).toEqual([]);
  expect(await readFile(join(root, '.gitignore'), 'utf8')).toBe('node_modules\n.foker/\n');
});

it('config inválida es un fallo con exit 1', async () => {
  await writeFile(join(root, 'foker.config.yaml'), 'version: 2\n');
  const io = { stdout: () => {}, stderr: () => {}, isTTY: false };
  expect(await main(['--cwd', root, 'doctor'], {}, io)).toBe(1);
});

it('respeta --config y --dry-run y devuelve reparaciones propuestas', async () => {
  await writeFile(join(root, 'foker.config.yaml'), 'version: 1\n');
  await writeFile(join(root, 'custom.yaml'), 'version: 2\n');
  let out = '';
  const io = { stdout: (s: string) => (out += s), stderr: () => {}, isTTY: false };
  expect(await main(['--cwd', root, '--json', '--config', 'custom.yaml', '--dry-run', 'doctor', '--fix'], {}, io)).toBe(
    1,
  );
  expect(JSON.parse(out).data.fixed).toEqual([]);
  expect(JSON.parse(out).data.proposed).toEqual(['.foker/', '.gitignore']);
  for (const path of ['.foker', '.gitignore'])
    await expect(readFile(join(root, path))).rejects.toMatchObject({ code: 'ENOENT' });
  await writeFile(join(root, 'custom.yaml'), 'version: 1\nintegrations: {targets: [claude-code]}\n');
  const { checks } = await runDoctor(root, {}, { configPath: 'custom.yaml' });
  expect(checks.find((c) => c.id === 'sync')?.message).toBe('Integraciones sin generar');
});

it('repara negaciones posteriores en .gitignore', async () => {
  await writeFile(join(root, '.gitignore'), '.foker/\n!.foker/\n');
  expect(byId((await runDoctor(root, {}, {})).checks)['gitignore']).toBe('warn');
  expect((await runDoctor(root, {}, { fix: true })).fixed).toContain('.gitignore');
  expect(byId((await runDoctor(root, {}, {})).checks)['gitignore']).toBe('ok');
});

it('consulta las reglas efectivas con git y permite reparar una negación', async () => {
  await promisify(execFile)('git', ['init', '--quiet'], { cwd: root });
  await writeFile(join(root, '.gitignore'), '.foker/\n!.foker/\n');
  expect(byId((await runDoctor(root, {}, {})).checks)['gitignore']).toBe('warn');
  await runDoctor(root, {}, { fix: true });
  expect(byId((await runDoctor(root, {}, {})).checks)['gitignore']).toBe('ok');
});

it('sin git evalúa patrones y negaciones en orden', () => {
  expect(fallbackIgnored('.foker/\n!.foker/\n')).toBe(false);
  expect(fallbackIgnored('.foker/\n!.foker/\n/.foker/\n')).toBe(true);
  expect(fallbackIgnored('.foker/*\n!.foker/x\n')).toBe(false);
  expect(fallbackIgnored('# .foker/\nnode_modules/\n')).toBe(false);
});

it('doctor comprueba cada CLI y la sesión sin exponer salida ni exigir secretos', async () => {
  for (const target of ['codex', 'claude-code', 'opencode', 'antigravity'] as const) {
    const calls: [string, string[]][] = [];
    const checks = await checkHost(target, root, {}, async (command, args) => {
      calls.push([command, args]);
    });
    expect(checks[0]?.status).toBe('ok');
    expect(calls[0]).toEqual([target === 'claude-code' ? 'claude' : target, ['--version']]);
    expect(checks[1]?.status).toBe(target === 'codex' || target === 'claude-code' ? 'ok' : 'warn');
    if (target === 'codex') expect(calls[1]).toEqual(['codex', ['login', 'status']]);
    expect(JSON.stringify(checks)).not.toContain('API_KEY');
  }
  const missing = await checkHost('codex', root, {}, async () => {
    throw new Error('credencial privada');
  });
  expect(missing[0]?.status).toBe('warn');
  expect(JSON.stringify(missing)).not.toContain('credencial privada');
  const loggedOut = await checkHost('codex', root, {}, async (_, args) => {
    if (args[0] === 'login') throw new Error('secreto');
  });
  expect(loggedOut[1]?.status).toBe('warn');
  expect(JSON.stringify(loggedOut)).not.toContain('secreto');
});
