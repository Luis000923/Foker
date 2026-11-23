import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import {
  auditDependencies,
  checkDependencies,
  closestKnown,
  type FetchLike,
  isBlocking,
  parseNpmLock,
  parsePnpmLock,
  parseYarnLock,
  satisfies,
  unsafeSpec,
} from '@foker/policy';
import { validateDependencyReport } from '@foker/schemas';

const SHA = `sha512-${Buffer.alloc(64, 1).toString('base64')}`;
const NOW = Date.parse('2026-11-23T12:00:00Z');

function project(files: Record<string, string | object>): string {
  const root = mkdtempSync(join(tmpdir(), 'foker-deps-'));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), typeof content === 'string' ? content : JSON.stringify(content, null, 2));
  }
  return root;
}

function pnpmLock(deps: Record<string, string>, packages: Record<string, string> = {}): string {
  const importer = Object.entries(deps)
    .map(([name, v]) => `      '${name}':\n        specifier: ${v}\n        version: ${v}`)
    .join('\n');
  const pkgs = Object.entries(deps)
    .map(([name, v]) => `  '${name}@${v}':\n    ${packages[name] ?? `resolution: {integrity: ${SHA}}`}`)
    .join('\n\n');
  return `lockfileVersion: '9.0'\n\nimporters:\n\n  .:\n    dependencies:\n${importer}\n\npackages:\n\n${pkgs}\n`;
}

/** Proyecto pnpm 10 sano: lockfile sincronizado, builds bloqueados. */
function clean(deps: Record<string, string> = { zod: '3.23.8' }, extra: Record<string, string | object> = {}) {
  return project({
    'package.json': { name: 'app', packageManager: 'pnpm@10.0.0', dependencies: deps },
    'pnpm-lock.yaml': pnpmLock(deps),
    ...extra,
  });
}

const offline = { now: () => NOW, fetch: (() => assert.fail('fetch en modo offline')) as unknown as FetchLike };
const rules = (report: { findings: { ruleId: string }[] }) => report.findings.map((f) => f.ruleId);

test('parsea pnpm-lock v9 con integridad, tarball, git y deprecated', () => {
  const lock = parsePnpmLock(
    [
      "lockfileVersion: '9.0'",
      'importers:',
      '  .:',
      '    dependencies:',
      "      '@scope/a':",
      '        specifier: ^1.0.0',
      '        version: 1.2.0(react@18.0.0)',
      'packages:',
      "  '@scope/a@1.2.0':",
      `    resolution: {integrity: ${SHA}}`,
      '    deprecated: usa b',
      '  evil@1.0.0:',
      '    resolution: {tarball: https://evil.example/evil-1.0.0.tgz}',
      '  g@1.0.0:',
      '    resolution: {type: git, repo: https://github.com/x/g, commit: abc}',
    ].join('\r\n'),
  );
  assert.deepEqual(lock.importers, { '.': { '@scope/a': '^1.0.0' } });
  assert.deepEqual(
    lock.packages.map((p) => [p.name, p.version, p.source, p.deprecated ?? '']),
    [
      ['@scope/a', '1.2.0', 'registry', 'usa b'],
      ['evil', '1.0.0', 'tarball', ''],
      ['g', '1.0.0', 'git', ''],
    ],
  );
});

test('parsea package-lock v3, yarn v1 y yarn berry', () => {
  const npm = parseNpmLock(
    JSON.stringify({
      lockfileVersion: 3,
      packages: {
        '': { dependencies: { a: '^1.0.0' } },
        'node_modules/a': {
          version: '1.0.1',
          resolved: 'https://registry.npmjs.org/a/-/a-1.0.1.tgz',
          integrity: SHA,
          license: 'MIT',
          hasInstallScript: true,
        },
        'node_modules/a/node_modules/b': { version: '2.0.0', integrity: SHA },
        'packages/w': { name: 'w' },
        'node_modules/w': { resolved: 'packages/w', link: true },
      },
    }),
  );
  assert.deepEqual(npm.importers?.['.'], { a: '^1.0.0' });
  assert.deepEqual(
    npm.packages.map((p) => `${p.name}@${p.version}:${p.license ?? ''}:${p.lifecycleScripts?.join() ?? ''}`),
    ['a@1.0.1:MIT:install', 'b@2.0.0::'],
  );
  const v1 = parseYarnLock(
    `# yarn lockfile v1\n\n"a@^1.0.0", a@^1.0.1:\n  version "1.0.1"\n  resolved "https://registry.yarnpkg.com/a/-/a-1.0.1.tgz#abc"\n  integrity ${SHA}\n  dependencies:\n    b "^2"\n`,
  );
  assert.equal(v1.kind, 'yarn-v1');
  assert.ok(v1.descriptors?.has('a@^1.0.0'));
  assert.equal(v1.packages[0]?.integrity, SHA);
  const berry = parseYarnLock(
    '__metadata:\n  version: 8\n\n"a@npm:^1.0.0":\n  version: 1.0.1\n  resolution: "a@npm:1.0.1"\n  checksum: 10c0/abc\n  languageName: node\n  linkType: hard\n\n"w@workspace:.":\n  version: 0.0.0\n  resolution: "w@workspace:."\n  linkType: soft\n',
  );
  assert.equal(berry.kind, 'yarn-berry');
  assert.deepEqual(
    berry.packages.map((p) => [p.name, p.version, p.integrity]),
    [['a', '1.0.1', 'checksum:10c0/abc']],
  );
  assert.ok(berry.descriptors?.has('a@^1.0.0'));
});

