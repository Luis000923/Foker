import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { buildSpawnCommand, runCheck } from './exec.js';

const hooks = vi.hoisted(() => ({ resolved: undefined as (() => void) | undefined }));
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    realpath: async (path: string) => {
      const result = await actual.realpath(path);
      hooks.resolved?.();
      return result;
    },
  };
});
vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  spawn: vi.fn(() => {
    throw new Error('No debe lanzarse ningún proceso');
  }),
}));
afterEach(() => {
  hooks.resolved = undefined;
  vi.clearAllMocks();
});

it.each(['pnpm.cmd', 'npm.cmd', 'npx.cmd', 'turbo.cmd', 'tool.BAT'])(
  'construye cmd.exe para %s con path entrecomillado',
  (shim) => {
    expect(
      buildSpawnCommand(
        `C:\\Program Files\\node\\${shim}`,
        ['--filter=@scope/pkg', 'test', 'a+b=c:d,e/f\\g'],
        'win32',
        { ComSpec: 'C:\\Windows\\cmd.exe' },
      ),
    ).toEqual({
      executable: 'C:\\Windows\\cmd.exe',
      args: ['/d', '/s', '/c', `""C:\\Program Files\\node\\${shim}" --filter=@scope/pkg test a+b=c:d,e/f\\g"`],
      windowsVerbatimArguments: true,
    });
  },
);
it('fallback cmd.exe y argv nativo literal', () => {
  expect(buildSpawnCommand('pnpm.cmd', [], 'win32', {}).args).toEqual(['/d', '/s', '/c', '""pnpm.cmd""']);
  expect(buildSpawnCommand('pnpm.cmd', [], 'win32', {}).executable).toBe('cmd.exe');
  for (const [executable, platform] of [
    ['node.exe', 'win32'],
    ['pnpm.cmd', 'linux'],
  ] as const)
    expect(buildSpawnCommand(executable, ['a b', '%PATH%', '&'], platform, {})).toEqual({
      executable,
      args: ['a b', '%PATH%', '&'],
      windowsVerbatimArguments: false,
    });
});
it.each([
  '',
  '%PATH%',
  '"x"',
  '&',
  '|',
  '<',
  '>',
  '^',
  '!',
  '(',
  ')',
  'a b',
  'a\nb',
  'test\n',
  'a\tb',
  'a;b',
  '`x`',
  '$HOME',
])('rechaza argumento inseguro %j antes del spawn', (arg) => {
  expect(() => buildSpawnCommand('pnpm.cmd', [arg], 'win32', {})).toThrow(
    expect.objectContaining({ code: 'FKR-VAL-004', message: expect.stringContaining('inseguro') }),
  );
});
it.each(['%PATH%\\pnpm.cmd', 'C:\\a&b\\npm.cmd', 'C:\\a"b\\npx.cmd', 'C:\\a\nb\\turbo.cmd'])(
  'rechaza expansión y sintaxis en el ejecutable %j',
  (executable) => {
    expect(() => buildSpawnCommand(executable, ['test'], 'win32', {})).toThrow(
      expect.objectContaining({ code: 'FKR-VAL-004' }),
    );
  },
);
it.each(['antes', 'durante resolución'])('no hace spawn si aborta %s', async (when) => {
  const root = await mkdtemp(join(tmpdir(), 'foker-abort-'));
  try {
    const controller = new AbortController();
    if (when === 'antes') controller.abort();
    else {
      let resolutions = 0;
      hooks.resolved = () => {
        if (++resolutions === 2) controller.abort();
      };
    }
    const result = await runCheck({ run: [process.execPath, '-v'] }, { root, signal: controller.signal });
    expect(result).toMatchObject({
      status: 'skipped',
      notExecuted: true,
      exit_code: null,
      findings: [{ message: expect.stringContaining('abortada') }],
    });
    const { spawn } = await import('node:child_process');
    expect(spawn).not.toHaveBeenCalled();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
