import { cpSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TaskStore } from '@foker/engine';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { main } from '../main.js';

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'foker-context-cli-'));
  cpSync(new URL('../../../../fixtures/monorepo-pnpm/', import.meta.url), root, {
    recursive: true,
    filter: (src) => !src.includes('/expected'),
  });
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function run(...args: string[]) {
  let stdout = '';
  const exit = await main(
    ['--cwd', root, '--json', ...args],
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

it('--task usa la descripción y el alcance de la tarea del ledger', async () => {
  const task = await new TaskStore(root).begin({
    description: 'Añade la variante danger al botón',
    scope: { paths: ['packages/ui/src/**'] },
  });
  const result = await run('context', '--task', task.task_id);
  expect(result.exit).toBe(0);
  const pack = result.output.data;
  expect(pack.request.task).toBe('Añade la variante danger al botón');
  expect(pack.request.task_id).toBe(task.task_id);
  expect(pack.sections.map((s: { id: string }) => s.id)).toContain('task_scope');
  expect(pack.files.some((f: { reasons: string[] }) => f.reasons.includes('TASK_SCOPE'))).toBe(true);
});

it('--task inexistente es FKR-TSK-001', async () => {
  const result = await run('context', '--task', 'tsk_01J9Z3K8Q4M7V2N5X8B1C6D0EF');
  expect(result.output.errors[0].code).toBe('FKR-TSK-001');
});
