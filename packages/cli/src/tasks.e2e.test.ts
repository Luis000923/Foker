import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import * as core from '@foker/core';
import { loadConfig, submitTask, TaskStore, TrustStore, validateProfile, verifyTask } from '@foker/engine';
import { validate } from '@foker/schemas';
import { afterEach, expect, it, vi } from 'vitest';
import { stringify } from 'yaml';
import { main } from './main.js';

const exec = promisify(execFile);
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function fixture(trusted = true, missing = false) {
  const root = await mkdtemp(join(tmpdir(), 'foker-gates-'));
  const trustBaseDir = await mkdtemp(join(tmpdir(), 'foker-trust-'));
  roots.push(root, trustBaseDir);
  await exec('git', ['init', '-q'], { cwd: root });
  const config = stringify({
    version: 1,
    validation: {
      profiles: { default: { checks: ['test'] } },
      checks: {
        test: {
          run: missing
            ? ['foker-nonexistent-binary']
            : [
                process.execPath,
                '-e',
                "const fs=require('node:fs');if(fs.readFileSync('agent.txt','utf8').includes('broken')){console.error('error: simulated test failure');process.exit(1)}",
              ],
        },
      },
    },
  });
  await writeFile(join(root, 'foker.config.yaml'), config);
  await writeFile(join(root, 'agent.txt'), 'initial');
  await writeFile(join(root, 'package.json'), '{"name":"fixture","version":"1.0.0"}');
  await exec('git', ['add', '.'], { cwd: root });
  await exec('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'baseline'], {
    cwd: root,
  });
  if (trusted) await new TrustStore(trustBaseDir).approve(root, (await loadConfig(root)).commandsHash);
  const store = new TaskStore(root);
  const task = await store.begin({
    description: 'Agente simulado',
    scope: { paths: ['agent.txt', 'package.json', 'foker.config.yaml'] },
  });
  return { root, trustBaseDir, store, task, config };
}
async function submit(f: Awaited<ReturnType<typeof fixture>>) {
  const result = await submitTask(f.root, f.task.task_id, { trustBaseDir: f.trustBaseDir });
  const evidence = JSON.parse(await readFile(join(f.root, result.evidence), 'utf8'));
  expect(validate('task#/$defs/evidence', evidence)).toMatchObject({ ok: true });
  expect(await f.store.verifyLedger(f.task.task_id)).toBe(true);
  return result;
}
it('REQ-TSK-001: test roto rechaza y agente corregido completa; verify reejecuta sin mutar', async () => {
  const f = await fixture();
  await writeFile(join(f.root, 'agent.txt'), 'broken');
  const first = await submit(f);
  expect(first.state).toBe('REJECTED');
  expect(first.gates.find((g) => g.gate === 'checks')?.findings.length).toBeGreaterThan(0);
  expect((await f.store.get(f.task.task_id)).attempt).toBe(2);
  await writeFile(join(f.root, 'agent.txt'), 'fixed');
  expect((await submit(f)).state).toBe('COMPLETED');
  const record = await readFile(join(f.root, `.foker/tasks/${f.task.task_id}.json`), 'utf8');
  expect((await verifyTask(f.root, f.task.task_id, { trustBaseDir: f.trustBaseDir })).matches).toBe(true);
  expect(await readFile(join(f.root, `.foker/tasks/${f.task.task_id}.json`), 'utf8')).toBe(record);
});
it('cambio fuera del alcance rechaza por archivo', async () => {
  const f = await fixture();
  await writeFile(join(f.root, 'outside.txt'), 'new');
  expect(await submit(f)).toMatchObject({
    state: 'REJECTED',
    gates: expect.arrayContaining([
      expect.objectContaining({
        gate: 'scope',
        findings: expect.arrayContaining([
          expect.objectContaining({ rule: 'scope/out-of-scope', file: 'outside.txt' }),
        ]),
      }),
    ]),
  });
});
it('secreto añadido bloquea', async () => {
  const f = await fixture();
  await writeFile(join(f.root, 'agent.txt'), 'AK' + 'IA' + 'A1B2C3D4E5F6G7H8');
  expect(await submit(f)).toMatchObject({
    state: 'BLOCKED',
    gates: expect.arrayContaining([
      expect.objectContaining({
        gate: 'policy',
        findings: expect.arrayContaining([expect.objectContaining({ rule: 'secret/aws-access-key' })]),
      }),
    ]),
  });
});
it('secreto precedido de ++ dentro de un hunk bloquea', async () => {
  const f = await fixture();
  await writeFile(join(f.root, 'agent.txt'), '++' + 'AK' + 'IA' + 'A1B2C3D4E5F6G7H8' + '\n');
  expect(await submit(f)).toMatchObject({
    state: 'BLOCKED',
    gates: expect.arrayContaining([
      expect.objectContaining({
        gate: 'policy',
        findings: expect.arrayContaining([
          expect.objectContaining({ rule: 'secret/aws-access-key', file: 'agent.txt', line: 1 }),
        ]),
      }),
    ]),
  });
});
for (const binary of ['attribute', 'nul'] as const)
  it(`secreto en archivo binario bloquea: ${binary}`, async () => {
    const f = await fixture();
    if (binary !== 'nul') await writeFile(join(f.root, '.gitattributes'), 'agent.txt binary\n');
    if (binary === 'nul') await writeFile(join(f.root, 'agent.txt'), 'initial\0\n');
    await exec('git', ['add', '.'], { cwd: f.root });
    await exec(
      'git',
      ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'binary', '--allow-empty'],
      { cwd: f.root },
    );
    const task = await f.store.begin({ description: 'binary secret', scope: { paths: ['agent.txt'] } });
    const secret = 'AK' + 'IA' + 'A1B2C3D4E5F6G7H8';
    await writeFile(join(f.root, 'agent.txt'), `${binary === 'nul' ? 'initial\0\n' : ''}${secret}\n`);
    expect(await submit({ ...f, task })).toMatchObject({
      state: 'BLOCKED',
      gates: expect.arrayContaining([
        expect.objectContaining({
          gate: 'policy',
          findings: expect.arrayContaining([
            expect.objectContaining({ rule: 'secret/aws-access-key', file: 'agent.txt' }),
          ]),
        }),
      ]),
    });
  });