test('proyecto limpio: PASS, informe válido y cero llamadas de red en offline', async () => {
  const report = await checkDependencies(clean(), offline);
  assert.equal(report.status, 'PASS');
  assert.equal(report.mode, 'offline');
  assert.ok(validateDependencyReport(report).ok);
});

test('FKR-DEP-001: sin lockfile y lockfile desincronizado', async () => {
  const none = await checkDependencies(project({ 'package.json': { dependencies: { zod: '3.23.8' } } }), offline);
  assert.deepEqual(rules(none), ['FKR-DEP-001']);
  assert.equal(none.status, 'FAIL');
  const desync = project({
    'package.json': { packageManager: 'pnpm@10.0.0', dependencies: { zod: '3.23.8', left: '1.0.0' } },
    'pnpm-lock.yaml': pnpmLock({ zod: '3.23.8' }),
  });
  const report = await checkDependencies(desync, offline);
  assert.ok(report.findings.some((f) => f.ruleId === 'FKR-DEP-001' && /left@1.0.0/.test(f.message)));
  const workspaceOnly = await checkDependencies(
    project({ 'package.json': { dependencies: { a: 'workspace:*' } } }),
    offline,
  );
  assert.deepEqual(rules(workspaceOnly), []);
});

test('FKR-DEP-002: especificadores flotantes, http y git sin SHA', () => {
  for (const spec of [
    '*',
    '',
    'latest',
    'next',
    'x',
    'http://x.test/a.tgz',
    'github:a/b',
    'git+https://g.test/a.git#main',
    'a/b',
  ])
    assert.ok(unsafeSpec(spec), spec);
  for (const spec of [
    '1.2.3',
    '^1.2.0',
    '~1.0',
    '>=1 <2',
    'workspace:*',
    'npm:other@^1.0.0',
    `git+https://g.test/a.git#${'a'.repeat(40)}`,
    'https://r.test/a.tgz',
  ])
    assert.equal(unsafeSpec(spec), null, spec);
});

test('FKR-DEP-002 en informe con latest', async () => {
  const report = await checkDependencies(clean({ zod: 'latest' }), offline);
  assert.ok(report.findings.some((f) => f.ruleId === 'FKR-DEP-002' && f.packageName === 'zod'));
  assert.equal(report.status, 'FAIL');
});

test('FKR-DEP-003: registro no autorizado y falta de integridad', async () => {
  const root = project({
    'package.json': { packageManager: 'pnpm@10.0.0', dependencies: { evil: '1.0.0', bare: '1.0.0' } },
    'pnpm-lock.yaml': pnpmLock(
      { evil: '1.0.0', bare: '1.0.0' },
      { evil: `resolution: {tarball: https://evil.example/evil-1.0.0.tgz, integrity: ${SHA}}`, bare: 'resolution: {}' },
    ),
  });
  const report = await checkDependencies(root, offline);
  const f003 = report.findings.filter((f) => f.ruleId === 'FKR-DEP-003');
  assert.deepEqual(f003.map((f) => [f.packageName, f.severity]).sort(), [
    ['bare', 'critical'],
    ['evil', 'critical'],
  ]);
  const allowed = await checkDependencies(root, {
    ...offline,
    policy: {
      allowed_registries: ['https://registry.npmjs.org', 'https://evil.example'],
      require_integrity_hash: false,
    },
  });
  assert.equal(allowed.findings.filter((f) => f.ruleId === 'FKR-DEP-003').length, 0);
});

