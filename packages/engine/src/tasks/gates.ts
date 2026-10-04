import { mkdir, open, readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  type Engine,
  FokerError,
  hashCanonicalJson,
  matchGlobs,
  normalizePath,
  openEngine,
  PACKAGE_VERSION,
} from '@foker/core';
import { DEFAULT_POLICY, scanAddedLines, TrustStore } from '@foker/policy';
import {
  type CheckResult,
  type Finding,
  type FokerSkill,
  type GateResult,
  type ProjectMap,
  type TaskChange,
  type TaskEvidence,
  type TaskRecord,
  validate,
} from '@foker/schemas';
import { parse } from 'yaml';
import { loadConfig } from '../config.js';
import { type FindingParser, runProfileCheck } from '../findings/index.js';
import { gitDirtyFiles, gitRead } from '../git.js';
import { BaselineTamperedError, diffSinceBaseline, treeSnapshot } from './baseline.js';
import { TaskStore } from './index.js';

type Options = { trustBaseDir?: string; configPath?: string };
type Loaded = Awaited<ReturnType<typeof loadConfig>>;
const hash = (value: unknown) => hashCanonicalJson(JSON.stringify(value));
async function locked<T>(root: string, body: () => Promise<T>): Promise<T> {
  root = resolve(root);
  await mkdir(join(root, '.foker'), { recursive: true });
  const path = join(root, '.foker/validate.lock');
  const lock = await open(path, 'wx').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'EEXIST') throw new FokerError('FKR-VAL-003', 'Otra validación está en curso');
    throw error;
  });
  try {
    return await body();
  } finally {
    await lock.close();
    await unlink(path);
  }
}
async function affected(engine: Engine, paths: string[]) {
  const map = JSON.parse(await engine.exportMapJson()) as ProjectMap;
  if (map.project.workspace_kind === 'single') return [];
  const packages = new Set<string>();
  const visited = new Set<string>();
  const queue = [...paths];
  // Repetir el impacto limitado del núcleo cubre dependientes transitivos de cualquier profundidad.
  while (queue.length) {
    const batch = queue.splice(0, 20).filter((path) => !visited.has(path));
    if (!batch.length) continue;
    for (const path of batch) visited.add(path);
    const impact = engine.impact({ files: batch, direction: 'dependents', depth: 3 });
    for (const name of impact.packages) packages.add(name.replace(/^pkg:/, ''));
    queue.push(...impact.nodes.filter((node) => node.kind === 'file' && !visited.has(node.id)).map((node) => node.id));
  }
  for (const path of paths) {
    const containing = map.project.packages
      .filter((pkg) => pkg.path === '.' || path === pkg.path || path.startsWith(`${pkg.path}/`))
      .sort((a, b) => b.path.length - a.path.length)[0];
    if (containing) packages.add(containing.name);
  }
  return [...packages].sort();
}
async function refreshAffected(engine: Engine, paths: string[], deleted: string[]) {
  const previousFiles = deleted.filter((path) => engine.fileInfo(path) !== null);
  const previous = previousFiles.length ? await affected(engine, previousFiles) : [];
  const report = await engine.refresh();
  const packages = new Set([...previous, ...(await affected(engine, paths))]);
  const missing = deleted.filter((path) => !previousFiles.includes(path));
  if (missing.length) {
    const map = JSON.parse(await engine.exportMapJson()) as ProjectMap;
    const queue = missing.flatMap((path) => {
      const containing = map.project.packages
        .filter((pkg) => pkg.path === '.' || path === pkg.path || path.startsWith(`${pkg.path}/`))
        .sort((a, b) => b.path.length - a.path.length)[0];
      return containing ? [containing.id] : [];
    });
    const visited = new Set<string>();
    while (queue.length) {
      const id = queue.shift() as string;
      if (visited.has(id)) continue;
      visited.add(id);
      const pkg = map.project.packages.find((pkg) => pkg.id === id);
      if (pkg) packages.add(pkg.name);
      queue.push(
        ...map.edges.filter((edge) => edge.kind === 'package_depends' && edge.to === id).map((edge) => edge.from),
      );
    }
  }
  return { report, packages: [...packages].sort() };
}
async function execute(
  root: string,
  loaded: Loaded,
  names: string[],
  packages: string[],
  options: Options,
  gate: GateResult['gate'],
  secrets: Finding[] = [],
): Promise<GateResult> {
  for (const name of names)
    if (!loaded.config.validation.checks[name]) throw new FokerError('FKR-VAL-001', `Check inexistente: ${name}`);
  if (!(await new TrustStore(options.trustBaseDir).isTrusted(root, loaded.commandsHash)))
    return {
      gate,
      status: 'blocked',
      findings: [{ code: 'FKR-POL-010', message: 'Workspace no confiado' }],
      checks: [],
    };
  const checks: CheckResult[] = [];
  let blocked = false;
  for (const name of names) {
    const check = loaded.config.validation.checks[name];
    if (!check) continue;
    if ('run' in check) {
      const result = await runProfileCheck(
        { ...check, name, parser: (check.parser ?? 'generic') as FindingParser },
        { root, affectedPackages: packages, envAllowlist: loaded.policy.env_allowlist },
      );
      if (result.notExecuted) {
        blocked = true;
        result.findings.push({ code: 'FKR-VAL-004', message: `Check no ejecutado: ${name}` });
      } else if (result.status !== 'pass' && !result.findings.length)
        result.findings.push({ rule: 'check/failed', message: `Check ${name}: ${result.status}` });
      const { notExecuted: _, code: __, ...checked } = result;
      checks.push(checked);
    } else {
      checks.push({
        check: name,
        status: secrets.length ? 'fail' : 'pass',
        exit_code: secrets.length ? 1 : 0,
        duration_ms: 0,
        findings: secrets,
        output_tail: '',
      });
    }
  }
  return {
    gate,
    status: blocked ? 'blocked' : checks.every((c) => c.status === 'pass') ? 'pass' : 'fail',
    checks,
    findings: checks.flatMap((c) => c.findings),
  };
}
function profileChecks(loaded: Loaded, profile: string) {
  const found = loaded.config.validation.profiles[profile];
  if (!found) throw new FokerError('FKR-VAL-001', `Perfil inexistente: ${profile}`);
  return found.checks;
}
async function skillFor(root: string, task: TaskRecord): Promise<FokerSkill | null> {
  if (!task.skill) return null;
  if (!/^[a-z0-9][a-z0-9-]*$/.test(task.skill)) throw new FokerError('FKR-VAL-001', 'Nombre de skill inválido');
  const path = normalizePath(root, `foker/skills/${task.skill}/foker.skill.yaml`);
  const result = validate<FokerSkill>(
    'foker-skill',
    parse(
      await readFile(join(root, path), 'utf8').catch(() => {
        throw new FokerError('FKR-VAL-001', 'Skill inexistente');
      }),
    ),
  );
  if (!result.ok || result.value.name !== task.skill) throw new FokerError('FKR-VAL-001', 'Skill inválida');
  return result.value;
}
async function baselineText(root: string, task: Pick<TaskRecord, 'baseline'>, path: string) {
  if (!task.baseline.git_head || task.baseline.dirty_files.includes(path)) return null;
  return gitRead(root, ['show', `${task.baseline.git_head}:${path}`]);
}
async function added(root: string, task: Pick<TaskRecord, 'baseline'>, change: TaskChange) {
  if (change.change === 'deleted') return [];
  const text = await readFile(join(root, normalizePath(root, change.path)), 'utf8');
  if (change.change !== 'added' && (await baselineText(root, task, change.path)) !== null) {
    const diff = await gitRead(root, [
      'diff',
      '--no-color',
      '--text',
      '-U0',
      task.baseline.git_head as string,
      '--',
      change.path,
    ]);
    if (diff !== null) {
      let line = 0;
      let inHunk = false;
      const lines: { line: number; text: string }[] = [];
      for (const entry of diff.split('\n')) {
        const hunk = entry.match(/^@@ .* \+(\d+)/);
        if (hunk) {
          inHunk = true;
          line = Number(hunk[1]);
        } else if (inHunk && entry.startsWith('+')) lines.push({ line: line++, text: entry.slice(1) });
        else if (inHunk && entry.startsWith(' ')) line++;
      }
      if (inHunk) return lines;
    }
  }
  return text.split(/\r?\n/).map((text, i) => ({ line: i + 1, text }));
}
async function evaluate(root: string, task: TaskRecord, options: Options): Promise<TaskEvidence> {
  const started_at = new Date().toISOString();
  const gates: GateResult[] = [];
  let changes: TaskChange[] = [];
  let map_hash = hash({});
  try {
    changes = await diffSinceBaseline(root, task);
  } catch (error) {
    if (!(error instanceof BaselineTamperedError)) throw error;
    gates.push(
      { gate: 'scope', status: 'skipped', findings: [] },
      { gate: 'policy', status: 'blocked', findings: [{ rule: 'policy/baseline-tampered', message: error.message }] },
    );
  }
  if (!gates.length) {
    let loaded: Loaded;
    try {
      loaded = await loadConfig(root, options.configPath ? { configPath: options.configPath } : {});
      profileChecks(loaded, task.profile);
    } catch (error) {
      const configChange = changes.find(
        (change) =>
          change.path === (options.configPath ?? 'foker.config.yaml') &&
          matchGlobs(change.path, DEFAULT_POLICY.protected_paths),
      );
      if (!configChange) throw error;
      return {
        schema_version: 1,
        task_id: task.task_id,
        attempt: task.attempt,
        foker_version: PACKAGE_VERSION,
        started_at,
        finished_at: new Date().toISOString(),
        map_hash,
        changes,
        gates: [
          {
            gate: 'scope',
            status: matchGlobs(configChange.path, task.scope.paths) ? 'pass' : 'fail',
            findings: matchGlobs(configChange.path, task.scope.paths)
              ? []
              : [{ rule: 'scope/out-of-scope', file: configChange.path, message: 'Archivo fuera de alcance' }],
          },
          {
            gate: 'policy',
            status: 'blocked',
            findings: [
              {
                rule: 'policy/protected-path',
                file: configChange.path,
                message: 'Configuración protegida modificada o borrada; no se pueden cargar los checks',
              },
            ],
          },
          ...(['map', 'checks', 'skill'] as const).map((gate) => ({ gate, status: 'skipped' as const, findings: [] })),
        ],
        result: 'BLOCKED',
      };
    }
    const skill = await skillFor(root, task);
    const approvedPaths = new Set(
      task.approvals.some((a) => a.action === 'approve')
        ? task.last_gates.flatMap((gate) =>
            gate.findings
              .filter(
                (finding) =>
                  ['scope/out-of-scope', 'policy/approval-required'].includes(finding.rule ?? '') && finding.file,
              )
              .map((finding) => finding.file as string),
          )
        : [],
    );
    const scope: GateResult = { gate: 'scope', status: 'pass', findings: [] };
    const secretFindings: Finding[] = [];
    const policy: GateResult = { gate: 'policy', status: 'pass', findings: [] };
    for (const change of changes) {
      const inScope =
        matchGlobs(change.path, task.scope.paths) &&
        (!skill?.permissions.write_paths || matchGlobs(change.path, skill.permissions.write_paths));
      if (!inScope && !approvedPaths.has(change.path)) {
        const approval = change.change === 'deleted' && loaded.policy.approval_required.file_deletions_outside_scope;
        if (!approval || scope.status === 'pass') scope.status = approval ? 'approval_required' : 'fail';
        scope.findings.push({ file: change.path, rule: 'scope/out-of-scope', message: 'Archivo fuera de alcance' });
      }
      if (matchGlobs(change.path, loaded.policy.protected_paths)) {
        policy.status = 'blocked';
        policy.findings.push({ file: change.path, rule: 'policy/protected-path', message: 'Cambio en ruta protegida' });
      }
      const secrets = scanAddedLines([{ file: change.path, lines: await added(root, task, change) }]);
      secretFindings.push(...secrets);
      if (secrets.length) {
        policy.status = 'blocked';
        policy.findings.push(...secrets);
      }
      let dependencies = /(^|\/)(pnpm-lock.yaml|package-lock.json|yarn.lock)$/.test(change.path);
      if (/(^|\/)package.json$/.test(change.path)) {
        const before = await baselineText(root, task, change.path);
        const after = change.change === 'deleted' ? '{}' : await readFile(join(root, change.path), 'utf8');
        const extract = (text: string) =>
          Object.fromEntries(
            Object.entries(JSON.parse(text) as Record<string, unknown>).filter(([key]) => /dependencies/i.test(key)),
          );
        try {
          dependencies =
            before === null
              ? change.change !== 'added' || Object.keys(extract(after)).length > 0
              : hash(extract(before)) !== hash(extract(after));
        } catch {
          dependencies = true;
        }
      }
      if (
        !approvedPaths.has(change.path) &&
        (matchGlobs(change.path, loaded.policy.approval_required.paths) ||
          (loaded.policy.approval_required.dependency_changes && dependencies))
      ) {
        if (policy.status === 'pass') policy.status = 'approval_required';
        policy.findings.push({
          file: change.path,
          rule: 'policy/approval-required',
          message: 'Cambio requiere aprobación',
        });
      }
    }
    gates.push(scope, policy);
    let packages: string[] = [];
    try {
      const engine = await openEngine(root, loaded.mapConfig);
      const refreshed = await refreshAffected(
        engine,
        changes.map((c) => c.path),
        changes.filter((c) => c.change === 'deleted').map((c) => c.path),
      );
      map_hash = refreshed.report.contentHash;
      const findings = changes
        .filter((c) => engine.fileInfo(c.path)?.parseStatus === 'failed')
        .map((c) => ({ file: c.path, rule: 'map/parse-failed', message: 'Parseo fallido' }));
      packages = refreshed.packages;
      gates.push({ gate: 'map', status: findings.length ? 'fail' : 'pass', findings });
    } catch (error) {
      gates.push({
        gate: 'map',
        status: 'fail',
        findings: [{ rule: 'map/refresh-failed', message: (error as Error).message }],
      });
    }
    gates.push(
      await execute(root, loaded, profileChecks(loaded, task.profile), packages, options, 'checks', secretFindings),
    );
    gates.push(
      skill
        ? await execute(root, loaded, skill.validation.checks, packages, options, 'skill', secretFindings)
        : { gate: 'skill', status: 'skipped', findings: [] },
    );
  } else for (const gate of ['map', 'checks', 'skill'] as const) gates.push({ gate, status: 'skipped', findings: [] });
  const result = gates.some((g) => g.status === 'blocked')
    ? 'BLOCKED'
    : gates.some((g) => g.status === 'fail')
      ? 'REJECTED'
      : gates.some((g) => g.status === 'approval_required')
        ? 'AWAITING_APPROVAL'
        : 'COMPLETED';
  return {
    schema_version: 1,
    task_id: task.task_id,
    attempt: task.attempt,
    foker_version: PACKAGE_VERSION,
    started_at,
    finished_at: new Date().toISOString(),
    map_hash,
    changes,
    gates,
    result,
  };
}
export async function submitTask(root: string, taskId: string, options: Options & { summary?: string } = {}) {
  return locked(root, async () => {
    const store = new TaskStore(root);
    const initial = await store.get(taskId);
    if (initial.state !== 'RUNNING') throw new FokerError('FKR-TSK-002', 'Tarea no está RUNNING');
    // Preflight validates names without running processes; unusable protected config and
    // baseline tampering are handled by the gates so they still receive evidence.
    let changes: TaskChange[] | null;
    try {
      changes = await store.diffSinceBaseline(initial);
    } catch (error) {
      if (!(error instanceof BaselineTamperedError)) throw error;
      changes = null;
    }
    if (changes !== null) {
      try {
        const loaded = await loadConfig(root, options.configPath ? { configPath: options.configPath } : {});
        const skill = await skillFor(root, initial);
        for (const name of [...profileChecks(loaded, initial.profile), ...(skill?.validation.checks ?? [])])
          if (!loaded.config.validation.checks[name]) throw new FokerError('FKR-VAL-001', `Check inexistente: ${name}`);
      } catch (error) {
        if (
          !changes.some(
            (c) =>
              c.path === (options.configPath ?? 'foker.config.yaml') &&
              matchGlobs(c.path, DEFAULT_POLICY.protected_paths),
          )
        )
          throw error;
      }
    }
    const task = await store.submit(taskId, true);
    let evidence: TaskEvidence;
    try {
      evidence = await evaluate(root, task, options);
    } catch (error) {
      evidence = {
        schema_version: 1,
        task_id: taskId,
        attempt: task.attempt,
        foker_version: PACKAGE_VERSION,
        started_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
        map_hash: hash({}),
        changes: [],
        gates: ['scope', 'policy', 'map', 'checks', 'skill'].map((gate) => ({
          gate: gate as GateResult['gate'],
          status: gate === 'checks' ? 'blocked' : 'skipped',
          findings: gate === 'checks' ? [{ code: 'FKR-VAL-004', message: (error as Error).message }] : [],
        })),
        result: 'BLOCKED',
      };
    }
    // Baseline tampering is recorded by finishValidation, including immutable evidence.
    const reason =
      evidence.gates
        .filter((g) => g.status === 'blocked')
        .flatMap((g) => g.findings)
        .find((f) => f.code)?.code ??
      (evidence.gates.some((g) => g.findings.some((f) => f.rule === 'policy/baseline-tampered'))
        ? 'baseline_tampered'
        : 'validation');
    const record = await store.finishValidation(taskId, evidence, reason);
    const files = await readdir(join(root, `.foker/runs/${taskId}/${task.attempt}`));
    const refs = files
      .filter((f) => /^evidence(?:\.\d+)?\.json$/.test(f))
      .sort((a, b) => (Number(a.match(/\.(\d+)\./)?.[1]) || 1) - (Number(b.match(/\.(\d+)\./)?.[1]) || 1));
    return {
      task_id: taskId,
      state: evidence.result === 'REJECTED' && record.state === 'FAILED' ? 'FAILED' : evidence.result,
      attempt: task.attempt,
      gates: evidence.gates,
      evidence: `.foker/runs/${taskId}/${task.attempt}/${refs.at(-1)}`,
      next_action: record.next_action,
    };
  });
}
export async function validateProfile(
  root: string,
  options: Options & { profile: string; checks?: string[]; packages?: string[]; changed?: boolean },
) {
  return locked(root, async () => {
    const loaded = await loadConfig(root, options.configPath ? { configPath: options.configPath } : {});
    const names = profileChecks(loaded, options.profile);
    if (!(await new TrustStore(options.trustBaseDir).isTrusted(root, loaded.commandsHash)))
      throw new FokerError('FKR-POL-010', 'Workspace no confiado');
    let packages = options.packages ?? [];
    if (options.changed && !options.packages) {
      const engine = await openEngine(root, loaded.mapConfig);
      const paths = await gitDirtyFiles(root, true);
      const deleted = (
        await Promise.all(
          paths.map(async (path) => {
            try {
              await readFile(join(root, normalizePath(root, path)));
              return [];
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [path];
              throw error;
            }
          }),
        )
      ).flat();
      packages = (await refreshAffected(engine, paths, deleted)).packages;
    }
    const paths =
      (await gitRead(root, ['rev-parse', '--git-dir'])) === null
        ? Object.keys(await treeSnapshot(root))
        : await gitDirtyFiles(root, true);
    const baseline = {
      git_head: (await gitRead(root, ['rev-parse', 'HEAD']))?.trim() ?? null,
      dirty_files: [],
      snapshot_hash: hash({}),
    };
    const secretFindings = scanAddedLines(
      await Promise.all(
        paths.map(async (path) => ({
          file: path,
          lines: await added(
            root,
            { baseline },
            { path, change: (await gitRead(root, ['ls-files', '--', path]))?.trim() ? 'modified' : 'added' },
          ).catch((error: NodeJS.ErrnoException) => {
            if (error.code === 'ENOENT') return [];
            throw error;
          }),
        })),
      ),
    );
    const result = await execute(root, loaded, options.checks ?? names, packages, options, 'checks', secretFindings);
    await mkdir(join(root, '.foker/runs/adhoc'), { recursive: true });
    let timestamp = Date.now();
    let directory: string;
    for (;;) {
      directory = `.foker/runs/adhoc/${timestamp++}`;
      try {
        await mkdir(join(root, directory));
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      }
    }
    await writeFile(join(root, directory, 'checks.json'), `${JSON.stringify(result)}\n`, { flag: 'wx' });
    return { ...result, log: directory };
  });
}
export async function verifyTask(root: string, id: string, options: Options = {}) {
  return locked(root, async () => {
    const task = await new TaskStore(root).inspect(id);
    const events = (await readFile(join(root, `.foker/tasks/${id}.events.jsonl`), 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as { evidence_ref?: string });
    const ref = events.reverse().find((e) => e.evidence_ref)?.evidence_ref;
    const previous = ref ? (JSON.parse(await readFile(join(root, ref), 'utf8')) as TaskEvidence) : null;
    const evidence = await evaluate(root, { ...task, attempt: previous?.attempt ?? task.attempt }, options);
    const comparable = (e: TaskEvidence) => ({
      changes: e.changes,
      map_hash: e.map_hash,
      result: e.result,
      gates: e.gates.map((g) => ({ ...g, checks: g.checks?.map(({ duration_ms: _, ...c }) => c) })),
    });
    return {
      task_id: id,
      matches: previous !== null && hash(comparable(previous)) === hash(comparable(evidence)),
      evidence,
    };
  });
}