it('dependencias requieren aprobación TTY; sin TTY incluso --yes sale 6', async () => {
  const f = await fixture();
  await writeFile(join(f.root, 'package.json'), '{"name":"fixture","dependencies":{"demo":"1.0.0"}}');
  expect((await submit(f)).state).toBe('AWAITING_APPROVAL');
  let output = '';
  const args = ['task', 'approve', f.task.task_id, '--cwd', f.root, '--json'];
  expect(
    await main(
      [...args, '--yes'],
      {},
      {
        isTTY: false,
        stdout: (s) => {
          output += s;
        },
        stderr: () => {},
      },
    ),
  ).toBe(6);
  expect((await f.store.get(f.task.task_id)).state).toBe('AWAITING_APPROVAL');
  output = '';
  expect(
    await main(
      args,
      {},
      {
        isTTY: true,
        confirm: async () => true,
        stdout: (s) => {
          output += s;
        },
        stderr: () => {},
      },
    ),
  ).toBe(0);
  expect(JSON.parse(output).data.state).toBe('COMPLETED');
  expect(await f.store.verifyLedger(f.task.task_id)).toBe(true);
  await writeFile(join(f.root, 'unapproved.txt'), 'new file after approval');
  const verified = await verifyTask(f.root, f.task.task_id, { trustBaseDir: f.trustBaseDir });
  expect(verified.evidence.gates.find((g) => g.gate === 'scope')).toMatchObject({
    status: 'fail',
    findings: [expect.objectContaining({ file: 'unapproved.txt', rule: 'scope/out-of-scope' })],
  });
  expect((await f.store.get(f.task.task_id)).state).toBe('COMPLETED');
  expect(await f.store.verifyLedger(f.task.task_id)).toBe(true);
});
it('archivo protegido bloquea', async () => {
  const f = await fixture();
  await writeFile(join(f.root, 'foker.config.yaml'), `${f.config}\n# modified\n`);
  expect(await submit(f)).toMatchObject({
    state: 'BLOCKED',
    gates: expect.arrayContaining([
      expect.objectContaining({
        gate: 'policy',
        findings: expect.arrayContaining([expect.objectContaining({ rule: 'policy/protected-path' })]),
      }),
    ]),
  });
});
for (const [trusted, missing, code] of [
  [false, false, 'FKR-POL-010'],
  [true, true, 'FKR-VAL-004'],
] as const)
  it(`${code} bloquea sin consumir intento`, async () => {
    const f = await fixture(trusted, missing);
    const result = await submit(f);
    expect(result.state).toBe('BLOCKED');
    expect(await f.store.get(f.task.task_id)).toMatchObject({ state: 'BLOCKED', attempt: 1, blocked_reason: code });
    expect(result.gates.flatMap((g) => g.findings)).toContainEqual(expect.objectContaining({ code }));
  });
