/** Reglas FKR-DEP-001..008: 100 % offline y deterministas. */
import type { DependencyDiffEntry, DependencyFinding, ResolvedDependencyPolicy } from '@foker/schemas';
import { changedDeclarations } from './diff.js';
import type { Lockfile, LockPackage, Manifest, ManifestDependency, OverrideEntry } from './parsers.js';
import { isRange, majorOf, satisfies, sortVersions } from './semver.js';
import { closestKnown, POPULAR_PACKAGES } from './typos.js';
import type { YamlValue } from './yaml-lite.js';

export interface AuditContext {
  policy: ResolvedDependencyPolicy;
  manifests: Manifest[];
  /** Manifiestos de la línea base por ruta; `null` = auditoría completa sin delta. */
  baselineManifests: Map<string, Manifest | null> | null;
  baselineOverrides: Set<string> | null;
  lockfile: Lockfile | null;
  /** Lockfiles adicionales presentes (ambigüedad de gestor). */
  extraLockfiles: string[];
  /** Paquetes del lockfile bajo examen: los añadidos/actualizados en delta, todos en auditoría completa. */
  targets: LockPackage[];
  diff: DependencyDiffEntry[];
  npmrc: { path: string; values: Record<string, string> } | null;
  pnpmWorkspace: Record<string, YamlValue> | null;
  workspaceOverrides: OverrideEntry[];
  internalNames: Set<string>;
  parseErrors: { file: string; message: string }[];
}

type Finding = DependencyFinding;
const finding = (f: Finding): Finding => f;

