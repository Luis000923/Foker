import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TaskStore } from '@foker/engine';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { main } from '../main.js';

let root: string;

async function run(args: string[], stdin?: string) {
  let stdout = '';
  let stderr = '';
  const exit = await main(
    ['--cwd', root, ...args],
    {},
    {
      stdout: (s) => {
        stdout += s;
      },
      stderr: (s) => {
        stderr += s;
      },
      isTTY: false,
      ...(stdin === undefined ? {} : { stdin: async () => stdin }),
    },
  );
  return { exit, stdout, stderr };
}

async function snapshot(dir: string, prefix = ''): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const entry of await readdir(join(dir, prefix), { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) Object.assign(out, await snapshot(dir, rel));
    else out[rel] = await readFile(join(dir, rel), 'utf8');
  }
  return out;
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'foker-sync-'));
  await writeFile(
    join(root, 'foker.config.yaml'),
    'version: 1\nintegrations:\n  targets: [claude-code, opencode, antigravity]\n',
  );
  await writeFile(join(root, 'AGENTS.md'), '# Proyecto\n\nNotas del equipo.\n');
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('foker sync', () => {
  it('REQ-PRJ-001/003: idempotente byte a byte y --check', async () => {
    expect((await run(['sync'])).exit).toBe(0);
    const first = await snapshot(root);
    expect(Object.keys(first)).toEqual(
      expect.arrayContaining([
        '.mcp.json',
        '.claude/settings.json',
        '.claude/agents/foker-implementer.md',
        '.claude/skills/foker-workflow/SKILL.md',
        'opencode.json',
        '.opencode/agents/foker-reviewer.md',
        '.agents/rules/foker.md',
        '.agents/mcp_config.json',
        '.agents/skills/write-tests/SKILL.md',
        'CLAUDE.md',
        'foker/sync-manifest.json',
      ]),
    );
    expect(first['AGENTS.md']?.startsWith('# Proyecto\n\nNotas del equipo.\n')).toBe(true);
    expect(first['.claude/skills/foker-workflow/foker.skill.yaml']).toBeUndefined();
    expect((await run(['sync'])).stdout).toContain('sin cambios');
    expect(await snapshot(root)).toEqual(first);
    expect((await run(['sync', '--check'])).exit).toBe(0);
    await rm(join(root, '.mcp.json'));
    expect((await run(['sync', '--check'])).exit).toBe(1);
    expect(await readFile(join(root, '.mcp.json'), 'utf8').catch(() => null)).toBeNull();
  });

  it('FKR-SYN-001 ante edición manual del bloque; --force la resuelve', async () => {
    await run(['sync']);
    const agents = await readFile(join(root, 'AGENTS.md'), 'utf8');
    await writeFile(join(root, 'AGENTS.md'), agents.replace('## Foker', '## Foker (editado)'));
    const conflict = await run(['--json', 'sync']);
    expect(conflict.exit).toBe(1);
    expect(JSON.parse(conflict.stdout).errors[0]).toMatchObject({ code: 'FKR-SYN-001' });
    expect((await run(['sync', '--force'])).exit).toBe(0);
    expect(await readFile(join(root, 'AGENTS.md'), 'utf8')).toBe(agents);
  });

  it('--target limita los anfitriones y --dry-run no escribe', async () => {
    const dry = await run(['--json', '--dry-run', 'sync', '--target', 'opencode']);
    expect(JSON.parse(dry.stdout).data.changes.map((c: { path: string }) => c.path)).toContain('opencode.json');
    expect(Object.keys(await snapshot(root)).sort()).toEqual(['AGENTS.md', 'foker.config.yaml']);
    expect((await run(['--json', 'sync', '--target', 'nope'])).exit).toBe(2);
  });
});

describe('foker policy check --hook claude-code', () => {
  const hook = (tool: string, input: Record<string, string>, event = 'PreToolUse') =>
    JSON.stringify({ hook_event_name: event, tool_name: tool, tool_input: input, cwd: root });

  it('bloquea la edición de .foker/** y comandos peligrosos; permite el resto', async () => {
    const denied = await run(
      ['policy', 'check', '--hook', 'claude-code'],
      hook('Edit', { file_path: join(root, '.foker/tasks/x.json') }),
    );
    expect(denied.exit).toBe(0);
    expect(JSON.parse(denied.stdout).hookSpecificOutput).toMatchObject({
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
    });
    const allowed = await run(
      ['policy', 'check', '--hook', 'claude-code'],
      hook('Edit', { file_path: join(root, 'src/a.ts') }),
    );
    expect(allowed.stdout).toBe('');
    for (const command of ['git push origin main', 'rm -rf .foker', 'echo x > foker.config.yaml']) {
      const result = await run(['policy', 'check', '--hook', 'claude-code'], hook('Bash', { command }));
      expect(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision).toBe('deny');
    }
    expect(
      (await run(['policy', 'check', '--hook', 'claude-code'], hook('Bash', { command: 'pnpm test' }))).stdout,
    ).toBe('');
    const outside = await run(
      ['policy', 'check', '--hook', 'claude-code'],
      hook('Write', { file_path: '/etc/passwd' }),
    );
    expect(JSON.parse(outside.stdout).hookSpecificOutput.permissionDecision).toBe('deny');
  });

  it('Stop recuerda enviar las tareas RUNNING una sola vez', async () => {
    const store = new TaskStore(root);
    await mkdir(join(root, 'src'), { recursive: true });
    await store.begin({ description: 'demo', scope: { paths: ['src/**'] } });
    const stop = JSON.stringify({ hook_event_name: 'Stop', cwd: root });
    const blocked = await run(['policy', 'check', '--hook', 'claude-code', '--event', 'stop'], stop);
    expect(JSON.parse(blocked.stdout)).toMatchObject({ decision: 'block' });
    const again = await run(
      ['policy', 'check', '--hook', 'claude-code', '--event', 'stop'],
      JSON.stringify({ hook_event_name: 'Stop', cwd: root, stop_hook_active: true }),
    );
    expect(again.stdout).toBe('');
  });

  it('modo manual: exit 5 si la política lo niega', async () => {
    expect((await run(['policy', 'check', '--path', '.foker/project-map.json'])).exit).toBe(5);
    expect((await run(['policy', 'check', '--path', 'src/a.ts'])).exit).toBe(0);
  });
});
