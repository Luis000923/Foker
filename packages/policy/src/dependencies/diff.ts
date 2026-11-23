import type { DependencyDiffEntry } from '@foker/schemas';
import type { LockPackage, Manifest, ManifestDependency } from './parsers.js';
import { sortVersions } from './semver.js';

function group(packages: readonly LockPackage[]): Map<string, Map<string, LockPackage>> {
  const out = new Map<string, Map<string, LockPackage>>();
  for (const pkg of packages) {
    const versions = out.get(pkg.name) ?? new Map<string, LockPackage>();
    versions.set(pkg.version, pkg);
    out.set(pkg.name, versions);
  }
  return out;
}

function details(pkg: LockPackage): Partial<DependencyDiffEntry> {
  return {
    ...(pkg.resolved ? { resolvedUrl: pkg.resolved } : {}),
    ...(pkg.integrity ? { integrity: pkg.integrity } : {}),
    ...(pkg.license ? { license: pkg.license } : {}),
    ...(pkg.lifecycleScripts
      ? { hasLifecycleScripts: pkg.lifecycleScripts.length > 0, lifecycleScripts: [...pkg.lifecycleScripts] }
      : {}),
  };
}

/** Diferencia por paquete entre dos inventorios resueltos. Determinista: orden por nombre y versión. */
export function diffPackages(
  before: readonly LockPackage[],
  after: readonly LockPackage[],
  direct: ReadonlySet<string>,
): DependencyDiffEntry[] {
  const a = group(before);
  const b = group(after);
  const out: DependencyDiffEntry[] = [];
  for (const name of [...new Set([...a.keys(), ...b.keys()])].sort()) {
    const old = a.get(name) ?? new Map<string, LockPackage>();
    const cur = b.get(name) ?? new Map<string, LockPackage>();
    const removed = sortVersions([...old.keys()].filter((v) => !cur.has(v)));
    const added = sortVersions([...cur.keys()].filter((v) => !old.has(v)));
    const base = { name, ecosystem: 'npm' as const, direct: direct.has(name) };
    for (const version of added) {
      const pkg = cur.get(version) as LockPackage;
      const from = old.size ? removed.shift() : undefined;
      out.push({
        ...base,
        changeType: from !== undefined ? 'updated' : 'added',
        ...(from !== undefined ? { fromVersion: from } : {}),
        toVersion: version,
        ...details(pkg),
      });
    }
    for (const version of removed) out.push({ ...base, changeType: 'removed', fromVersion: version });
  }
  return out;
}

/** Dependencias declaradas cuyo especificador es nuevo o cambió respecto a la línea base. */
export function changedDeclarations(
  manifests: readonly Manifest[],
  baseline: ReadonlyMap<string, Manifest | null>,
): { manifest: Manifest; dependency: ManifestDependency }[] {
  const out: { manifest: Manifest; dependency: ManifestDependency }[] = [];
  for (const manifest of manifests) {
    const before = baseline.get(manifest.path);
    const known = new Set((before?.dependencies ?? []).map((d) => `${d.field}\0${d.name}\0${d.spec}`));
    for (const dependency of manifest.dependencies)
      if (!known.has(`${dependency.field}\0${dependency.name}\0${dependency.spec}`)) out.push({ manifest, dependency });
  }
  return out;
}
