/**
 * Subsistema `dependency-security` (FKR-DEP-001..012). Independiente de `static-security` (FKR-SEC-*):
 * audita manifiestos y lockfiles de forma estática; nunca instala ni ejecuta código de terceros.
 */
import { lstat, readdir, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import {
  DEPENDENCY_SEVERITY_RANK,
  type DependencyAuditReport,
  type DependencyDiffEntry,
  type DependencyFinding,
  type DependencySecurityPolicy,
  type DependencySeverity,
  type DependencyWaiver,
  type ResolvedDependencyPolicy,
  resolveDependencyPolicy,
  validateDependencyPolicy,
  validateDependencyWaivers,
} from '@foker/schemas';
import { policyError } from '../policy.js';
import { diffPackages } from './diff.js';
import { type AuditContext, OFFLINE_RULES } from './offline-rules.js';
import { type FetchLike, IntelCache, onlineIntel } from './online-intel.js';
import {
  DependencyParseError,
  LIFECYCLE_SCRIPTS,
  LOCKFILES,
  type Lockfile,
  type LockPackage,
  licenseOf,
  type Manifest,
  type OverrideEntry,
  parseLockfile,
  parseManifest,
  parseNpmrc,
} from './parsers.js';
import { generateSbom } from './sbom.js';
import { satisfies } from './semver.js';
import { asMap, parseYaml, type YamlValue } from './yaml-lite.js';

export { changedDeclarations, diffPackages } from './diff.js';
export * from './offline-rules.js';
export { type FetchLike, IntelCache, OSV_BATCH_URL, onlineIntel, osvSeverity, sanitize } from './online-intel.js';
export * from './parsers.js';
export { generateSbom, purl } from './sbom.js';
export { isRange, satisfies } from './semver.js';
export { closestKnown, levenshtein, POPULAR_PACKAGES } from './typos.js';
export { parseYaml } from './yaml-lite.js';

export const WAIVERS_PATH = '.foker/dep-waivers.json';
export const INTEL_CACHE_PATH = '.foker/cache/dep-intel.json';
const MAX_MANIFEST_BYTES = 1024 * 1024;
const MAX_LOCK_BYTES = 64 * 1024 * 1024;
const MAX_WORKSPACES = 2000;
const MAX_NODE_MODULES_READS = 5000;

export interface CheckDependenciesOptions {
  policy?: DependencySecurityPolicy;
  /** Fuerza el modo (CLI `--offline` / `--online`). */
  mode?: 'offline' | 'hybrid';
  failOn?: ResolvedDependencyPolicy['fail_on'];
  onNetworkError?: ResolvedDependencyPolicy['on_network_error'];
  /** Lee un archivo de la línea base (ruta POSIX relativa); `null` = no existía. Sin ella: auditoría completa. */
  baseline?: (path: string) => Promise<string | null>;
  fetch?: FetchLike;
  now?: () => number;
  /** Genera el SBOM CycloneDX 1.5 (FKR-DEP-012). */
  sbom?: boolean;
}

export interface DependencyAudit {
  report: DependencyAuditReport;
  sbom?: Record<string, unknown>;
  lockfile: Lockfile | null;
}

/** Lee un archivo regular dentro de `root` sin seguir enlaces en el último componente. */
async function readInside(root: string, path: string, max: number): Promise<string | null> {
  const absolute = resolve(root, path);
  const rel = relative(root, absolute);
  if (rel.startsWith('..') || isAbsolute(rel)) return null;
  try {
    const stat = await lstat(absolute);
    if (!stat.isFile() || stat.size > max) return null;
    const real = await realpath(absolute);
    const realRel = relative(await realpath(root), real);
    if (realRel.startsWith('..') || isAbsolute(realRel)) return null;
    return await readFile(absolute, 'utf8');
  } catch (error) {
    if (['ENOENT', 'ENOTDIR', 'EACCES', 'ELOOP'].includes((error as NodeJS.ErrnoException).code ?? '')) return null;
    throw error;
  }
}

const posix = (p: string) => p.split(sep).join('/');

/** Expande patrones de workspace (`packages/*`, `apps/**`, rutas exactas) sin dependencias externas. */
async function expandWorkspaces(root: string, patterns: readonly string[]): Promise<string[]> {
  const dirs = new Set<string>();
  const negated = patterns.filter((p) => p.startsWith('!')).map((p) => p.slice(1).replace(/\/$/, ''));
  const listDirs = async (dir: string) => {
    try {
      return (await readdir(join(root, dir), { withFileTypes: true }))
        .filter((e) => e.isDirectory() && e.name !== 'node_modules' && !e.name.startsWith('.'))
        .map((e) => (dir === '.' ? e.name : `${dir}/${e.name}`))
        .sort();
    } catch {
      return [];
    }
  };
  for (const raw of patterns) {
    if (raw.startsWith('!')) continue;
    const pattern = raw.replace(/^\.\//, '').replace(/\/$/, '');
    if (!pattern || pattern.includes('..')) continue;
    let current = ['.'];
    for (const segment of pattern.split('/')) {
      const next: string[] = [];
      for (const dir of current) {
        if (segment === '**') {
          const queue = [dir];
          for (let depth = 0; depth < 4 && queue.length; depth++) {
            const level = queue.splice(0);
            next.push(...level);
            for (const d of level) queue.push(...(await listDirs(d)));
          }
        } else if (segment.includes('*')) {
          const regex = new RegExp(`^${segment.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')}$`);
          next.push(...(await listDirs(dir)).filter((d) => regex.test(d.slice(d.lastIndexOf('/') + 1))));
        } else next.push(dir === '.' ? segment : `${dir}/${segment}`);
      }
      current = [...new Set(next)];
      if (current.length > MAX_WORKSPACES) break;
    }
    for (const d of current) if (d !== '.' && !negated.some((n) => d === n || d.startsWith(`${n}/`))) dirs.add(d);
  }
  return [...dirs].sort().slice(0, MAX_WORKSPACES);
}

interface Snapshot {
  manifests: Manifest[];
  lockfile: Lockfile | null;
  extraLockfiles: string[];
  pnpmWorkspace: Record<string, YamlValue> | null;
  workspaceOverrides: OverrideEntry[];
  parseErrors: { file: string; message: string }[];
}

function workspaceOverrides(ws: Record<string, YamlValue> | null): OverrideEntry[] {
  return Object.entries(asMap(ws?.['overrides']))
    .filter(([, v]) => typeof v === 'string')
    .map(([key, value]) => ({ key, value: value as string, origin: 'pnpm-workspace.yaml#overrides' }));
}

async function snapshot(
  read: (path: string, max: number) => Promise<string | null>,
  root: string | null,
): Promise<Snapshot> {
  const parseErrors: { file: string; message: string }[] = [];
  const manifests: Manifest[] = [];
  const tryManifest = async (path: string) => {
    const text = await read(path, MAX_MANIFEST_BYTES);
    if (text === null) return null;
    try {
      const m = parseManifest(text, path);
      manifests.push(m);
      return m;
    } catch (error) {
      parseErrors.push({ file: path, message: (error as Error).message });
      return null;
    }
  };
  const rootManifest = await tryManifest('package.json');
  let pnpmWorkspace: Record<string, YamlValue> | null = null;
  const wsText = await read('pnpm-workspace.yaml', MAX_MANIFEST_BYTES);
  if (wsText !== null)
    try {
      pnpmWorkspace = asMap(parseYaml(wsText));
    } catch (error) {
      parseErrors.push({ file: 'pnpm-workspace.yaml', message: (error as Error).message });
    }
  const present: { file: string; text: string }[] = [];
  for (const { file } of LOCKFILES) {
    const text = await read(file, MAX_LOCK_BYTES);
    if (text !== null) present.push({ file, text });
  }
  const manager = /^(pnpm|npm|yarn)@/.exec(rootManifest?.packageManager ?? '')?.[1];
  const preferred =
    present.find((p) => manager && (p.file.startsWith(manager) || (manager === 'npm' && p.file.endsWith('.json')))) ??
    present[0];
  let lockfile: Lockfile | null = null;
  if (preferred)
    try {
      lockfile = parseLockfile(preferred.text, preferred.file);
    } catch (error) {
      parseErrors.push({
        file: preferred.file,
        message: error instanceof DependencyParseError ? error.message : String(error),
      });
    }
  if (root !== null) {
    const patterns = [
      ...(rootManifest?.workspaces ?? []),
      ...((Array.isArray(pnpmWorkspace?.['packages']) ? pnpmWorkspace['packages'] : []) as YamlValue[]).filter(
        (p): p is string => typeof p === 'string',
      ),
    ];
    const dirs = new Set(await expandWorkspaces(root, patterns));
    for (const dir of Object.keys(lockfile?.importers ?? {})) if (dir !== '.' && !dir.includes('..')) dirs.add(dir);
    for (const dir of [...dirs].sort()) await tryManifest(`${dir}/package.json`);
  }
  return {
    manifests: manifests.sort((a, b) => (a.path < b.path ? -1 : 1)),
    lockfile,
    extraLockfiles: present.filter((p) => p !== preferred).map((p) => p.file),
    pnpmWorkspace,
    workspaceOverrides: workspaceOverrides(pnpmWorkspace),
    parseErrors,
  };
}

/** Completa licencia y scripts desde `node_modules/<pkg>/package.json` (lectura estática, nunca ejecución). */
async function enrich(root: string, packages: LockPackage[]): Promise<LockPackage[]> {
  const out: LockPackage[] = [];
  let reads = 0;
  for (const pkg of packages) {
    if (
      reads >= MAX_NODE_MODULES_READS ||
      pkg.source === 'link' ||
      pkg.source === 'file' ||
      (pkg.license && pkg.lifecycleScripts && !pkg.lifecycleScripts.length)
    ) {
      out.push(pkg);
      continue;
    }
    let text: string | null = null;
    for (const candidate of [
      `node_modules/.pnpm/${pkg.name.replace('/', '+')}@${pkg.version}/node_modules/${pkg.name}/package.json`,
      `node_modules/${pkg.name}/package.json`,
    ]) {
      reads++;
      text = await readInside(root, candidate, MAX_MANIFEST_BYTES);
      if (text !== null) {
        try {
          if ((JSON.parse(text) as { version?: unknown }).version === pkg.version) break;
        } catch {}
        text = null;
      }
    }
    if (text === null) {
      out.push(pkg);
      continue;
    }
    try {
      const data = JSON.parse(text) as { license?: unknown; licenses?: unknown; scripts?: unknown; gypfile?: unknown };
      const scripts = data.scripts && typeof data.scripts === 'object' ? (data.scripts as Record<string, unknown>) : {};
      // npm/pnpm solo ejecutan `prepare` de dependencias git o locales, nunca de tarballs del registro.
      const lifecycle: string[] = LIFECYCLE_SCRIPTS.filter(
        (s) => typeof scripts[s] === 'string' && (s !== 'prepare' || pkg.source === 'git'),
      );
      if (data.gypfile === true && !lifecycle.includes('install')) lifecycle.push('install (node-gyp)');
      const license = pkg.license ?? licenseOf(data.license ?? data.licenses);
      out.push({
        ...pkg,
        ...(license ? { license } : {}),
        lifecycleScripts: lifecycle.length ? lifecycle : (pkg.lifecycleScripts ?? []),
      });
    } catch {
      out.push(pkg);
    }
  }
  return out;
}

async function loadWaivers(
  root: string,
  now: number,
): Promise<{ active: DependencyWaiver[]; findings: DependencyFinding[] }> {
  const text = await readInside(root, WAIVERS_PATH, MAX_MANIFEST_BYTES);
  if (text === null) return { active: [], findings: [] };
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    data = { invalid: (error as Error).message };
  }
  const result = validateDependencyWaivers(data);
  if (!result.ok)
    return {
      active: [],
      findings: [
        {
          ruleId: 'FKR-DEP-007',
          severity: 'critical',
          file: WAIVERS_PATH,
          message: `${WAIVERS_PATH} no cumple el esquema; no se aplica ningún waiver.`,
          remediation: 'Corrige el archivo (id, ruleId, packageName, versionRange, reason, approvedBy, expiresAt).',
          evidence: result.issues.map((i) => `${i.path || '/'}: ${i.message}`).join('\n'),
        },
      ],
    };
  const active: DependencyWaiver[] = [];
  const findings: DependencyFinding[] = [];
  for (const waiver of result.value.waivers) {
    if (Date.parse(waiver.expiresAt) > now) active.push(waiver);
    else
      findings.push({
        ruleId: 'FKR-DEP-007',
        severity: 'critical',
        packageName: waiver.packageName,
        file: WAIVERS_PATH,
        message: `El waiver ${waiver.id} (${waiver.ruleId} ${waiver.packageName}@${waiver.versionRange}) expiró el ${waiver.expiresAt}.`,
        remediation: 'Resuelve el hallazgo o renueva el waiver con una nueva aprobación humana.',
        evidence: `waiver:${waiver.id}`,
      });
  }
  return { active, findings };
}

const compareFindings = (a: DependencyFinding, b: DependencyFinding) => {
  for (const key of ['ruleId', 'file', 'packageName', 'version', 'message'] as const) {
    const x = a[key] ?? '';
    const y = b[key] ?? '';
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
};

/** Auditoría completa: informe, SBOM opcional y lockfile analizado. */
export async function auditDependencies(
  root: string,
  options: CheckDependenciesOptions = {},
): Promise<DependencyAudit> {
  root = resolve(root);
  if (options.policy !== undefined) {
    const valid = validateDependencyPolicy(options.policy);
    if (!valid.ok)
      throw policyError(
        'FKR-CFG-001',
        `policy.dependency_security inválida: ${valid.issues.map((i) => `${i.path || '/'}: ${i.message}`).join('; ')}`,
      );
  }
  const policy = resolveDependencyPolicy({
    ...options.policy,
    ...(options.mode ? { mode: options.mode } : {}),
    ...(options.failOn ? { fail_on: options.failOn } : {}),
    ...(options.onNetworkError ? { on_network_error: options.onNetworkError } : {}),
  });
  const now = options.now ?? Date.now;
  const generated_at = new Date(now()).toISOString();
  const empty = (status: DependencyAuditReport['status']): DependencyAuditReport => ({
    schema_version: 1,
    status,
    mode: policy.mode,
    generated_at,
    fail_on: policy.fail_on,
    lockfiles: [],
    summary: { packages: 0, added: 0, updated: 0, removed: 0, findings: 0, blocking: 0, waived: 0 },
    diff: [],
    findings: [],
  });
  if (!policy.enabled) return { report: empty('PASS'), lockfile: null };

  const current = await snapshot((path, max) => readInside(root, path, max), root);
  const npmrcText = await readInside(root, '.npmrc', MAX_MANIFEST_BYTES);
  let baselineManifests: Map<string, Manifest | null> | null = null;
  let baselineOverrides: Set<string> | null = null;
  let diff: DependencyDiffEntry[] = [];
  const packages = current.lockfile?.packages ?? [];
  let targets = packages;
  const direct = new Set(
    current.manifests.flatMap((m) => m.dependencies.filter((d) => d.field !== 'peerDependencies').map((d) => d.name)),
  );
  if (options.baseline) {
    const read = options.baseline;
    baselineManifests = new Map();
    for (const m of current.manifests) {
      const text = await read(m.path);
      let parsed: Manifest | null = null;
      if (text !== null)
        try {
          parsed = parseManifest(text, m.path);
        } catch {}
      baselineManifests.set(m.path, parsed);
    }
    let before: LockPackage[] = [];
    if (current.lockfile) {
      const text = await read(current.lockfile.path);
      if (text !== null)
        try {
          before = parseLockfile(text, current.lockfile.path).packages;
        } catch {}
    }
    diff = diffPackages(before, packages, direct);
    const changed = new Set(diff.filter((d) => d.changeType !== 'removed').map((d) => `${d.name}@${d.toVersion}`));
    targets = packages.filter((p) => changed.has(`${p.name}@${p.version}`));
    const wsBaseline = await read('pnpm-workspace.yaml');
    let wsParsed: Record<string, YamlValue> | null = null;
    if (wsBaseline !== null)
      try {
        wsParsed = asMap(parseYaml(wsBaseline));
      } catch {}
    baselineOverrides = new Set([
      ...[...baselineManifests.values()].flatMap((m) =>
        m ? m.overrides.map((o) => `${m.path}\0${o.origin}\0${o.key}\0${o.value}`) : [],
      ),
      ...workspaceOverrides(wsParsed).map((o) => `pnpm-workspace.yaml\0${o.origin}\0${o.key}\0${o.value}`),
    ]);
  }
  targets = await enrich(root, targets);
  if (diff.length) {
    const byKey = new Map(targets.map((t) => [`${t.name}@${t.version}`, t]));
    diff = diff.map((entry) => {
      const pkg = entry.toVersion ? byKey.get(`${entry.name}@${entry.toVersion}`) : undefined;
      if (!pkg) return entry;
      return {
        ...entry,
        ...(pkg.license ? { license: pkg.license } : {}),
        ...(pkg.lifecycleScripts
          ? { hasLifecycleScripts: pkg.lifecycleScripts.length > 0, lifecycleScripts: pkg.lifecycleScripts }
          : {}),
      };
    });
  }
  const ctx: AuditContext = {
    policy,
    manifests: current.manifests,
    baselineManifests,
    baselineOverrides,
    lockfile: current.lockfile,
    extraLockfiles: current.extraLockfiles,
    targets,
    diff,
    npmrc: npmrcText === null ? null : { path: '.npmrc', values: parseNpmrc(npmrcText) },
    pnpmWorkspace: current.pnpmWorkspace,
    workspaceOverrides: current.workspaceOverrides,
    internalNames: new Set([
      ...current.manifests.map((m) => m.name).filter((n): n is string => !!n),
      ...policy.internal_packages,
    ]),
    parseErrors: current.parseErrors,
  };
  const findings: DependencyFinding[] = OFFLINE_RULES.flatMap((rule) => rule(ctx));
  // FKR-DEP-011 offline: pnpm registra `deprecated` en el lockfile.
  for (const pkg of targets)
    if (pkg.deprecated)
      findings.push({
        ruleId: 'FKR-DEP-011',
        severity: 'medium',
        packageName: pkg.name,
        version: pkg.version,
        file: current.lockfile?.path ?? '',
        message: `${pkg.name}@${pkg.version} está marcado como deprecated: ${pkg.deprecated.slice(0, 300)}`,
        remediation: 'Migra a la alternativa recomendada por el mantenedor.',
      });
  if (policy.mode === 'hybrid' && current.lockfile) {
    const fetcher = options.fetch ?? (globalThis.fetch as unknown as FetchLike);
    const cache = new IntelCache(join(root, INTEL_CACHE_PATH), policy.cache_ttl_hours * 3_600_000, now);
    const online = await onlineIntel(
      { policy, fetch: fetcher, cache, now, lockfilePath: current.lockfile.path },
      targets,
    );
    const offlineDeprecated = new Set(
      findings.filter((f) => f.ruleId === 'FKR-DEP-011').map((f) => `${f.packageName}@${f.version}`),
    );
    findings.push(
      ...online.filter((f) => !(f.ruleId === 'FKR-DEP-011' && offlineDeprecated.has(`${f.packageName}@${f.version}`))),
    );
  }
  let sbom: Record<string, unknown> | undefined;
  if (options.sbom) {
    const rootManifest = current.manifests.find((m) => m.dir === '.');
    sbom = generateSbom({ name: rootManifest?.name ?? posix(root).split('/').pop() ?? 'project' }, packages);
    findings.push({
      ruleId: 'FKR-DEP-012',
      severity: 'info',
      file: current.lockfile?.path ?? 'package.json',
      message: `SBOM CycloneDX 1.5 generado con ${(sbom['components'] as unknown[]).length} componentes.`,
      remediation: 'Adjunta el SBOM al release o a la evidencia de auditoría.',
    });
  }
  const waivers = await loadWaivers(root, now());
  findings.push(...waivers.findings);
  for (const f of findings) {
    if (!f.packageName || f.evidence?.startsWith('waiver:') || f.file === WAIVERS_PATH) continue;
    const waiver = waivers.active.find(
      (w) =>
        w.ruleId === f.ruleId &&
        w.packageName === f.packageName &&
        (w.versionRange === '*' || (f.version !== undefined && satisfies(f.version, w.versionRange))),
    );
    if (waiver) {
      f.waived = true;
      f.waiverId = waiver.id;
    }
  }
  findings.sort(compareFindings);
  const rank = (s: DependencySeverity) => DEPENDENCY_SEVERITY_RANK[s];
  const active = findings.filter((f) => !f.waived);
  const blocking = active.filter((f) => rank(f.severity) >= rank(policy.fail_on)).length;
  const by_severity = Object.fromEntries(
    (['critical', 'high', 'medium', 'low', 'info'] as const).map((s) => [
      s,
      active.filter((f) => f.severity === s).length,
    ]),
  ) as Record<DependencySeverity, number>;
  const report: DependencyAuditReport = {
    schema_version: 1,
    status: blocking ? 'FAIL' : active.some((f) => rank(f.severity) >= rank('low')) ? 'WARN' : 'PASS',
    mode: policy.mode,
    generated_at,
    fail_on: policy.fail_on,
    lockfiles: [current.lockfile?.path, ...current.extraLockfiles].filter((p): p is string => !!p),
    summary: {
      packages: packages.length,
      added: diff.filter((d) => d.changeType === 'added').length,
      updated: diff.filter((d) => d.changeType === 'updated').length,
      removed: diff.filter((d) => d.changeType === 'removed').length,
      findings: findings.length,
      blocking,
      waived: findings.length - active.length,
      by_severity,
    },
    diff,
    findings,
  };
  return { report, ...(sbom ? { sbom } : {}), lockfile: current.lockfile };
}

/** `checkDependencies(root, options)` → `DependencyAuditReport`. */
export async function checkDependencies(
  root: string,
  options: CheckDependenciesOptions = {},
): Promise<DependencyAuditReport> {
  return (await auditDependencies(root, options)).report;
}

/** El hallazgo bloquea con el umbral `failOn`. */
export function isBlocking(finding: DependencyFinding, failOn: DependencySeverity): boolean {
  return !finding.waived && DEPENDENCY_SEVERITY_RANK[finding.severity] >= DEPENDENCY_SEVERITY_RANK[failOn];
}