test('FKR-DEP-004: scripts de instalación según ignore-scripts y pnpm', async () => {
  const npmProject = (npmrc?: string) =>
    project({
      'package.json': { dependencies: { native: '1.0.0' } },
      'package-lock.json': {
        lockfileVersion: 3,
        packages: {
          '': { dependencies: { native: '1.0.0' } },
          'node_modules/native': { version: '1.0.0', integrity: SHA, hasInstallScript: true, license: 'MIT' },
        },
      },
      'node_modules/native/package.json': { version: '1.0.0', scripts: { postinstall: 'node x.js' } },
      ...(npmrc ? { '.npmrc': npmrc } : {}),
    });
  const open = await checkDependencies(npmProject(), offline);
  const f004 = open.findings.filter((f) => f.ruleId === 'FKR-DEP-004');
  assert.deepEqual(f004.map((f) => f.severity).sort(), ['high', 'high']);
  assert.ok(f004.some((f) => /postinstall/.test(f.message)));
  const closed = await checkDependencies(npmProject('ignore-scripts=true\n'), offline);
  assert.deepEqual(
    closed.findings.filter((f) => f.ruleId === 'FKR-DEP-004').map((f) => f.severity),
    ['low'],
  );
  const pnpm = await checkDependencies(clean(), offline);
  assert.equal(pnpm.findings.filter((f) => f.ruleId === 'FKR-DEP-004').length, 0);
  const allowAll = await checkDependencies(
    clean(undefined, { 'pnpm-workspace.yaml': 'dangerouslyAllowAllBuilds: true\n' }),
    offline,
  );
  assert.ok(allowAll.findings.some((f) => f.ruleId === 'FKR-DEP-004' && f.severity === 'high'));
});

test('FKR-DEP-005: licencias SPDX (lista negra, lista blanca y expresiones)', async () => {
  const withLicense = (license: string) =>
    project({
      'package.json': { dependencies: { a: '1.0.0' } },
      '.npmrc': 'ignore-scripts=true\n',
      'package-lock.json': {
        lockfileVersion: 3,
        packages: {
          '': { dependencies: { a: '1.0.0' } },
          'node_modules/a': { version: '1.0.0', integrity: SHA, license },
        },
      },
    });
  const agpl = await checkDependencies(withLicense('AGPL-3.0-only'), offline);
  assert.deepEqual(
    agpl.findings.map((f) => [f.ruleId, f.severity]),
    [['FKR-DEP-005', 'high']],
  );
  const dual = await checkDependencies(withLicense('(MIT OR AGPL-3.0-only)'), offline);
  assert.equal(dual.findings.length, 0);
  const notAllowed = await checkDependencies(withLicense('MPL-2.0'), {
    ...offline,
    policy: { allowed_licenses: ['MIT', 'Apache-2.0'] },
  });
  assert.deepEqual(
    notAllowed.findings.map((f) => [f.ruleId, f.severity]),
    [['FKR-DEP-005', 'medium']],
  );
  const mit = await checkDependencies(withLicense('MIT'), { ...offline, policy: { allowed_licenses: ['MIT'] } });
  assert.equal(mit.findings.length, 0);
});

test('FKR-DEP-006: typosquatting y dependency confusion', async () => {
  assert.deepEqual(closestKnown('expresss', ['express']), { target: 'express', distance: 1 });
  assert.equal(closestKnown('express', ['express']), null);
  assert.equal(closestKnown('left-pad-xyz', ['react']), null);
  const typo = await checkDependencies(clean({ 'reacct-dom': '18.0.0' }), offline);
  assert.ok(
    typo.findings.some((f) => f.ruleId === 'FKR-DEP-006' && /react-dom/.test(f.message) && f.severity === 'high'),
  );
  const confusion = project({
    'package.json': {
      packageManager: 'pnpm@10.0.0',
      workspaces: ['packages/*'],
      dependencies: { '@acme/ui': '1.0.0' },
    },
    'packages/ui/package.json': { name: '@acme/ui' },
    'pnpm-lock.yaml': `${pnpmLock({ '@acme/ui': '1.0.0' })}`,
  });
  const report = await checkDependencies(confusion, offline);
  assert.ok(report.findings.some((f) => f.ruleId === 'FKR-DEP-006' && /dependency confusion/.test(f.message)));
  const popular = await checkDependencies(clean({ react: '18.3.1', 'react-dom': '18.3.1' }), offline);
  assert.equal(popular.findings.filter((f) => f.ruleId === 'FKR-DEP-006').length, 0);
});

