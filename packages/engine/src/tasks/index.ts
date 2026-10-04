import { appendFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { FokerError, hashCanonicalJson, matchGlobs, normalizePath } from '@foker/core';
import { DEFAULT_POLICY } from '@foker/policy';
import {
  type FokerTaskBeginInput,
  type TaskEvent,
  type TaskEvidence,
  type TaskRecord,
  type TaskState,
  validate,
} from '@foker/schemas';
import { BaselineTamperedError, captureBaseline, diffSinceBaseline } from './baseline.js';
import { assertTransition, nextAction } from './fsm.js';
import { atomicJson, withLock } from './storage.js';
import { taskId } from './ulid.js';

export { BaselineTamperedError, diffSinceBaseline } from './baseline.js';
export { assertTransition, nextAction, TRANSITIONS } from './fsm.js';
export { taskId } from './ulid.js';

const hash = (value: unknown) => hashCanonicalJson(JSON.stringify(value));
const terminal = (state: TaskState) => ['COMPLETED', 'FAILED', 'CANCELLED'].includes(state);
function checked(ref: 'task' | 'task#/$defs/event' | 'task#/$defs/evidence', value: unknown) {
  const result = validate(ref, value);
  if (!result.ok) throw new FokerError('FKR-INP-001', JSON.stringify(result.issues));
}
export interface TaskStoreOptions {
  clock?: () => number;
  random?: (size: number) => Uint8Array;
  actor?: string;
  maxActive?: number;
}
/** Persistencia y FSM; el ejecutor de gates entrega evidencia a finishValidation. */
export class TaskStore {
  readonly root: string;
  private readonly clock: () => number;
  private readonly actor: string;
  constructor(
    root: string,
    private readonly options: TaskStoreOptions = {},
  ) {
    this.root = resolve(root);
    this.clock = options.clock ?? Date.now;
    this.actor = options.actor ?? 'foker';
  }
  private path(id: string, suffix = '.json') {
    if (!/^tsk_[0-9A-HJKMNP-TV-Z]{26}$/.test(id)) throw new FokerError('FKR-TSK-001', 'Tarea inexistente');
    return join(this.root, '.foker/tasks', `${id}${suffix}`);
  }
  private now() {
    return new Date(this.clock()).toISOString();
  }
  private async read(id: string): Promise<TaskRecord> {
    try {
      const task = JSON.parse(await readFile(this.path(id), 'utf8')) as TaskRecord;
      checked('task', task);
      return task;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new FokerError('FKR-TSK-001', 'Tarea inexistente');
      throw error;
    }
  }
  private async save(task: TaskRecord) {
    checked('task', task);
    await atomicJson(this.path(task.task_id), task);
  }
  private async events(id: string): Promise<TaskEvent[]> {
    return (await readFile(this.path(id, '.events.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as TaskEvent);
  }
  private async record(
    task: TaskRecord,
    from: TaskState | null,
    actor: string,
    reason: string | null,
    evidence?: { ref: string; hash: string },
  ) {
    const previous = from === null ? [] : await this.events(task.task_id);
    const event: TaskEvent = {
      ts: task.updated_at,
      task_id: task.task_id,
      from,
      to: task.state,
      actor,
      reason,
      evidence_ref: evidence?.ref ?? null,
      prev_hash: previous.length ? hash(previous[previous.length - 1]) : null,
      ...(evidence ? { evidence_hash: evidence.hash } : {}),
    };
    checked('task#/$defs/event', event);
    await appendFile(this.path(task.task_id, '.events.jsonl'), `${JSON.stringify(event)}\n`);
    await this.save(task);
    // Ancla separada para detectar truncamiento, incluso si el último evento vuelve al mismo estado.
    await atomicJson(this.path(task.task_id, '.integrity.json'), { count: previous.length + 1, hash: hash(event) });
  }
  private async move(
    task: TaskRecord,
    to: TaskState,
    actor = 'foker',
    reason: string | null = null,
    evidence?: { ref: string; hash: string },
    stale = false,
  ) {
    const from = task.state;
    if (!(stale && from === 'RUNNING' && to === 'BLOCKED')) assertTransition(from, to);
    task.state = to;
    task.updated_at = this.now();
    task.last_activity_at = task.updated_at;
    task.next_action = nextAction(to, task.attempt);
    task.blocked_reason = to === 'BLOCKED' ? reason : null;
    await this.record(task, from, actor, reason, evidence);
  }
  private async expire(task: TaskRecord) {
    if (task.state === 'RUNNING' && this.clock() - Date.parse(task.last_activity_at ?? task.updated_at) >= 4 * 3600000)
      await this.move(task, 'BLOCKED', 'foker', 'stale', undefined, true);
    return task;
  }
  inspect(id: string) {
    return this.read(id);
  }
  async get(id: string): Promise<TaskRecord> {
    return withLock(this.path(id, '.lock'), async () => this.expire(await this.read(id)));
  }
  async list(): Promise<TaskRecord[]> {
    let names: string[];
    try {
      names = await readdir(join(this.root, '.foker/tasks'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
    const tasks: TaskRecord[] = [];
    for (const name of names.sort())
      if (/^tsk_[0-9A-HJKMNP-TV-Z]{26}\.json$/.test(name)) tasks.push(await this.get(name.slice(0, -5)));
    return tasks;
  }
  async begin(input: FokerTaskBeginInput): Promise<TaskRecord> {
    const normalized = {
      description: input.description,
      scope: input.scope,
      profile: input.profile ?? 'default',
      skill: input.skill ?? null,
      max_attempts: input.max_attempts ?? 3,
      client_token: input.client_token ?? null,
    };
    return withLock(join(this.root, '.foker/tasks/begin.lock'), async () => {
      const tasks = await this.list();
      if (normalized.client_token !== null) {
        const existing = tasks.find((task) => task.client_token === normalized.client_token);
        if (existing) {
          const original = {
            description: existing.description,
            scope: existing.scope,
            profile: existing.profile,
            skill: existing.skill ?? null,
            max_attempts: existing.max_attempts,
            client_token: existing.client_token,
          };
          if (hash(original) !== hash(normalized))
            throw new FokerError('FKR-INP-001', 'client_token usado con otra entrada');
          return existing;
        }
      }
      const id = taskId(this.clock(), this.options.random);
      const now = this.now();
      const task: TaskRecord = {
        schema_version: 1,
        task_id: id,
        state: 'RUNNING',
        ...normalized,
        attempt: 1,
        created_at: now,
        updated_at: now,
        last_activity_at: now,
        created_by: this.actor,
        baseline: { git_head: null, dirty_files: [], snapshot_hash: hash({}) },
        approvals: [],
        last_gates: [],
        next_action: 'work_and_submit',
      };
      checked('task', task);
      for (const path of input.scope.paths) {
        normalizePath(this.root, path);
        matchGlobs('validation', [path]);
      }
      if (
        tasks.filter((task) => !terminal(task.state)).length >=
        (this.options.maxActive ?? DEFAULT_POLICY.tasks.max_active)
      )
        throw new FokerError('FKR-TSK-005', 'Demasiadas tareas activas');
      try {
        await readFile(this.path(id));
        throw new FokerError('FKR-INT-001', 'Colisión de ULID');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      task.baseline = await captureBaseline(this.root, id, input.scope.paths);
      await this.record(task, null, this.actor, 'begin');
      return task;
    });
  }
  private async mutate(id: string, body: (task: TaskRecord) => Promise<void>) {
    return withLock(this.path(id, '.lock'), async () => {
      const task = await this.expire(await this.read(id));
      await body(task);
      return task;
    });
  }
  async touch(id: string) {
    return this.mutate(id, async (task) => {
      task.last_activity_at = this.now();
      await this.save(task);
    });
  }
  async cancel(id: string) {
    return this.mutate(id, async (task) => this.move(task, 'CANCELLED', this.actor, 'cancel'));
  }
  async submit(id: string, deferBaselineCheck = false) {
    return this.mutate(id, async (task) => {
      await this.move(task, 'VALIDATING', this.actor, 'submit');
      if (!deferBaselineCheck) {
        try {
          await diffSinceBaseline(this.root, task);
        } catch (error) {
          if (!(error instanceof BaselineTamperedError)) throw error;
          task.last_gates = [{ gate: 'policy', status: 'blocked', findings: [] }];
          await this.move(task, 'BLOCKED', 'foker', 'baseline_tampered');
        }
      }
    });
  }
  async finishValidation(id: string, evidence: TaskEvidence, blockedReason = 'validation'): Promise<TaskRecord> {
    return this.mutate(id, async (task) => {
      assertTransition(task.state, evidence.result);
      checked('task#/$defs/evidence', evidence);
      if (task.state !== 'VALIDATING' || evidence.task_id !== id || evidence.attempt !== task.attempt)
        throw new FokerError('FKR-TSK-002', 'Resultado no pertenece al intento en validación');
      const gates = ['scope', 'policy', 'map', 'checks', 'skill'];
      const ok =
        evidence.gates.length === 5 &&
        gates.every((gate) => evidence.gates.filter((g) => g.gate === gate).length === 1) &&
        evidence.gates.every(
          (g) => g.status === 'pass' || (g.gate === 'skill' && !task.skill && g.status === 'skipped'),
        );
      const approvalOk =
        evidence.gates.length === 5 &&
        gates.every((gate) => evidence.gates.filter((g) => g.gate === gate).length === 1) &&
        evidence.gates.some((g) => g.status === 'approval_required') &&
        evidence.gates.every(
          (g) =>
            ['pass', 'approval_required'].includes(g.status) ||
            (g.gate === 'skill' && !task.skill && g.status === 'skipped'),
        );
      if ((evidence.result === 'COMPLETED' && !ok) || (evidence.result === 'AWAITING_APPROVAL' && !approvalOk))
        throw new FokerError('FKR-TSK-002', 'Gates no permiten el resultado');
      const directory = `.foker/runs/${id}/${task.attempt}`;
      await mkdir(join(this.root, directory), { recursive: true });
      let ref: string;
      for (let sequence = 1; ; sequence++) {
        ref = `${directory}/evidence${sequence === 1 ? '' : `.${sequence}`}.json`;
        try {
          await writeFile(join(this.root, ref), `${JSON.stringify(evidence)}\n`, { flag: 'wx' });
          break;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        }
      }
      task.last_gates = evidence.gates;
      await this.move(task, evidence.result, 'foker', evidence.result === 'BLOCKED' ? blockedReason : null, {
        ref,
        hash: hash(evidence),
      });
      await this.retry(task);
    });
  }
  private async retry(task: TaskRecord) {
    if (task.state !== 'REJECTED') return;
    if (task.attempt < task.max_attempts) {
      task.attempt++;
      await this.move(task, 'RUNNING', 'foker', 'retry');
    } else await this.move(task, 'FAILED', 'foker', 'attempts_exhausted');
  }
  private async human(
    id: string,
    action: 'approve' | 'reject' | 'unblock',
    actor: string,
    reason?: string,
    scope?: TaskRecord['scope'],
  ) {
    if (!/^cli:.+/.test(actor)) throw new FokerError('FKR-INP-001', 'Se requiere actor humano cli:<usuario>');
    return this.mutate(id, async (task) => {
      const to = action === 'approve' ? 'COMPLETED' : action === 'reject' ? 'REJECTED' : 'RUNNING';
      if (task.state !== (action === 'unblock' ? 'BLOCKED' : 'AWAITING_APPROVAL'))
        throw new FokerError('FKR-TSK-002', 'Acción humana no permitida');
      if (scope) {
        checked('task', { ...task, scope });
        for (const path of scope.paths) {
          normalizePath(this.root, path);
          matchGlobs('validation', [path]);
        }
        task.scope = scope;
      }
      task.approvals.push({
        action,
        actor,
        at: this.now(),
        ...(scope ? { scope } : {}),
        ...(reason === undefined ? {} : { reason }),
      });
      await this.move(task, to, actor, reason ?? action);
      await this.retry(task);
    });
  }
  approve(id: string, actor: string, reason?: string) {
    return this.human(id, 'approve', actor, reason);
  }
  reject(id: string, actor: string, reason?: string) {
    return this.human(id, 'reject', actor, reason);
  }
  unblock(id: string, actor: string, reason?: string, scope?: TaskRecord['scope']) {
    return this.human(id, 'unblock', actor, reason, scope);
  }
  diffSinceBaseline(task: TaskRecord) {
    return diffSinceBaseline(this.root, task);
  }
  async verifyLedger(id: string): Promise<boolean> {
    return withLock(this.path(id, '.lock'), async () => {
      const task = await this.read(id);
      try {
        const events = await this.events(id);
        const anchor = JSON.parse(await readFile(this.path(id, '.integrity.json'), 'utf8')) as {
          count: number;
          hash: string;
        };
        if (!events.length || anchor.count !== events.length || anchor.hash !== hash(events[events.length - 1]))
          return false;
        for (let i = 0; i < events.length; i++) {
          const event = events[i];
          if (
            !event ||
            !validate('task#/$defs/event', event).ok ||
            event.task_id !== id ||
            event.prev_hash !== (i ? hash(events[i - 1]) : null) ||
            event.from !== (i ? events[i - 1]?.to : null)
          )
            return false;
          if (event.from !== null && !(event.from === 'RUNNING' && event.to === 'BLOCKED' && event.reason === 'stale'))
            assertTransition(event.from, event.to);
          if (i === 0 && event.to !== 'RUNNING') return false;
          if (event.evidence_ref) {
            if (
              !/^[1-5]$/.test(event.evidence_ref.split('/')[3] ?? '') ||
              event.evidence_ref.split('/').slice(0, 3).join('/') !== `.foker/runs/${id}` ||
              event.evidence_ref.split('/').length !== 5 ||
              !/^evidence(\.[0-9]+)?\.json$/.test(event.evidence_ref.split('/')[4] ?? '')
            )
              return false;
            const evidence = JSON.parse(await readFile(join(this.root, event.evidence_ref), 'utf8')) as unknown;
            if (!validate('task#/$defs/evidence', evidence).ok || hash(evidence) !== event.evidence_hash) return false;
          }
        }
        return events[events.length - 1]?.to === task.state;
      } catch {
        return false;
      }
    });
  }
}

export { submitTask, validateProfile, verifyTask } from './gates.js';
