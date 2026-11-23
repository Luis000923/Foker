import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { checkSecurity, loadConfig, SECURITY_RULES, submitTask, TaskStore, TrustStore } from '@foker/engine';

const SHA = `sha512-${Buffer.alloc(64, 2).toString('base64')}`;

function lock(deps: Record<string, string>, resolution: Record<string, string> = {}) {
  return [
    "lockfileVersion: '9.0'",
    '',
    'importers:',
    '',
    '  .:',
    '    dependencies:',
    ...Object.entries(deps).flatMap(([n, v]) => [`      ${n}:`, `        specifier: ${v}`, `        version: ${v}`]),
    '',
    'packages:',
    '',
    ...Object.entries(deps).flatMap(([n, v]) => [
      `  ${n}@${v}:`,
      `    resolution: ${resolution[n] ?? `{integrity: ${SHA}}`}`,
      '',
    ]),
  ].join('\n');
}

async function setup(checks: string[] = ['security']) {
  const root = mkdtempSync(join(tmpdir(), 'foker-depgate-'));
  const trustBaseDir = mkdtempSync(join(tmpdir(), 'foker-trust-'));
  const write = (path: string, text: string) => writeFileSync(join(root, path), text);
  write(
    'foker.config.yaml',
    `version: 1\nvalidation:\n  profiles:\n    default: {checks: [${checks.join(', ')}]}\n  checks:\n    deps: {builtin: dependency-security}\n    security: {builtin: static-security}\n`,
  );
  write(
    'package.json',
    JSON.stringify({ name: 'app', packageManager: 'pnpm@10.0.0', dependencies: { zod: '3.23.8' } }),
  );
  write('pnpm-lock.yaml', lock({ zod: '3.23.8' }));
  write('index.ts', 'export const x = 1;\n');
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, stdio: 'ignore' });
  git('init', '-q');
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'add', '-A');
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'base');
  const loaded = await loadConfig(root);
  await new TrustStore(trustBaseDir).approve(root, loaded.commandsHash, 'test');
  const task = await new TaskStore(root).begin({ description: 'Añadir dependencia', scope: { paths: ['**'] } });
  return { root, trustBaseDir, write, task };
}

test('dependencia limpia: AWAITING_APPROVAL con evidencia del paquete', async () => {
  const { root, trustBaseDir, write, task } = await setup();
  const deps = { zod: '3.23.8', 'left-pad': '1.3.0' };
  write('package.json', JSON.stringify({ name: 'app', packageManager: 'pnpm@10.0.0', dependencies: deps }));
  write('pnpm-lock.yaml', lock(deps));
  const result = await submitTask(root, task.task_id, { trustBaseDir });
  assert.equal(result.state, 'AWAITING_APPROVAL');
  const policy = result.gates.find((g) => g.gate === 'policy');
  assert.equal(policy?.status, 'approval_required');
  const diff = policy?.findings.find((f) => f.rule === 'dependency/diff');
  assert.match(diff?.message ?? '', /añadido left-pad@1\.3\.0 \(directa\).*integridad sha512.*sin scripts/);
  assert.ok(policy?.findings.some((f) => f.rule === 'dependency/report' && /PASS/.test(f.message)));
});

test('registro no autorizado: el gate falla (no AWAITING_APPROVAL)', async () => {
  const { root, trustBaseDir, write, task } = await setup();
  const deps = { zod: '3.23.8', evil: '1.0.0' };
  write('package.json', JSON.stringify({ name: 'app', packageManager: 'pnpm@10.0.0', dependencies: deps }));
  write('pnpm-lock.yaml', lock(deps, { evil: `{tarball: https://evil.example/evil-1.0.0.tgz, integrity: ${SHA}}` }));
  const result = await submitTask(root, task.task_id, { trustBaseDir });
  assert.equal(result.state, 'REJECTED');
  const policy = result.gates.find((g) => g.gate === 'policy');
  assert.equal(policy?.status, 'fail');
  assert.ok(policy?.findings.some((f) => f.code === 'FKR-DEP-003' && f.severity === 'error'));
});

test('especificador latest: el gate falla con FKR-DEP-002', async () => {
  const { root, trustBaseDir, write, task } = await setup();
  write(
    'package.json',
    JSON.stringify({ name: 'app', packageManager: 'pnpm@10.0.0', dependencies: { zod: 'latest' } }),
  );
  write(
    'pnpm-lock.yaml',
    lock({ zod: 'latest' }).replace('version: latest', 'version: 3.23.9').replace('zod@latest', 'zod@3.23.9'),
  );
  const result = await submitTask(root, task.task_id, { trustBaseDir });
  assert.equal(result.state, 'REJECTED');
  assert.ok(result.gates.find((g) => g.gate === 'policy')?.findings.some((f) => f.code === 'FKR-DEP-002'));
});

test('check integrado dependency-security separado de static-security en la evidencia', async () => {
  const { root, trustBaseDir, write, task } = await setup(['deps', 'security']);
  write('index.ts', 'export const y = 2;\n');
  const result = await submitTask(root, task.task_id, { trustBaseDir });
  const checks = result.gates.find((g) => g.gate === 'checks')?.checks ?? [];
  assert.deepEqual(
    checks.map((c) => [c.check, c.status]),
    [
      ['deps', 'pass'],
      ['security', 'pass'],
    ],
  );
  assert.match(checks[0]?.output_tail ?? '', /^Dependency Security \(FKR-DEP/);
  assert.match(checks[1]?.output_tail ?? '', /^Static Automatable Security Controls/);
  assert.equal(result.state, 'COMPLETED');
});

test('no regresión: check-security sigue con exactamente FKR-SEC-001..015', async () => {
  assert.deepEqual(
    SECURITY_RULES.map((r) => r.id),
    Array.from({ length: 15 }, (_, i) => `FKR-SEC-${String(i + 1).padStart(3, '0')}`),
  );
  const root = mkdtempSync(join(tmpdir(), 'foker-sec-'));
  writeFileSync(join(root, 'package.json'), JSON.stringify({ dependencies: { zod: 'latest' } }));
  const report = await checkSecurity(root);
  assert.ok(report.findings.every((f) => /^FKR-SEC-/.test(f.code ?? '')));
});