const DIST_TAG = /^[A-Za-z][A-Za-z0-9._-]*$/;
const GIT_SPEC = /^(?:git\+|git:\/\/|github:|gitlab:|bitbucket:|gist:)|^[\w.-]+\/[\w.-]+(?:#.*)?$/;
const SAFE_PROTOCOL = /^(?:workspace:|link:|file:|portal:|patch:|catalog:)/;

/** Dependencias examinadas por reglas de declaración: las cambiadas en delta, todas en auditoría completa. */
function declarations(ctx: AuditContext): { manifest: Manifest; dependency: ManifestDependency }[] {
  if (ctx.baselineManifests) return changedDeclarations(ctx.manifests, ctx.baselineManifests);
  return ctx.manifests.flatMap((manifest) => manifest.dependencies.map((dependency) => ({ manifest, dependency })));
}

const isThirdParty = (spec: string) => !SAFE_PROTOCOL.test(spec);

/** FKR-DEP-001: lockfile ausente, inválido o desincronizado. */
export function lockfileSync(ctx: AuditContext): Finding[] {
  const out: Finding[] = ctx.parseErrors.map((e) =>
    finding({
      ruleId: 'FKR-DEP-001',
      severity: 'high',
      file: e.file,
      message: `No se pudo analizar ${e.file}: ${e.message}`,
      remediation: 'Corrige el archivo o regenera el lockfile con el gestor del proyecto.',
    }),
  );
  const thirdParty = ctx.manifests.some((m) =>
    m.dependencies.some((d) => d.field !== 'peerDependencies' && isThirdParty(d.spec)),
  );
  if (!ctx.lockfile) {
    if (thirdParty && !ctx.parseErrors.some((e) => /lock/.test(e.file)))
      out.push({
        ruleId: 'FKR-DEP-001',
        severity: 'high',
        file: 'package.json',
        message:
          'Hay dependencias de terceros declaradas pero ningún lockfile (pnpm-lock.yaml, package-lock.json o yarn.lock).',
        remediation: 'Genera y versiona el lockfile; instala siempre con --frozen-lockfile / npm ci.',
      });
    return out;
  }
  for (const extra of ctx.extraLockfiles)
    out.push({
      ruleId: 'FKR-DEP-001',
      severity: 'medium',
      file: extra,
      message: `Lockfile adicional ${extra} junto a ${ctx.lockfile.path}: el gestor de paquetes es ambiguo.`,
      remediation: 'Conserva un único lockfile, el del gestor declarado en packageManager.',
    });
  const lock = ctx.lockfile;
  for (const manifest of ctx.manifests) {
    const declared = manifest.dependencies.filter((d) => d.field !== 'peerDependencies');
    if (lock.importers) {
      const importer = lock.importers[manifest.dir];
      if (!importer) {
        if (declared.length)
          out.push({
            ruleId: 'FKR-DEP-001',
            severity: 'high',
            file: manifest.path,
            message: `${manifest.path} no figura como importer en ${lock.path}.`,
            remediation: 'Regenera el lockfile (pnpm install / npm install) y versiónalo junto al manifiesto.',
          });
        continue;
      }
      const mismatched = declared
        .filter((d) => importer[d.name] !== d.spec)
        .map((d) => `${d.name}@${d.spec} (lockfile: ${importer[d.name] ?? 'ausente'})`);
      const names = new Set(declared.map((d) => d.name));
      const stale = Object.keys(importer)
        .filter((name) => !names.has(name) && !manifest.dependencies.some((d) => d.name === name))
        .map((name) => `${name} (solo en el lockfile)`);
      const issues = [...mismatched, ...stale].sort();
      if (issues.length)
        out.push({
          ruleId: 'FKR-DEP-001',
          severity: 'high',
          file: manifest.path,
          message: `${manifest.path} y ${lock.path} están desincronizados: ${issues.slice(0, 10).join(', ')}${issues.length > 10 ? ` y ${issues.length - 10} más` : ''}.`,
          remediation: 'Regenera el lockfile con el gestor del proyecto y revisa el diff antes de aprobar.',
          evidence: issues.join('\n'),
        });
    } else if (lock.descriptors) {
      const missing = declared
        .filter((d) => isThirdParty(d.spec) && !lock.descriptors?.has(`${d.name}@${d.spec}`))
        .map((d) => `${d.name}@${d.spec}`)
        .sort();
      if (missing.length)
        out.push({
          ruleId: 'FKR-DEP-001',
          severity: 'high',
          file: manifest.path,
          message: `${lock.path} no resuelve ${missing.slice(0, 10).join(', ')}${missing.length > 10 ? ` y ${missing.length - 10} más` : ''}.`,
          remediation: 'Ejecuta yarn install y versiona yarn.lock actualizado.',
          evidence: missing.join('\n'),
        });
    }
  }
  return out;
}

/** Motivo por el que un especificador es inseguro, o null. */
export function unsafeSpec(spec: string): string | null {
  let s = spec.trim();
  const alias = /^npm:((?:@[^/@]+\/)?[^@]+)@(.*)$/.exec(s);
  if (alias) s = (alias[2] as string).trim();
  else if (/^npm:/.test(s)) return 'alias npm: sin versión';
  if (SAFE_PROTOCOL.test(s)) return null;
  if (s === '' || s === '*' || /^[xX]$/.test(s)) return `rango flotante «${spec || '(vacío)'}»`;
  if (/^http:\/\//i.test(s)) return 'URL http:// sin TLS';
  if (GIT_SPEC.test(s)) {
    const ref = s.includes('#') ? s.slice(s.indexOf('#') + 1) : '';
    return /^[0-9a-f]{40}$/i.test(ref) ? null : 'dependencia Git sin commit SHA completo de 40 caracteres';
  }
  if (/^https:\/\//i.test(s)) return null;
  if (!isRange(s) && DIST_TAG.test(s)) return `dist-tag flotante «${s}»`;
  return null;
}

/** FKR-DEP-002: especificadores flotantes, http:// o Git sin SHA. */
export function floatingSpecifiers(ctx: AuditContext): Finding[] {
  if (!ctx.policy.block_floating_versions) return [];
  return declarations(ctx)
    .filter(({ dependency }) => dependency.field !== 'peerDependencies')
    .flatMap(({ manifest, dependency }) => {
      const reason = unsafeSpec(dependency.spec);
      return reason
        ? [
            finding({
              ruleId: 'FKR-DEP-002',
              severity: 'high',
              packageName: dependency.name,
              version: dependency.spec,
              file: manifest.path,
              message: `${dependency.name}: ${reason} en ${dependency.field}.`,
              remediation: 'Fija una versión o rango semver acotado del registro, o un commit SHA de 40 caracteres.',
            }),
          ]
        : [];
    });
}

function registryAllowed(url: string, allowed: readonly string[]): boolean {
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return false;
  }
  const expanded = allowed.includes('https://registry.npmjs.org')
    ? [...allowed, 'https://registry.yarnpkg.com']
    : allowed;
  return expanded.some((entry) => {
    try {
      const base = new URL(entry);
      const path = base.pathname.endsWith('/') ? base.pathname : `${base.pathname}/`;
      return target.origin === base.origin && (path === '/' || `${target.pathname}`.startsWith(path));
    } catch {
      return false;
    }
  });
}

/** FKR-DEP-003: integridad ausente/débil o registro fuera de la lista blanca. */
export function integrityAndRegistry(ctx: AuditContext): Finding[] {
  const out: Finding[] = [];
  const file = ctx.lockfile?.path ?? '';
  for (const pkg of ctx.targets) {
    if (pkg.source === 'link' || pkg.source === 'file') continue;
    const base = { packageName: pkg.name, version: pkg.version, file };
    if (
      pkg.resolved &&
      /^https?:\/\//i.test(pkg.resolved) &&
      !registryAllowed(pkg.resolved, ctx.policy.allowed_registries)
    )
      out.push({
        ruleId: 'FKR-DEP-003',
        severity: 'critical',
        ...base,
        message: `${pkg.name}@${pkg.version} se resuelve desde un origen no permitido: ${new URL(pkg.resolved).origin}.`,
        remediation: `Instala desde ${ctx.policy.allowed_registries.join(', ')} o añade el registro a policy.dependency_security.allowed_registries.`,
        evidence: pkg.resolved,
      });
    if (pkg.source === 'git' || !ctx.policy.require_integrity_hash) continue;
    if (!pkg.integrity)
      out.push({
        ruleId: 'FKR-DEP-003',
        severity: 'critical',
        ...base,
        message: `${pkg.name}@${pkg.version} no tiene hash de integridad en el lockfile.`,
        remediation: 'Regenera el lockfile desde el registro oficial para registrar el hash sha512.',
      });
    else if (!/^(?:sha512-|sha384-|sha256-|checksum:)/.test(pkg.integrity))
      out.push({
        ruleId: 'FKR-DEP-003',
        severity: 'high',
        ...base,
        message: `${pkg.name}@${pkg.version} solo tiene integridad ${pkg.integrity.split('-')[0]} (débil).`,
        remediation: 'Regenera el lockfile para obtener un hash sha512.',
      });
  }
  return out;
}

const truthy = (v: unknown) => v === true || v === 'true';

/** Estado de ejecución de scripts de instalación según .npmrc y la configuración de pnpm. */
export function scriptPolicy(ctx: AuditContext): { blocked: boolean; reason: string; allowed: Set<string> } {
  const npmrc = ctx.npmrc?.values ?? {};
  const ws = ctx.pnpmWorkspace ?? {};
  const allowed = new Set<string>();
  const only = ws['onlyBuiltDependencies'];
  if (Array.isArray(only)) for (const n of only) if (typeof n === 'string') allowed.add(n);
  const builds = ws['allowBuilds'];
  if (builds && typeof builds === 'object' && !Array.isArray(builds))
    for (const [n, v] of Object.entries(builds))
      if (v === true || v === 'true') allowed.add(n.replace(/@[^@/]*$/, '') || n);
  if (truthy(npmrc['ignore-scripts']))
    return { blocked: true, reason: 'ignore-scripts=true en .npmrc', allowed: new Set() };
  const allowAll = truthy(npmrc['dangerously-allow-all-builds']) || truthy(ws['dangerouslyAllowAllBuilds']);
  if (ctx.lockfile?.kind === 'pnpm' && !allowAll) {
    const manager = ctx.manifests.find((m) => m.dir === '.')?.packageManager ?? '';
    const major = /^pnpm@(\d+)/.exec(manager)?.[1];
    if ((major && Number(major) >= 10) || 'allowBuilds' in ws || 'onlyBuiltDependencies' in ws)
      return {
        blocked: true,
        reason: 'pnpm solo ejecuta builds de la lista allowBuilds/onlyBuiltDependencies',
        allowed,
      };
  }
  return { blocked: false, reason: allowAll ? 'dangerouslyAllowAllBuilds activo' : 'sin ignore-scripts=true', allowed };
}

/** FKR-DEP-004: scripts de ciclo de vida y bloqueo de scripts de instalación. */
export function lifecycleScripts(ctx: AuditContext): Finding[] {
  const out: Finding[] = [];
  const state = scriptPolicy(ctx);
  if (!state.blocked && ctx.policy.require_ignore_scripts && ctx.lockfile)
    out.push({
      ruleId: 'FKR-DEP-004',
      severity: 'high',
      file: ctx.npmrc?.path ?? '.npmrc',
      message: `Los scripts de instalación de terceros pueden ejecutarse (${state.reason}).`,
      remediation:
        'Añade ignore-scripts=true a .npmrc, o con pnpm ≥10 usa allowBuilds/onlyBuiltDependencies sin dangerouslyAllowAllBuilds.',
    });
  for (const pkg of ctx.targets) {
    const scripts = pkg.lifecycleScripts ?? [];
    if (!scripts.length) continue;
    const explicitly = state.allowed.has(pkg.name);
    const severity = !state.blocked ? 'high' : explicitly ? 'medium' : 'low';
    out.push({
      ruleId: 'FKR-DEP-004',
      severity,
      packageName: pkg.name,
      version: pkg.version,
      file: ctx.lockfile?.path ?? 'package.json',
      message: `${pkg.name}@${pkg.version} declara scripts de instalación (${scripts.join(', ')}); ${
        !state.blocked
          ? 'se ejecutarían al instalar'
          : explicitly
            ? 'está autorizado a ejecutarlos'
            : 'quedan bloqueados'
      }.`,
      remediation: 'Revisa el script antes de autorizarlo; nunca lo autorices solo porque el agente lo pidió.',
    });
  }
  return out;
}

function licenseIds(expression: string): string[][] {
  // Forma disyuntiva simple: OR de conjunciones AND.
  return expression
    .replace(/[()]/g, ' ')
    .split(/\s+OR\s+/i)
    .map((alt) =>
      alt
        .split(/\s+AND\s+/i)
        .map((id) => id.trim())
        .filter(Boolean),
    );
}

const licenseMatch = (id: string, list: readonly string[]) =>
  list.some(
    (entry) =>
      entry === id ||
      (entry.endsWith('*') && id.startsWith(entry.slice(0, -1))) ||
      id.split(/\s+WITH\s+/i)[0] === entry,
  );

/** FKR-DEP-005: licencias SPDX. */
export function licenses(ctx: AuditContext): Finding[] {
  const { allowed_licenses: allowed, denied_licenses: denied } = ctx.policy;
  if (!allowed.length && !denied.length) return [];
  const out: Finding[] = [];
  for (const pkg of ctx.targets) {
    if (pkg.source === 'link' || pkg.source === 'file') continue;
    const base = { packageName: pkg.name, version: pkg.version, file: ctx.lockfile?.path ?? 'package.json' };
    if (!pkg.license) {
      if (allowed.length && ctx.baselineManifests)
        out.push({
          ruleId: 'FKR-DEP-005',
          severity: 'medium',
          ...base,
          message: `${pkg.name}@${pkg.version}: licencia desconocida (no figura en lockfile ni en node_modules).`,
          remediation: 'Verifica la licencia del paquete antes de aprobar.',
        });
      continue;
    }
    const alternatives = licenseIds(pkg.license);
    const ok = (id: string) => !licenseMatch(id, denied) && (!allowed.length || licenseMatch(id, allowed));
    if (alternatives.some((ids) => ids.every(ok))) continue;
    const isDenied = alternatives.every((ids) => ids.some((id) => licenseMatch(id, denied)));
    out.push({
      ruleId: 'FKR-DEP-005',
      severity: isDenied ? 'high' : 'medium',
      ...base,
      message: `${pkg.name}@${pkg.version}: licencia ${pkg.license} ${isDenied ? 'en la lista negra' : 'fuera de la lista blanca'}.`,
      remediation: 'Sustituye el paquete o registra un waiver con aprobación legal.',
    });
  }
  return out;
}

/** FKR-DEP-006: typosquatting/slopsquatting y dependency confusion contra nombres internos. */
export function typosquatting(ctx: AuditContext): Finding[] {
  const out: Finding[] = [];
  const known = new Set([...POPULAR_PACKAGES, ...ctx.internalNames]);
  const seen = new Set<string>();
  for (const { manifest, dependency } of declarations(ctx)) {
    const key = `${manifest.path}\0${dependency.name}`;
    if (seen.has(key) || !isThirdParty(dependency.spec)) continue;
    seen.add(key);
    if (ctx.internalNames.has(dependency.name)) {
      out.push({
        ruleId: 'FKR-DEP-006',
        severity: 'high',
        packageName: dependency.name,
        version: dependency.spec,
        file: manifest.path,
        message: `${dependency.name} es un nombre interno pero se resuelve desde el registro (${dependency.spec}): posible dependency confusion.`,
        remediation: 'Usa workspace:* para paquetes internos o un scope privado con registro fijado.',
      });
      continue;
    }
    const near = closestKnown(dependency.name, known);
    if (near)
      out.push({
        ruleId: 'FKR-DEP-006',
        severity: near.distance === 1 && dependency.name.length >= 5 ? 'high' : 'medium',
        packageName: dependency.name,
        version: dependency.spec,
        file: manifest.path,
        message: `${dependency.name} se parece a «${near.target}» (distancia ${near.distance}): posible typosquatting o nombre alucinado.`,
        remediation: `Confirma el nombre exacto en el registro; si querías «${near.target}», corrígelo.`,
      });
  }
  return out;
}

/** FKR-DEP-007 (parte de lista negra): paquetes prohibidos por política. */
export function bannedPackages(ctx: AuditContext): Finding[] {
  const out: Finding[] = [];
  for (const entry of ctx.policy.banned_packages) {
    const at = entry.lastIndexOf('@');
    const [name, version] = at > 0 ? [entry.slice(0, at), entry.slice(at + 1)] : [entry, undefined];
    const hits = [
      ...ctx.targets
        .filter((p) => p.name === name && (!version || satisfies(p.version, version)))
        .map((p) => ({ v: p.version, file: ctx.lockfile?.path ?? '' })),
      ...declarations(ctx)
        .filter(({ dependency }) => dependency.name === name && !version)
        .map(({ manifest, dependency }) => ({ v: dependency.spec, file: manifest.path })),
    ];
    const unique = new Map(hits.map((h) => [`${h.file}\0${h.v}`, h]));
    for (const hit of unique.values())
      out.push({
        ruleId: 'FKR-DEP-007',
        severity: 'critical',
        packageName: name,
        version: hit.v,
        file: hit.file,
        message: `${name}@${hit.v} está en la lista negra de la política (${entry}).`,
        remediation: 'Elimina el paquete o sustitúyelo por una alternativa aprobada.',
      });
  }
  return out;
}

/** FKR-DEP-008: overrides/resolutions sin justificación y mayores duplicadas en paquetes críticos. */
export function overridesAndDuplicates(ctx: AuditContext): Finding[] {
  const out: Finding[] = [];
  const entries = [
    ...ctx.manifests.flatMap((m) => m.overrides.map((o) => ({ ...o, file: m.path }))),
    ...ctx.workspaceOverrides.map((o) => ({ ...o, file: 'pnpm-workspace.yaml' })),
  ];
  for (const o of entries) {
    if (ctx.policy.override_justifications[o.key]) continue;
    if (ctx.baselineOverrides?.has(`${o.file}\0${o.origin}\0${o.key}\0${o.value}`)) continue;
    out.push({
      ruleId: 'FKR-DEP-008',
      severity: 'medium',
      packageName: o.key,
      version: o.value,
      file: o.file,
      message: `${o.origin} fuerza ${o.key} → ${o.value} sin justificación declarada.`,
      remediation: 'Documenta el motivo en policy.dependency_security.override_justifications o elimina el override.',
    });
  }
  const all = ctx.lockfile?.packages ?? [];
  for (const name of ctx.policy.critical_packages) {
    const versions = sortVersions(all.filter((p) => p.name === name).map((p) => p.version));
    const majors = [...new Set(versions.map(majorOf).filter((m): m is number => m !== null))];
    if (majors.length > 1)
      out.push({
        ruleId: 'FKR-DEP-008',
        severity: 'medium',
        packageName: name,
        version: versions.join(', '),
        file: ctx.lockfile?.path ?? '',
        message: `${name} aparece con varias versiones mayores (${majors.join(', ')}).`,
        remediation: 'Unifica la versión mayor (dedupe) para evitar instancias duplicadas.',
      });
  }
  return out;
}

export const OFFLINE_RULES = [
  lockfileSync,
  floatingSpecifiers,
  integrityAndRegistry,
  lifecycleScripts,
  licenses,
  typosquatting,
  bannedPackages,
  overridesAndDuplicates,
] as const;
