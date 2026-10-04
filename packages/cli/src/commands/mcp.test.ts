import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TaskStore } from '@foker/engine';
import { expect, it } from 'vitest';
import { main } from '../main.js';

it('root inválido no contamina stdout, incluso con --json y --debug', async () => {
  let stdout = '';
  let stderr = '';
  const code = await main(
    ['mcp', '--root', '/does/not/exist', '--json', '--debug'],
    {},
    {
      isTTY: false,
      stdout: (s) => {
        stdout += s;
      },
      stderr: (s) => {
        stderr += s;
      },
    },
  );
  expect(code).toBe(3);
  expect(stdout).toBe('');
  expect(JSON.parse(stderr)).toMatchObject({ event: 'startup', code: 'FKR-CFG-002', message: expect.any(String) });
});

for (const args of [
  ['mcp', '--unknown', '--json', '--debug'],
  ['mcp', '--root'],
  ['--json', '--debug', 'mcp', '--root'],
  ['--cwd', '/tmp', 'mcp', '--unknown'],
  ['mcp', '--help', '--unknown', '--debug'],
])
  it(`error de parseo MCP solo escribe una línea JSON en stderr: ${args.join(' ')}`, async () => {
    let stdout = '';
    let stderr = '';
    const code = await main(
      args,
      {},
      {
        isTTY: false,
        stdout: (s) => {
          stdout += s;
        },
        stderr: (s) => {
          stderr += s;
        },
      },
    );
    expect(code).toBe(2);
    expect(stdout).toBe('');
    expect(stderr.trim().split('\n')).toHaveLength(1);
    expect(JSON.parse(stderr)).toEqual({
      ts: expect.any(String),
      level: 'error',
      event: 'startup',
      code: 'FKR-INP-001',
      message: expect.any(String),
    });
  });

it('task begin rechaza globs protegidos ausentes del mapa', async () => {
  const root = await mkdtemp(join(tmpdir(), 'foker-cli-scope-'));
  try {
    for (const path of ['.git/**', '.agents/**', '.foker/**', 'foker/skills/**']) {
      let output = '';
      const code = await main(
        ['task', 'begin', 'protegido', '--cwd', root, '--scope', path, '--json'],
        {},
        {
          isTTY: false,
          stdout: (s) => {
            output += s;
          },
          stderr: () => {},
        },
      );
      expect(code).toBe(5);
      expect(JSON.parse(output)).toMatchObject({
        errors: [{ code: 'FKR-POL-002', message: expect.stringContaining('protected_paths_in_scope') }],
      });
    }
    expect(await new TaskStore(root).list()).toEqual([]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
