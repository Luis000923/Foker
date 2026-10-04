import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { main } from '../main.js';
import { runDoctor } from './doctor.js';

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