test('FKR-DEP-007: lista negra y waivers vigentes frente a expirados', async () => {
  const banned = await checkDependencies(clean({ 'event-stream': '3.3.6' }), {
    ...offline,
    policy: { banned_packages: ['event-stream'] },
  });
  assert.ok(banned.findings.some((f) => f.ruleId === 'FKR-DEP-007' && f.severity === 'critical'));
  const waiver = (expiresAt: string) => ({
    waivers: [
      {
        id: 'w1',
        ruleId: 'FKR-DEP-002',
        packageName: 'zod',
        versionRange: '*',
        reason: 'Migración en curso, revisado por seguridad',
        approvedBy: 'luis',
        expiresAt,
      },
    ],
  });
  const valid = await checkDependencies(
    clean({ zod: 'latest' }, { '.foker/dep-waivers.json': waiver('2027-01-01T00:00:00Z') }),
    offline,
  );
  assert.equal(valid.status, 'PASS');
  assert.equal(valid.summary.waived, 1);
  assert.equal(valid.findings[0]?.waiverId, 'w1');
  const expired = await checkDependencies(
    clean({ zod: 'latest' }, { '.foker/dep-waivers.json': waiver('2026-01-01T00:00:00Z') }),
    offline,
  );
  assert.equal(expired.status, 'FAIL');
  assert.ok(expired.findings.some((f) => f.ruleId === 'FKR-DEP-007' && /expiró/.test(f.message)));
  const invalid = await checkDependencies(
    clean(undefined, { '.foker/dep-waivers.json': { waivers: [{ id: 'x' }] } }),
    offline,
  );
  assert.ok(invalid.findings.some((f) => f.ruleId === 'FKR-DEP-007' && /esquema/.test(f.message)));
});

test('FKR-DEP-008: overrides sin justificación y mayores duplicadas', async () => {
  const root = project({
    'package.json': {
      packageManager: 'pnpm@10.0.0',
      dependencies: { zod: '3.23.8' },
      pnpm: { overrides: { semver: '7.6.0' } },
    },
    'pnpm-lock.yaml': `${pnpmLock({ zod: '3.23.8' })}\n  react@17.0.2:\n    resolution: {integrity: ${SHA}}\n\n  react@18.3.1:\n    resolution: {integrity: ${SHA}}\n`,
  });
  const report = await checkDependencies(root, offline);
  assert.deepEqual(
    report.findings
      .filter((f) => f.ruleId === 'FKR-DEP-008')
      .map((f) => f.packageName)
      .sort(),
    ['react', 'semver'],
  );
  const justified = await checkDependencies(root, {
    ...offline,
    policy: { override_justifications: { semver: 'CVE-2022-25883 en versiones previas' }, critical_packages: [] },
  });
  assert.equal(justified.findings.filter((f) => f.ruleId === 'FKR-DEP-008').length, 0);
});

test('FKR-DEP-011 offline desde pnpm-lock y FKR-DEP-012 SBOM determinista', async () => {
  const root = clean({ request: '2.88.2' });
  writeFileSync(
    join(root, 'pnpm-lock.yaml'),
    pnpmLock(
      { request: '2.88.2' },
      { request: `resolution: {integrity: ${SHA}}\n    deprecated: request has been deprecated` },
    ),
  );
  const a = await auditDependencies(root, { ...offline, sbom: true });
  const b = await auditDependencies(root, { ...offline, sbom: true });
  assert.ok(a.report.findings.some((f) => f.ruleId === 'FKR-DEP-011'));
  assert.ok(a.report.findings.some((f) => f.ruleId === 'FKR-DEP-012' && f.severity === 'info'));
  assert.deepEqual(a.sbom, b.sbom);
  assert.equal(a.sbom?.['specVersion'], '1.5');
  const comp = ((a.sbom ?? {})['components'] as { purl: string; hashes: { alg: string }[] }[])[0];
  assert.equal(comp?.purl, 'pkg:npm/request@2.88.2');
  assert.equal(comp?.hashes[0]?.alg, 'SHA-512');
});

