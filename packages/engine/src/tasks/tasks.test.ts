import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { hashCanonicalJson } from '@foker/core';
import {
  type FokerTaskBeginInput,
  type GateResult,
  type TaskEvidence,
  type TaskRecord,
  type TaskState,
  validate,
} from '@foker/schemas';
import { afterEach, describe, expect, it } from 'vitest';
import { assertTransition, TaskStore, TRANSITIONS, taskId } from './index.js';

const exec = promisify(execFile);
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function fixture(options = {}) {
  const root = await mkdtemp(join(tmpdir(), 'foker-task-'));
  roots.push(root);
  return { root, store: new TaskStore(root, options) };
}
const input: FokerTaskBeginInput = { description: 'Cambiar archivo', scope: { paths: ['*.txt'] } };
const gates = (status: GateResult['status'] = 'pass'): GateResult[] =>
  ['scope', 'policy', 'map', 'checks', 'skill'].map((gate) => ({
    gate: gate as GateResult['gate'],
    status,
    findings: [],
  }));
function evidence(task: TaskRecord, result: TaskState = 'COMPLETED', results = gates()): TaskEvidence {
  return {
    schema_version: 1,
    task_id: task.task_id,
    attempt: task.attempt,
    foker_version: '0.0.0',
    started_at: task.created_at,
    finished_at: task.updated_at,
    map_hash: hashCanonicalJson('{}'),
    changes: [],
    gates: results,
    result,
  };
}
it('ULID determinista con reloj y entropía inyectados', () => {
  expect(taskId(0, () => new Uint8Array(10))).toBe(`tsk_${'0'.repeat(26)}`);
  expect(taskId(1, () => new Uint8Array(10).fill(255))).toBe('tsk_0000000001ZZZZZZZZZZZZZZZZ');
});
describe('tabla exacta FSM', () => {
  for (const [from, targets] of Object.entries(TRANSITIONS)) {
    for (const to of Object.keys(TRANSITIONS) as TaskState[]) {
      it(`${from} → ${to}`, () => {
        if (targets.includes(to)) expect(() => assertTransition(from as TaskState, to)).not.toThrow();
        else
          expect(() => assertTransition(from as TaskState, to)).toThrowError(
            expect.objectContaining({ code: 'FKR-TSK-002' }),
          );
      });
    }
  }
});
it('begin, persistencia, validación de registro/eventos, get/list y ausencia', async () => {
  const { root, store } = await fixture();
  const task = await store.begin(input);
  expect(
    validate('task', JSON.parse(await readFile(join(root, '.foker/tasks', `${task.task_id}.json`), 'utf8'))).ok,
  ).toBe(true);
  expect(await new TaskStore(root).get(task.task_id)).toEqual(task);
  expect(await store.list()).toEqual([task]);
  expect(await store.verifyLedger(task.task_id)).toBe(true);
  await expect(store.get(`tsk_${'0'.repeat(26)}`)).rejects.toMatchObject({ code: 'FKR-TSK-001' });
});
it('idempotencia canónica y conflicto de token, incluso concurrente', async () => {
  const { store } = await fixture();
  const requests = await Promise.all([
    store.begin({ ...input, client_token: 'a' }),
    store.begin({ ...input, profile: 'default', max_attempts: 3, client_token: 'a' }),
  ]);
  expect(requests[0]?.task_id).toBe(requests[1]?.task_id);
  await expect(store.begin({ ...input, description: 'Otra', client_token: 'a' })).rejects.toMatchObject({
    code: 'FKR-INP-001',
  });
});
it('límites de entrada', async () => {
  const { store } = await fixture();
  for (const invalid of [
    { ...input, description: '' },
    { ...input, max_attempts: 6 },
    { ...input, scope: { paths: [] } },
    { ...input, client_token: 'x'.repeat(65) },
  ]) {
    await expect(store.begin(invalid as FokerTaskBeginInput)).rejects.toMatchObject({ code: 'FKR-INP-001' });
  }
});
it('max_active incluye estados no terminales, cancel libera cupo', async () => {
  const { store } = await fixture();
  const tasks = await Promise.all(Array.from({ length: 5 }, () => store.begin(input)));
  await expect(store.begin(input)).rejects.toMatchObject({ code: 'FKR-TSK-005' });
  const task = tasks[0];
  if (!task) throw new Error('fixture');
  await store.cancel(task.task_id);
  expect((await store.begin(input)).state).toBe('RUNNING');
});
it('lease exacto, touch y list bloquea stale; unblock humano', async () => {
  let now = 0;
  const { store } = await fixture({ clock: () => now });
  const task = await store.begin(input);
  now = 4 * 3600000 - 1;
  expect((await store.get(task.task_id)).state).toBe('RUNNING');
  await store.touch(task.task_id);
  now += 4 * 3600000;
  expect((await store.list())[0]).toMatchObject({ state: 'BLOCKED', blocked_reason: 'stale' });
  await expect(store.unblock(task.task_id, 'mcp:agent')).rejects.toMatchObject({ code: 'FKR-INP-001' });
  expect((await store.unblock(task.task_id, 'cli:luis')).approvals[0]?.action).toBe('unblock');
});
it('dos submits concurrentes: solo uno gana', async () => {
  const { store } = await fixture();
  const task = await store.begin(input);
  const results = await Promise.allSettled([store.submit(task.task_id), store.submit(task.task_id)]);
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  expect(results.find((result) => result.status === 'rejected')).toMatchObject({ reason: { code: 'FKR-TSK-002' } });
});
it('rechazo automático, agotamiento y evidencia', async () => {
  const { store } = await fixture();
  let task = await store.begin({ ...input, max_attempts: 2 });
  task = await store.submit(task.task_id);
  task = await store.finishValidation(task.task_id, evidence(task, 'REJECTED', gates('fail')));
  expect(task).toMatchObject({ state: 'RUNNING', attempt: 2, next_action: 'fix_and_resubmit' });
  task = await store.submit(task.task_id);
  task = await store.finishValidation(task.task_id, evidence(task, 'REJECTED', gates('fail')));
  expect(task.state).toBe('FAILED');
  expect(await store.verifyLedger(task.task_id)).toBe(true);
});
it('aprobación/rechazo humanos registrados y política bloqueada', async () => {
  const { store } = await fixture();
  let task = await store.begin(input);
  task = await store.submit(task.task_id);
  const results = gates();
  if (results[1]) results[1].status = 'approval_required';
  task = await store.finishValidation(task.task_id, evidence(task, 'AWAITING_APPROVAL', results));
  task = await store.reject(task.task_id, 'cli:luis', 'Corregir');
  expect(task.attempt).toBe(2);
  task = await store.submit(task.task_id);
  task = await store.finishValidation(task.task_id, evidence(task, 'AWAITING_APPROVAL', results));
  expect((await store.approve(task.task_id, 'cli:luis')).state).toBe('COMPLETED');
  expect(await store.verifyLedger(task.task_id)).toBe(true);
  let blocked = await store.begin(input);
  blocked = await store.submit(blocked.task_id);
  blocked = await store.finishValidation(blocked.task_id, evidence(blocked, 'BLOCKED', gates('blocked')));
  expect(blocked.attempt).toBe(1);
  expect((await store.unblock(blocked.task_id, 'cli:luis')).attempt).toBe(1);
});
it('detecta evento editado, borrado intermedio o último y evidencia editada', async () => {
  const { root, store } = await fixture();
  let task = await store.begin(input);
  task = await store.submit(task.task_id);
  task = await store.finishValidation(task.task_id, evidence(task));
  const path = join(root, '.foker/tasks', `${task.task_id}.events.jsonl`);
  const original = await readFile(path, 'utf8');
  for (const altered of [
    original.replace('begin', 'edited'),
    original.split('\n').slice(1).join('\n'),
    original.split('\n').slice(0, -2).join('\n'),
  ]) {
    await writeFile(path, altered);
    expect(await store.verifyLedger(task.task_id)).toBe(false);
  }
  await writeFile(path, original);
  expect(await store.verifyLedger(task.task_id)).toBe(true);
  await writeFile(join(root, '.foker/runs', task.task_id, '1/evidence.json'), '{}');
  expect(await store.verifyLedger(task.task_id)).toBe(false);
});
it('500 secuencias pseudoaleatorias: completar exige VALIDATING y gates OK', async () => {
  const { store } = await fixture();
  let seed = 12345;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed;
  };
  for (let sequence = 0; sequence < 500; sequence++) {
    let task = await store.begin({ ...input, max_attempts: 1 });
    const bad = random() % 2 === 0;
    await expect(store.finishValidation(task.task_id, evidence(task))).rejects.toMatchObject({ code: 'FKR-TSK-002' });
    task = await store.submit(task.task_id);
    if (bad) {
      await expect(
        store.finishValidation(task.task_id, evidence(task, 'COMPLETED', gates('fail'))),
      ).rejects.toMatchObject({ code: 'FKR-TSK-002' });
      task = await store.finishValidation(task.task_id, evidence(task, 'REJECTED', gates('fail')));
      expect(task.state).toBe('FAILED');
    } else {
      task = await store.finishValidation(task.task_id, evidence(task));
      expect(task.state).toBe('COMPLETED');
    }
    expect(await store.verifyLedger(task.task_id)).toBe(true);
  }
}, 60000);
for (const git of [false, true]) {
  it(`baseline ${git ? 'con' : 'sin'} git: sucios, añadidos, modificados, borrados y fuera de alcance`, async () => {
    const { root, store } = await fixture();
    await writeFile(join(root, 'inside.txt'), 'original');
    await writeFile(join(root, 'outside.md'), 'original');
    await writeFile(join(root, 'deleted.txt'), 'original');
    if (git) {
      await exec('git', ['init', '-q'], { cwd: root });
      await exec('git', ['add', '.'], { cwd: root });
      await exec('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'Inicial'], {
        cwd: root,
      });
    }
    await writeFile(join(root, 'inside.txt'), 'dirty');
    const task = await store.begin(input);
    expect(task.baseline.git_head !== null).toBe(git);
    expect(await store.diffSinceBaseline(task)).toEqual([]);
    await writeFile(join(root, 'inside.txt'), 'changed');
    await writeFile(join(root, 'outside.md'), 'changed');
    await writeFile(join(root, 'added.txt'), 'new');
    await writeFile(join(root, 'new.md'), 'outside');
    await unlink(join(root, 'deleted.txt'));
    expect(await store.diffSinceBaseline(task)).toEqual([
      { path: 'added.txt', change: 'added' },
      { path: 'deleted.txt', change: 'deleted' },
      { path: 'inside.txt', change: 'modified' },
      { path: 'new.md', change: 'added' },
      { path: 'outside.md', change: 'modified' },
    ]);
  });
}
it('infraestructura no ejecutable conserva intento y razón al desbloquear', async () => {
  const { store } = await fixture();
  let task = await store.begin(input);
  task = await store.submit(task.task_id);
  task = await store.finishValidation(task.task_id, evidence(task, 'BLOCKED', gates('blocked')), 'FKR-VAL-004');
  expect(task).toMatchObject({ state: 'BLOCKED', blocked_reason: 'FKR-VAL-004', attempt: 1 });
  task = await store.unblock(task.task_id, 'cli:test');
  expect(task.attempt).toBe(1);
});
it('los hashes incluyen binarios y secretos sin contenido; excluye estado interno', async () => {
  const { root, store } = await fixture();
  await writeFile(join(root, 'binary.txt'), Buffer.from([0, 255, 1]));
  await writeFile(join(root, '.env'), 'secret');
  const task = await store.begin(input);
  await writeFile(join(root, '.env'), 'secret changed');
  expect(await store.diffSinceBaseline(task)).toEqual([{ path: '.env', change: 'modified' }]);
  await writeFile(join(root, 'binary.txt'), Buffer.from([0, 255, 2]));
  expect(await store.diffSinceBaseline(task)).toEqual([
    { path: '.env', change: 'modified' },
    { path: 'binary.txt', change: 'modified' },
  ]);
});
it('BLOCKED → unblock → submit conserva evidencias y hashes en el mismo intento', async () => {
  const { root, store } = await fixture();
  let task = await store.begin(input);
  task = await store.submit(task.task_id);
  const first = evidence(task, 'BLOCKED', gates('blocked'));
  task = await store.finishValidation(task.task_id, first);
  task = await store.unblock(task.task_id, 'cli:test');
  task = await store.submit(task.task_id);
  const second = evidence(task);
  task = await store.finishValidation(task.task_id, second);
  expect(task).toMatchObject({ state: 'COMPLETED', attempt: 1 });
  expect(await store.verifyLedger(task.task_id)).toBe(true);
  const events = (await readFile(join(root, '.foker/tasks', `${task.task_id}.events.jsonl`), 'utf8'))
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  const refs = events.filter((event) => event.evidence_ref);
  expect(refs.map((event) => event.evidence_ref)).toEqual([
    `.foker/runs/${task.task_id}/1/evidence.json`,
    `.foker/runs/${task.task_id}/1/evidence.2.json`,
  ]);
  for (const [index, event] of refs.entries()) {
    const saved = JSON.parse(await readFile(join(root, event.evidence_ref), 'utf8'));
    expect(saved).toEqual([first, second][index]);
    expect(hashCanonicalJson(JSON.stringify(saved))).toBe(event.evidence_hash);
  }
});
it('alterar solo tree fuera del alcance bloquea submit por manipulación', async () => {
  const { root, store } = await fixture();
  await writeFile(join(root, 'outside.md'), 'original');
  const task = await store.begin(input);
  const path = join(root, '.foker/tasks', `${task.task_id}.baseline.json`);
  const baseline = JSON.parse(await readFile(path, 'utf8'));
  baseline.tree['outside.md'] = hashCanonicalJson('{}');
  await writeFile(path, JSON.stringify(baseline));
  await expect(store.diffSinceBaseline(task)).rejects.toMatchObject({ name: 'BaselineTamperedError' });
  expect(await store.submit(task.task_id)).toMatchObject({
    state: 'BLOCKED',
    blocked_reason: 'baseline_tampered',
    attempt: 1,
    last_gates: [{ gate: 'policy', status: 'blocked', findings: [] }],
  });
  expect(await store.verifyLedger(task.task_id)).toBe(true);
});
