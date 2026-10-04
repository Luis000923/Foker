import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { assertCanTrust, DEFAULT_POLICY, effectivePolicy, redact, runCheck, TrustStore } from './index.js';

const roots: string[] = [];
async function temp() {
  const root = await mkdtemp(join(tmpdir(), 'foker-policy-'));
  roots.push(root);
  return root;
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
it('une protecciones y registra relajaciones explícitas', () => {
  const merged = effectivePolicy(DEFAULT_POLICY, {
    secret_globs: ['private/**'],
    protected_paths: [],
    approval_required: { paths: ['deploy/**'], dependency_changes: false },
  });
  expect(merged.policy.secret_globs).toContain('.env');
  expect(merged.policy.secret_globs).toContain('private/**');
  expect(merged.policy.protected_paths).toEqual(DEFAULT_POLICY.protected_paths);
  expect(merged.policy.approval_required.dependency_changes).toBe(true);
  const relaxed = effectivePolicy(DEFAULT_POLICY, {
    overrides: [
      {
        remove_secret_globs: ['.env'],
        remove_protected_paths: ['.git/**'],
        remove_approval_paths: ['AGENTS.md'],
        justification: 'Aprobado por el propietario',
      },
    ],
  });
  expect(relaxed.policy.secret_globs).not.toContain('.env');
  expect(relaxed.overrides).toHaveLength(1);
});
it('confianza por realpath y hash; corrupción vacía y permisos privados', async () => {
  const root = await temp();
  const store = new TrustStore(root);
  expect(await store.isTrusted(root, 'a')).toBe(false);
  await store.approve(root, 'a', 'test');
  expect(await store.isTrusted(root, 'a')).toBe(true);
  expect(await store.isTrusted(root, 'b')).toBe(false);
  if (process.platform !== 'win32') expect((await stat(store.path)).mode & 0o777).toBe(0o600);
  await writeFile(store.path, '{broken');
  expect(await store.isTrusted(root, 'a')).toBe(false);
  expect(() => assertCanTrust('mcp')).toThrow(expect.objectContaining({ code: 'FKR-POL-010' }));
});
it('éxito, fallo, ausente, env filtrado y argv literal', async () => {
  const root = await temp();
  const run = (code: string, args: string[] = []) =>
    runCheck(
      { name: 'test', run: [process.execPath, '-e', code, '--', ...args] },
      { root, env: { SECRETA: 'hidden-value', PATH: process.env['PATH'] }, affectedPackages: ['@foker/core'] },
    );
  expect((await run('process.exit(9)')).exit_code).toBe(9);
  const output = await run('process.stdout.write(JSON.stringify(process.argv.slice(1))+String(process.env.SECRETA))', [
    '${affected_packages}',
    '; echo pwned',
  ]);
  expect(output.status).toBe('pass');
  expect(output.output_tail).toContain('--filter=@foker/core');
  expect(output.output_tail).toContain('; echo pwned');
  expect(output.output_tail).toContain('undefined');
  expect(await runCheck({ run: ['foker-nonexistent-binary'] }, { root })).toMatchObject({
    status: 'skipped',
    notExecuted: true,
    code: 'FKR-VAL-004',
  });
  expect(
    (
      await runCheck(
        {
          run: [
            process.execPath,
            '-e',
            'process.stdout.write(JSON.stringify(process.argv.slice(1)))',
            '--',
            '${affected_packages}',
          ],
        },
        { root },
      )
    ).output_tail,
  ).toContain('[]');
  await expect(runCheck({ run: [process.execPath] }, { root, affectedPackages: ['; bad'] })).rejects.toMatchObject({
    code: 'FKR-INP-001',
  });
  expect(redact('hidden-value', { SECRETA: 'hidden-value' }, [])).toBe('[REDACTED:env]');
});
it('verifica argv y entorno mediante evidencia escrita por el hijo', async () => {
  const root = await temp();
  const evidence = join(root, 'evidence.json');
  const code = `require('node:fs').writeFileSync(${JSON.stringify(evidence)}, JSON.stringify({args:process.argv.slice(1),secret:process.env.SECRETA ?? null}))`;
  const check = { run: [process.execPath, '-e', code, '--', '${affected_packages}', '; echo pwned'] };
  await runCheck(check, { root, affectedPackages: ['@scope/pkg'], env: { SECRETA: 'hidden-value' } });
  expect(JSON.parse(await readFile(evidence, 'utf8'))).toEqual({
    args: ['--filter=@scope/pkg', '; echo pwned'],
    secret: null,
  });
  await runCheck(check, { root, affectedPackages: [] });
  expect(JSON.parse(await readFile(evidence, 'utf8')).args).toEqual(['; echo pwned']);
});
it('timeout mata el grupo incluyendo nietos', async () => {
  const root = await temp();
  const pidFile = join(root, 'pid');
  const grandchild = `require('node:fs').writeFileSync(${JSON.stringify(pidFile)},String(process.pid));setInterval(()=>{},1000)`;
  const child = `require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(grandchild)}],{stdio:'ignore'});setInterval(()=>{},1000)`;
  const parent = `require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(child)}],{stdio:'ignore'});setInterval(()=>{},1000)`;
  expect((await runCheck({ run: [process.execPath, '-e', parent] }, { root, timeoutMs: 700 })).status).toBe('timeout');
  const pid = Number(await readFile(pidFile, 'utf8'));
  let alive = true;
  for (let i = 0; i < 40 && alive; i++) {
    try {
      process.kill(pid, 0);
      if (process.platform === 'linux')
        alive = !(await readFile(`/proc/${pid}/stat`, 'utf8')).split(' ')[2]?.includes('Z');
    } catch {
      alive = false;
    }
    if (alive) await new Promise((resolve) => setTimeout(resolve, 25));
  }
  expect(alive).toBe(false);
});