it('validate ad hoc no toca tareas; perfil inexistente y lock concurrente', async () => {
  const f = await fixture();
  const before = await readFile(join(f.root, `.foker/tasks/${f.task.task_id}.json`), 'utf8');
  expect(await validateProfile(f.root, { profile: 'default', trustBaseDir: f.trustBaseDir })).toMatchObject({
    status: 'pass',
    log: expect.stringContaining('.foker/runs/adhoc/'),
  });
  expect(await readFile(join(f.root, `.foker/tasks/${f.task.task_id}.json`), 'utf8')).toBe(before);
  await expect(validateProfile(f.root, { profile: 'unknown' })).rejects.toMatchObject({ code: 'FKR-VAL-001' });
  await writeFile(join(f.root, '.foker/validate.lock'), 'held');
  await expect(submitTask(f.root, f.task.task_id)).rejects.toMatchObject({ code: 'FKR-VAL-003' });
});
it('baseline manipulada bloquea y enlaza evidencia inmutable', async () => {
  const f = await fixture();
  await writeFile(join(f.root, `.foker/tasks/${f.task.task_id}.baseline.json`), '{}');
  expect((await submit(f)).state).toBe('BLOCKED');
  expect(await f.store.get(f.task.task_id)).toMatchObject({ blocked_reason: 'baseline_tampered', attempt: 1 });
});
it('borrado fuera de alcance requiere aprobación', async () => {
  const f = await fixture();
  await writeFile(join(f.root, 'outside.txt'), 'original');
  const task = await f.store.begin({ description: 'delete', scope: { paths: ['agent.txt'] } });
  await unlink(join(f.root, 'outside.txt'));
  expect((await submit({ ...f, task })).state).toBe('AWAITING_APPROVAL');
});
it('solo líneas añadidas: secreto preexistente no bloquea; fallback sin git sí detecta secretos', async () => {
  const f = await fixture();
  const secret = 'AK' + 'IA' + 'A1B2C3D4E5F6G7H8';
  await writeFile(join(f.root, 'agent.txt'), `${secret}\nold\n`);
  await exec('git', ['add', 'agent.txt'], { cwd: f.root });
  await exec('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'preexisting'], {
    cwd: f.root,
  });
  const task = await f.store.begin({ description: 'lines', scope: { paths: ['agent.txt'] } });
  await writeFile(join(f.root, 'agent.txt'), `${secret}\nnew\n`);
  expect((await submit({ ...f, task })).state).toBe('COMPLETED');
  await rm(join(f.root, '.git'), { recursive: true });
  const noGit = await f.store.begin({ description: 'no git', scope: { paths: ['agent.txt', '.env'] } });
  await writeFile(join(f.root, '.env'), secret);
  expect((await submit({ ...f, task: noGit })).state).toBe('BLOCKED');
});
it('G5 ejecuta checks de skill y sus permisos solo restringen el alcance', async () => {
  const f = await fixture();
  await mkdir(join(f.root, 'foker/skills/demo'), { recursive: true });
  const sidecar = {
    schema_version: 1,
    name: 'demo',
    version: '0.1.0',
    purpose: 'test',
    triggers: { keywords: ['demo'] },
    constraints: [],
    tools: ['foker_check'],
    workflow_ref: 'SKILL.md',
    validation: { checks: ['test'] },
    outputs: [{ kind: 'modified_files' }],
    permissions: { write_paths: ['agent.txt'] },
  };
  await writeFile(join(f.root, 'foker/skills/demo/foker.skill.yaml'), stringify(sidecar));
  const task = await f.store.begin({
    description: 'skill',
    scope: { paths: ['agent.txt', 'extra.txt'] },
    skill: 'demo',
  });
  await writeFile(join(f.root, 'agent.txt'), 'fixed');
  expect((await submit({ ...f, task })).gates.find((g) => g.gate === 'skill')).toMatchObject({
    status: 'pass',
    checks: [expect.objectContaining({ check: 'test' })],
  });
  const restricted = await f.store.begin({
    description: 'restricted',
    scope: { paths: ['agent.txt', 'extra.txt'] },
    skill: 'demo',
  });
  await writeFile(join(f.root, 'extra.txt'), 'outside skill');
  expect((await submit({ ...f, task: restricted })).state).toBe('REJECTED');
  const unknown = await f.store.begin({ description: 'unknown', scope: { paths: ['agent.txt'] }, skill: 'demo' });
  await writeFile(
    join(f.root, 'foker/skills/demo/foker.skill.yaml'),
    stringify({ ...sidecar, validation: { checks: ['missing'] } }),
  );
  await expect(submitTask(f.root, unknown.task_id, { trustBaseDir: f.trustBaseDir })).rejects.toMatchObject({
    code: 'FKR-VAL-001',
  });
  expect((await f.store.get(unknown.task_id)).state).toBe('RUNNING');
});
it('approve exige --ci explícito y CI=true; rechazar confirmación no muta', async () => {
  const f = await fixture();
  await writeFile(join(f.root, 'package.json'), '{"dependencies":{"demo":"1.0.0"}}');
  await submit(f);
  const args = ['task', 'approve', f.task.task_id, '--cwd', f.root];
  const io = { isTTY: false, stdout: () => {}, stderr: () => {} };
  expect(await main(args, { CI: 'true' }, io)).toBe(6);
  expect(await main([...args, '--ci'], {}, io)).toBe(6);
  expect(await main(args, {}, { ...io, isTTY: true, confirm: async () => false })).toBe(6);
  expect(await main([...args, '--ci'], { CI: 'true' }, io)).toBe(0);
  expect(await f.store.verifyLedger(f.task.task_id)).toBe(true);
});
it('ad hoc builtin secret-scan falla con líneas añadidas y trust es obligatorio', async () => {
  const f = await fixture();
  await writeFile(
    join(f.root, 'foker.config.yaml'),
    stringify({
      version: 1,
      validation: { profiles: { default: { checks: ['secrets'] } }, checks: { secrets: { builtin: 'secret-scan' } } },
    }),
  );
  await expect(validateProfile(f.root, { profile: 'default', trustBaseDir: f.trustBaseDir })).rejects.toMatchObject({
    code: 'FKR-POL-010',
  });
  await new TrustStore(f.trustBaseDir).approve(f.root, (await loadConfig(f.root)).commandsHash);
  await writeFile(join(f.root, 'agent.txt'), 'AK' + 'IA' + 'A1B2C3D4E5F6G7H8');
  expect(await validateProfile(f.root, { profile: 'default', trustBaseDir: f.trustBaseDir })).toMatchObject({
    status: 'fail',
    findings: expect.arrayContaining([expect.objectContaining({ rule: 'secret/aws-access-key' })]),
  });
});
it('affected_packages incluye contenedores y dependientes con nombres npm; baseline sucia exige aprobación conservadora', async () => {
  const f = await fixture();
  await cp(new URL('../../../fixtures/monorepo-pnpm/', import.meta.url), f.root, { recursive: true });
  const config = {
    version: 1,
    validation: {
      profiles: { default: { checks: ['argv'] } },
      checks: {
        argv: {
          run: [
            process.execPath,
            '-e',
            "require('node:fs').writeFileSync('.foker/argv.json',JSON.stringify(process.argv.slice(1)))",
            '--',
            '$' + '{affected_packages}',
          ],
        },
      },
    },
  };
  await writeFile(join(f.root, 'foker.config.yaml'), stringify(config));
  await new TrustStore(f.trustBaseDir).approve(f.root, (await loadConfig(f.root)).commandsHash);
  const task = await f.store.begin({ description: 'impact', scope: { paths: ['packages/ui/**'] } });
  const path = join(f.root, 'packages/ui/src/button.tsx');
  await writeFile(path, `${await readFile(path, 'utf8')}\n// changed\n`);
  expect((await submit({ ...f, task })).state).toBe('COMPLETED');
  expect(JSON.parse(await readFile(join(f.root, '.foker/argv.json'), 'utf8'))).toEqual([
    '--filter=@mono/ui',
    '--filter=@mono/web',
  ]);
  const metadata = await f.store.begin({ description: 'metadata', scope: { paths: ['package.json'] } });
  // The baseline package is dirty relative to HEAD: fall back conservatively when content is unavailable.
  await writeFile(join(f.root, 'package.json'), '{"name":"new-name"}');
  const result = await submit({ ...f, task: metadata });
  expect(result.state).toBe('AWAITING_APPROVAL');
});
for (const saved of [false, true])
  it(`affected_packages conserva dependientes al borrar un archivo; mapa previo: ${saved}`, async () => {
    const f = await fixture();
    await cp(new URL('../../../fixtures/monorepo-pnpm/', import.meta.url), f.root, { recursive: true });
    const config = {
      version: 1,
      validation: {
        profiles: { default: { checks: ['argv'] } },
        checks: {
          argv: {
            run: [
              process.execPath,
              '-e',
              "require('node:fs').writeFileSync('.foker/argv.json',JSON.stringify(process.argv.slice(1)))",
              '--',
              '$' + '{affected_packages}',
            ],
          },
        },
      },
    };
    await writeFile(join(f.root, 'foker.config.yaml'), stringify(config));
    await new TrustStore(f.trustBaseDir).approve(f.root, (await loadConfig(f.root)).commandsHash);
    const path = 'packages/ui/src/button.tsx';
    // Import directo: el mapa previo conserva esta arista aunque desaparezca el archivo.
    await writeFile(
      join(f.root, 'apps/web/src/app/page.tsx'),
      // Concatenado para que la regla de dependencias no lo tome por un import del test.
      'export { Button } from ' + "'../../../../packages/ui/src/button';\n",
    );
    if (saved) {
      const manifestPath = join(f.root, 'apps/web/package.json');
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
      delete manifest.dependencies['@mono/ui'];
      await writeFile(manifestPath, JSON.stringify(manifest));
      const engine = await core.openEngine(f.root);
      await engine.refresh();
      await engine.save();
    }
    const task = await f.store.begin({ description: 'delete impact', scope: { paths: ['packages/ui/**'] } });
    await unlink(join(f.root, path));
    expect((await submit({ ...f, task })).state).toBe('COMPLETED');
    expect(JSON.parse(await readFile(join(f.root, '.foker/argv.json'), 'utf8'))).toEqual([
      '--filter=@mono/ui',
      '--filter=@mono/web',
    ]);
  });