test('modo delta: solo examina paquetes añadidos o actualizados', async () => {
  const root = clean({ zod: '3.23.8', expresss: '4.0.0' });
  const baselineFiles: Record<string, string> = {
    'package.json': JSON.stringify({
      name: 'app',
      packageManager: 'pnpm@10.0.0',
      dependencies: { zod: '3.22.0', expresss: '4.0.0' },
    }),
    'pnpm-lock.yaml': pnpmLock({ zod: '3.22.0', expresss: '4.0.0' }),
  };
  const report = await checkDependencies(root, { ...offline, baseline: async (p) => baselineFiles[p] ?? null });
  assert.deepEqual(
    report.diff.map((d) => [d.name, d.changeType, d.fromVersion, d.toVersion]),
    [['zod', 'updated', '3.22.0', '3.23.8']],
  );
  // El typo preexistente no se reporta en delta: su declaración no cambió.
  assert.equal(report.findings.filter((f) => f.ruleId === 'FKR-DEP-006').length, 0);
  const full = await checkDependencies(root, offline);
  assert.equal(full.findings.filter((f) => f.ruleId === 'FKR-DEP-006').length, 1);
});

function mockFetch(handler: (url: string) => unknown): { fetch: FetchLike; calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    fetch: async (url) => {
      calls.push(url);
      const body = handler(url);
      if (body instanceof Error) throw body;
      return { ok: body !== 404, status: body === 404 ? 404 : 200, json: async () => body };
    },
  };
}

test('FKR-DEP-009..011 en hybrid: OSV, cooldown, deprecated y caché con TTL', async () => {
  const root = clean({ zod: '3.23.8' });
  const net = mockFetch((url) => {
    if (url.endsWith('querybatch')) return { results: [{ vulns: [{ id: 'GHSA-xxxx-yyyy-zzzz' }] }] };
    if (url.includes('/v1/vulns/'))
      return {
        id: 'GHSA-xxxx-yyyy-zzzz',
        summary: 'RCE\u0007 grave',
        aliases: ['CVE-2026-1'],
        database_specific: { severity: 'CRITICAL' },
      };
    return { versions: { '3.23.8': { deprecated: 'usa v4', dist: {} } }, time: { '3.23.8': '2026-11-23T00:00:00Z' } };
  });
  const options = { mode: 'hybrid' as const, now: () => NOW, fetch: net.fetch };
  const report = await checkDependencies(root, options);
  const by = Object.fromEntries(report.findings.map((f) => [f.ruleId, f]));
  assert.equal(by['FKR-DEP-009']?.severity, 'critical');
  assert.match(by['FKR-DEP-009']?.message ?? '', /CVE-2026-1/);
  assert.doesNotMatch(by['FKR-DEP-009']?.message ?? '', new RegExp(String.fromCharCode(7)));
  assert.equal(by['FKR-DEP-010']?.severity, 'high');
  assert.equal(by['FKR-DEP-011']?.severity, 'medium');
  assert.equal(report.status, 'FAIL');
  assert.equal(net.calls.length, 3);
  const cache = JSON.parse(readFileSync(join(root, '.foker/cache/dep-intel.json'), 'utf8'));
  assert.equal(cache.schema_version, 1);
  await checkDependencies(root, options);
  assert.equal(net.calls.length, 3, 'la segunda ejecución sale de la caché');
  await checkDependencies(root, { ...options, now: () => NOW + 7 * 3_600_000 });
  assert.equal(net.calls.length, 6, 'TTL de 6 h vencido');
});

test('errores de red: warn degrada, fail-closed bloquea', async () => {
  const root = clean();
  const down = mockFetch(() => new Error('ECONNREFUSED'));
  const warn = await checkDependencies(root, { mode: 'hybrid', now: () => NOW, fetch: down.fetch });
  assert.equal(warn.status, 'WARN');
  assert.ok(warn.findings.every((f) => f.severity === 'low'));
  const closed = await checkDependencies(root, {
    mode: 'hybrid',
    onNetworkError: 'fail-closed',
    now: () => NOW,
    fetch: down.fetch,
  });
  assert.equal(closed.status, 'FAIL');
  assert.ok(closed.findings.some((f) => f.severity === 'critical' && isBlocking(f, 'high')));
});

test('política inválida falla con FKR-CFG-001', async () => {
  await assert.rejects(
    checkDependencies(clean(), { ...offline, policy: { fail_on: 'nunca' } as never }),
    /FKR-CFG-001|dependency_security/,
  );
});

test('semver: rangos de waivers', () => {
  assert.ok(satisfies('1.2.3', '^1.0.0'));
  assert.ok(!satisfies('2.0.0', '^1.0.0'));
  assert.ok(satisfies('0.2.5', '~0.2'));
  assert.ok(satisfies('1.5.0', '>=1.0.0 <2.0.0 || 3.x'));
  assert.ok(satisfies('3.1.0', '>=1.0.0 <2.0.0 || 3.x'));
  assert.ok(!satisfies('1.0.0-beta', '>=1.0.0'));
});
