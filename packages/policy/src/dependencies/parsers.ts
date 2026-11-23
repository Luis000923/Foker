/**
 * Parseo estático y determinista de manifiestos y lockfiles. Nunca ejecuta código ni instala nada:
 * todo el contenido se trata como entrada no confiable.
 */
import { asMap, parseYaml, type YamlValue } from './yaml-lite.js';

export const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
] as const;
export type DependencyField = (typeof DEPENDENCY_FIELDS)[number];
export const LIFECYCLE_SCRIPTS = ['preinstall', 'install', 'postinstall', 'prepare'] as const;

export type LockfileKind = 'pnpm' | 'npm' | 'yarn-v1' | 'yarn-berry';
export const LOCKFILES: readonly { file: string; kind: LockfileKind | 'yarn' }[] = [
  { file: 'pnpm-lock.yaml', kind: 'pnpm' },
  { file: 'package-lock.json', kind: 'npm' },
  { file: 'npm-shrinkwrap.json', kind: 'npm' },
  { file: 'yarn.lock', kind: 'yarn' },
];

export type PackageSource = 'registry' | 'tarball' | 'git' | 'link' | 'file';

export interface LockPackage {
  name: string;
  version: string;
  source: PackageSource;
  resolved?: string;
  integrity?: string;
  license?: string;
  /** Scripts de ciclo de vida conocidos; `['install']` si el lockfile solo dice que existen. */
  lifecycleScripts?: string[];
  deprecated?: string;
}

export interface ManifestDependency {
  name: string;
  spec: string;
  field: DependencyField;
}

export interface OverrideEntry {
  key: string;
  value: string;
  /** Campo de origen: `overrides`, `resolutions`, `pnpm.overrides` o `pnpm-workspace.yaml#overrides`. */
  origin: string;
}

export interface Manifest {
  /** Ruta POSIX relativa al root (`package.json`, `packages/a/package.json`). */
  path: string;
  /** Directorio del importer (`.`, `packages/a`). */
  dir: string;
  name?: string;
  packageManager?: string;
  dependencies: ManifestDependency[];
  overrides: OverrideEntry[];
  workspaces: string[];
}

export interface Lockfile {
  kind: LockfileKind;
  path: string;
  packages: LockPackage[];
  /** dir del importer → nombre → especificador registrado en el lockfile (pnpm, npm). */
  importers?: Record<string, Record<string, string>>;
  /** Descriptores `nombre@rango` (yarn). */
  descriptors?: Set<string>;
}

/** Adaptador por ecosistema; npm es el único hoy (Cargo queda preparado para el futuro). */
export interface EcosystemAdapter {
  ecosystem: 'npm' | 'cargo';
  manifest: string;
  lockfiles: readonly string[];
  parseManifest(text: string, path: string): Manifest;
  parseLockfile(text: string, path: string): Lockfile;
}

export class DependencyParseError extends Error {
  constructor(
    readonly file: string,
    message: string,
  ) {
    super(message);
  }
}

const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
const obj = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/** Separa `nombre@versión` respetando scopes (`@scope/x@1.0.0`). */
export function splitNameVersion(key: string): { name: string; version: string } | null {
  const at = key.lastIndexOf('@');
  if (at <= 0) return null;
  return { name: key.slice(0, at), version: key.slice(at + 1) };
}

export function licenseOf(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined;
  if (Array.isArray(value)) {
    const ids = value.map((v) => licenseOf(obj(v)['type'] ?? v)).filter(Boolean);
    return ids.length ? (ids.length > 1 ? `(${ids.join(' OR ')})` : ids[0]) : undefined;
  }
  return str(obj(value)['type']);
}