it('G3 rechaza parse_status failed (motor simulado); timeout es fallo ejecutado', async () => {
  const f = await fixture();
  await mkdir(join(f.root, 'src'), { recursive: true });
  const task = await f.store.begin({ description: 'parse', scope: { paths: ['src/broken.ts'] } });
  await writeFile(join(f.root, 'src/broken.ts'), 'export const x = 1;');
  const engine = await core.openEngine(f.root);
  await engine.refresh();
  const original = engine.fileInfo.bind(engine);
  const info = vi.spyOn(engine, 'fileInfo').mockImplementation((path) => {
    const value = original(path);
    return value ? { ...value, parseStatus: 'failed' } : null;
  });
  const opened = vi.spyOn(core, 'openEngine').mockResolvedValue(engine);
  try {
    expect(await submit({ ...f, task })).toMatchObject({
      state: 'REJECTED',
      gates: expect.arrayContaining([
        expect.objectContaining({
          gate: 'map',
          findings: expect.arrayContaining([expect.objectContaining({ rule: 'map/parse-failed' })]),
        }),
      ]),
    });
  } finally {
    opened.mockRestore();
    info.mockRestore();
  }
  await writeFile(
    join(f.root, 'foker.config.yaml'),
    stringify({
      version: 1,
      validation: {
        profiles: { default: { checks: ['slow'] } },
        checks: { slow: { run: [process.execPath, '-e', 'setTimeout(()=>{},10000)'], timeout_s: 1 } },
      },
    }),
  );
  await new TrustStore(f.trustBaseDir).approve(f.root, (await loadConfig(f.root)).commandsHash);
  const timeout = await f.store.begin({ description: 'timeout', scope: { paths: ['agent.txt'] } });
  expect((await submit({ ...f, task: timeout })).gates.find((g) => g.gate === 'checks')).toMatchObject({
    status: 'fail',
    checks: [expect.objectContaining({ status: 'timeout' })],
  });
  expect((await f.store.get(timeout.task_id)).attempt).toBe(2);
});
it('CLI begin con scope repetible, validate y unblock --scope conservan intento y evidencias', async () => {
  const f = await fixture(false);
  let output = '';
  const io = {
    isTTY: true,
    confirm: async () => true,
    trustBaseDir: f.trustBaseDir,
    stdout: (s: string) => {
      output += s;
    },
    stderr: () => {},
  };
  const run = async (args: string[]) => {
    output = '';
    const code = await main([...args, '--cwd', f.root, '--json'], {}, io);
    return { code, data: JSON.parse(output).data };
  };
  const begun = await run([
    'task',
    'begin',
    'CLI agent',
    '--scope',
    'agent.txt',
    '--scope',
    'outside.txt',
    '--profile',
    'default',
  ]);
  expect(begun.code).toBe(0);
  expect(validate('task', begun.data).ok).toBe(true);
  expect(begun.data.scope.paths).toEqual(['agent.txt', 'outside.txt']);
  expect((await submit(f)).state).toBe('BLOCKED');
  await new TrustStore(f.trustBaseDir).approve(f.root, (await loadConfig(f.root)).commandsHash);
  const validated = await run(['validate', '--checks', 'test', '--packages', '@demo/app', '--changed']);
  expect(validated).toMatchObject({ code: 0, data: { status: 'pass' } });
  const unblocked = await run([
    'task',
    'unblock',
    f.task.task_id,
    '--scope',
    'agent.txt',
    '--scope',
    'outside.txt',
    '--reason',
    'allow',
  ]);
  expect(unblocked).toMatchObject({
    code: 0,
    data: {
      state: 'RUNNING',
      attempt: 1,
      scope: { paths: ['agent.txt', 'outside.txt'] },
      approvals: [expect.objectContaining({ action: 'unblock', scope: { paths: ['agent.txt', 'outside.txt'] } })],
    },
  });
  await writeFile(join(f.root, 'outside.txt'), 'allowed');
  const completed = await submit(f);
  expect(completed.state).toBe('COMPLETED');
  expect(completed.evidence).toMatch(/evidence\.2\.json$/);
});
it('config protegida ilegible o borrada bloquea con evidencia en lugar de quedar VALIDATING', async () => {
  for (const deleted of [false, true]) {
    const f = await fixture();
    if (deleted) await unlink(join(f.root, 'foker.config.yaml'));
    else await writeFile(join(f.root, 'foker.config.yaml'), '[invalid');
    expect(await submit(f)).toMatchObject({
      state: 'BLOCKED',
      gates: expect.arrayContaining([
        expect.objectContaining({
          gate: 'policy',
          findings: [expect.objectContaining({ rule: 'policy/protected-path' })],
        }),
      ]),
    });
  }
});