export function classifySource(resolved: string | undefined): PackageSource {
  if (!resolved) return 'registry';
  if (/^(?:link|workspace|portal):/.test(resolved)) return 'link';
  if (/^file:/.test(resolved) || resolved.startsWith('.') || resolved.startsWith('/')) return 'file';
  if (
    /^(?:git\+|git:|github:|gitlab:|bitbucket:|ssh:)/.test(resolved) ||
    /codeload\.github\.com|\.git(?:#|$)/.test(resolved)
  )
    return 'git';
  if (/^https?:\/\//.test(resolved)) return /\/-\/[^/]+\.tgz(?:[#?].*)?$/.test(resolved) ? 'registry' : 'tarball';
  return 'registry';
}

function flattenOverrides(value: unknown, origin: string, prefix = ''): OverrideEntry[] {
  const out: OverrideEntry[] = [];
  for (const [key, v] of Object.entries(obj(value))) {
    const full = prefix ? `${prefix}>${key}` : key;
    if (typeof v === 'string') out.push({ key: full, value: v, origin });
    else if (v && typeof v === 'object') {
      const self = obj(v)['.'];
      if (typeof self === 'string') out.push({ key: full, value: self, origin });
      out.push(
        ...flattenOverrides(Object.fromEntries(Object.entries(obj(v)).filter(([k]) => k !== '.')), origin, full),
      );
    }
  }
  return out;
}

export function parseManifest(text: string, path: string): Manifest {
  let data: Record<string, unknown>;
  try {
    data = obj(JSON.parse(text));
  } catch (error) {
    throw new DependencyParseError(path, `JSON inválido: ${(error as Error).message}`);
  }
  const dependencies: ManifestDependency[] = [];
  for (const field of DEPENDENCY_FIELDS)
    for (const [name, spec] of Object.entries(obj(data[field])))
      if (typeof spec === 'string') dependencies.push({ name, spec: spec.trim(), field });
  const workspacesField = data['workspaces'];
  const workspaces = (
    Array.isArray(workspacesField) ? workspacesField : (obj(workspacesField)['packages'] ?? [])
  ) as unknown[];
  const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '.';
  const name = str(data['name']);
  const packageManager = str(data['packageManager']);
  return {
    path,
    dir,
    ...(name ? { name } : {}),
    ...(packageManager ? { packageManager } : {}),
    dependencies,
    overrides: [
      ...flattenOverrides(data['overrides'], 'overrides'),
      ...flattenOverrides(data['resolutions'], 'resolutions'),
      ...flattenOverrides(obj(data['pnpm'])['overrides'], 'pnpm.overrides'),
    ],
    workspaces: workspaces.filter((w): w is string => typeof w === 'string'),
  };
}

function dedupe(packages: LockPackage[]): LockPackage[] {
  const map = new Map<string, LockPackage>();
  for (const pkg of packages) {
    const key = `${pkg.name}@${pkg.version}`;
    const prev = map.get(key);
    // Fusiona información parcial de entradas repetidas (npm repite paquetes en rutas anidadas).
    map.set(
      key,
      prev ? { ...pkg, ...prev, ...(prev.integrity ? {} : pkg.integrity ? { integrity: pkg.integrity } : {}) } : pkg,
    );
  }
  return [...map.values()].sort((a, b) =>
    a.name === b.name ? (a.version < b.version ? -1 : 1) : a.name < b.name ? -1 : 1,
  );
}

export function parsePnpmLock(text: string, path = 'pnpm-lock.yaml'): Lockfile {
  let doc: Record<string, YamlValue>;
  try {
    doc = asMap(parseYaml(text));
  } catch (error) {
    throw new DependencyParseError(path, `YAML inválido: ${(error as Error).message}`);
  }
  const packages: LockPackage[] = [];
  for (const [rawKey, rawValue] of Object.entries(asMap(doc['packages']))) {
    const v5 = /^\/?((?:@[^/]+\/)?[^/@]+)\/(\d[^/_(]*)/.exec(rawKey);
    const nv =
      v5 && !/^\/?(?:@[^/]+\/)?[^/@]+@/.test(rawKey)
        ? { name: v5[1] as string, version: v5[2] as string }
        : splitNameVersion(rawKey.replace(/^\//, '').replace(/\(.*$/, ''));
    if (!nv) continue;
    const value = asMap(rawValue);
    const resolution = asMap(value['resolution']);
    let resolved = str(resolution['tarball']);
    if (resolution['type'] === 'git' || str(resolution['repo']))
      resolved = `git+${str(resolution['repo']) ?? ''}#${str(resolution['commit']) ?? ''}`;
    else if (str(resolution['directory'])) resolved = `file:${str(resolution['directory'])}`;
    const integrity = str(resolution['integrity']);
    const deprecated = str(value['deprecated']);
    packages.push({
      name: str(value['name']) ?? nv.name,
      version: str(value['version']) ?? nv.version,
      source: classifySource(resolved),
      ...(resolved ? { resolved } : {}),
      ...(integrity ? { integrity } : {}),
      ...(value['requiresBuild'] === true ? { lifecycleScripts: ['install'] } : {}),
      ...(deprecated ? { deprecated } : {}),
    });
  }
  const rawImporters = asMap(doc['importers']);
  const importerDocs = Object.keys(rawImporters).length ? rawImporters : { '.': doc as YamlValue };
  const importers: Record<string, Record<string, string>> = {};
  for (const [dir, raw] of Object.entries(importerDocs)) {
    const importer = asMap(raw);
    const specifiers = asMap(importer['specifiers']);
    const specs: Record<string, string> = {};
    for (const field of DEPENDENCY_FIELDS)
      for (const [name, entry] of Object.entries(asMap(importer[field]))) {
        const spec = str(asMap(entry)['specifier']) ?? str(specifiers[name]);
        if (spec !== undefined) specs[name] = spec;
      }
    importers[dir] = specs;
  }
  return { kind: 'pnpm', path, packages: dedupe(packages), importers };
}

export function parseNpmLock(text: string, path = 'package-lock.json'): Lockfile {
  let doc: Record<string, unknown>;
  try {
    doc = obj(JSON.parse(text));
  } catch (error) {
    throw new DependencyParseError(path, `JSON inválido: ${(error as Error).message}`);
  }
  const packages: LockPackage[] = [];
  const importers: Record<string, Record<string, string>> = {};
  const entry = (name: string, value: Record<string, unknown>) => {
    const version = str(value['version']);
    if (!version || value['link'] === true) return;
    const resolved = str(value['resolved']);
    const integrity = str(value['integrity']);
    const license = licenseOf(value['license']);
    const deprecated = str(value['deprecated']);
    packages.push({
      name,
      version,
      source: classifySource(resolved ?? (version.includes(':') ? version : undefined)),
      ...(resolved ? { resolved } : {}),
      ...(integrity ? { integrity } : {}),
      ...(license ? { license } : {}),
      ...(value['hasInstallScript'] === true ? { lifecycleScripts: ['install'] } : {}),
      ...(deprecated ? { deprecated } : {}),
    });
  };
  if (Number(doc['lockfileVersion'] ?? 1) >= 2 && doc['packages']) {
    for (const [key, raw] of Object.entries(obj(doc['packages']))) {
      const value = obj(raw);
      const at = key.lastIndexOf('node_modules/');
      if (at < 0) {
        const specs: Record<string, string> = {};
        for (const field of DEPENDENCY_FIELDS.filter((f) => f !== 'peerDependencies'))
          for (const [name, spec] of Object.entries(obj(value[field])))
            if (typeof spec === 'string') specs[name] = spec;
        importers[key === '' ? '.' : key] = specs;
        continue;
      }
      entry(str(value['name']) ?? key.slice(at + 'node_modules/'.length), value);
    }
  } else {
    const walk = (deps: unknown, depth: number) => {
      if (depth > 64) return;
      for (const [name, raw] of Object.entries(obj(deps))) {
        entry(name, obj(raw));
        walk(obj(raw)['dependencies'], depth + 1);
      }
    };
    walk(doc['dependencies'], 0);
  }
  return { kind: 'npm', path, packages: dedupe(packages), ...(Object.keys(importers).length ? { importers } : {}) };
}

function descriptorName(descriptor: string): string | null {
  return splitNameVersion(descriptor)?.name ?? null;
}

export function parseYarnLock(text: string, path = 'yarn.lock'): Lockfile {
  const descriptors = new Set<string>();
  const packages: LockPackage[] = [];
  if (/^__metadata:/m.test(text)) {
    let doc: Record<string, YamlValue>;
    try {
      doc = asMap(parseYaml(text));
    } catch (error) {
      throw new DependencyParseError(path, `YAML inválido: ${(error as Error).message}`);
    }
    for (const [key, raw] of Object.entries(doc)) {
      if (key === '__metadata') continue;
      const value = asMap(raw);
      const resolution = str(value['resolution']) ?? '';
      for (const d of key.split(/,\s*/)) {
        descriptors.add(d);
        descriptors.add(d.replace(/@npm:/, '@'));
      }
      const name = descriptorName(key.split(/,\s*/)[0] as string);
      const version = str(value['version']);
      if (!name || !version || value['linkType'] === 'soft' || /@workspace:/.test(resolution)) continue;
      const protocol = resolution.slice((descriptorName(resolution)?.length ?? 0) + 1);
      const resolved = /^npm:/.test(protocol) ? undefined : protocol;
      const checksum = str(value['checksum']);
      packages.push({
        name,
        version,
        source: resolved?.startsWith('patch:') ? 'registry' : classifySource(resolved),
        ...(resolved ? { resolved } : {}),
        ...(checksum ? { integrity: `checksum:${checksum}` } : {}),
      });
    }
    return { kind: 'yarn-berry', path, packages: dedupe(packages), descriptors };
  }
  let current: { descriptors: string[]; fields: Record<string, string> } | null = null;
  const flush = () => {
    if (!current) return;
    const name = descriptorName(current.descriptors[0] ?? '');
    const version = current.fields['version'];
    if (name && version) {
      const resolved = current.fields['resolved'];
      const integrity = current.fields['integrity'];
      packages.push({
        name,
        version,
        source: classifySource(resolved),
        ...(resolved ? { resolved } : {}),
        ...(integrity ? { integrity } : {}),
      });
    }
    current = null;
  };
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.startsWith('#')) continue;
    if (!line.startsWith(' ')) {
      flush();
      const keys = line
        .replace(/:\s*$/, '')
        .split(/,\s*/)
        .map((k) => k.trim().replace(/^"|"$/g, ''));
      for (const k of keys) descriptors.add(k);
      current = { descriptors: keys, fields: {} };
    } else if (current && /^ {2}\S/.test(line)) {
      const m = /^ {2}([A-Za-z]+)\s+"?([^"]*)"?\s*$/.exec(line);
      if (m) current.fields[m[1] as string] = m[2] as string;
    }
  }
  flush();
  return { kind: 'yarn-v1', path, packages: dedupe(packages), descriptors };
}

export function parseLockfile(text: string, path: string): Lockfile {
  const base = path.slice(path.lastIndexOf('/') + 1);
  if (base === 'pnpm-lock.yaml') return parsePnpmLock(text, path);
  if (base === 'yarn.lock') return parseYarnLock(text, path);
  return parseNpmLock(text, path);
}

/** `.npmrc` → clave/valor (sin interpolar variables ni seguir includes). */
export function parseNpmrc(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    out[line.slice(0, eq).trim().toLowerCase()] = line
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
  }
  return out;
}

export const npmAdapter: EcosystemAdapter = {
  ecosystem: 'npm',
  manifest: 'package.json',
  lockfiles: LOCKFILES.map((l) => l.file),
  parseManifest,
  parseLockfile,
};
