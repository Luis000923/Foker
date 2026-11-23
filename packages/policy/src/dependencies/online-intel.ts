/**
 * FKR-DEP-009..011: inteligencia de red opt-in (OSV y metadatos del registro npm) con caché local y TTL.
 * En modo offline no se realiza ninguna llamada de red. Las respuestas externas se validan y sanean.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { DependencyFinding, DependencySeverity, ResolvedDependencyPolicy } from '@foker/schemas';
import type { LockPackage } from './parsers.js';

export type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal },
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export const OSV_BATCH_URL = 'https://api.osv.dev/v1/querybatch';
export const OSV_VULN_URL = 'https://api.osv.dev/v1/vulns/';
const MAX_BATCH = 1000;
const MAX_VULN_DETAILS = 200;
const MAX_REGISTRY_LOOKUPS = 200;

interface CacheEntry {
  at: string;
  value: unknown;
}
interface CacheFile {
  schema_version: 1;
  entries: Record<string, CacheEntry>;
}

/** Texto externo saneado: sin caracteres de control y con longitud acotada. */
export function sanitize(value: unknown, max = 300): string | undefined {
  if (typeof value !== 'string') return undefined;
  // biome-ignore lint/suspicious/noControlCharactersInRegex: el objetivo es eliminarlos.
  const clean = value.replace(/[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩]/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

const obj = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

export class IntelCache {
  private data: CacheFile = { schema_version: 1, entries: {} };
  private dirty = false;
  constructor(
    private readonly path: string,
    private readonly ttlMs: number,
    private readonly now: () => number,
  ) {}
  async load(): Promise<void> {
    try {
      const parsed = obj(JSON.parse(await readFile(this.path, 'utf8')));
      if (parsed['schema_version'] === 1) {
        const entries: Record<string, CacheEntry> = {};
        for (const [key, raw] of Object.entries(obj(parsed['entries']))) {
          const e = obj(raw);
          if (typeof e['at'] === 'string' && 'value' in e) entries[key] = { at: e['at'], value: e['value'] };
        }
        this.data = { schema_version: 1, entries };
      }
    } catch {
      // Caché ausente o corrupta: se reconstruye.
    }
  }
  get(key: string): unknown {
    const entry = this.data.entries[key];
    if (!entry) return undefined;
    const age = this.now() - Date.parse(entry.at);
    return Number.isFinite(age) && age >= 0 && age <= this.ttlMs ? entry.value : undefined;
  }
  set(key: string, value: unknown): void {
    this.data.entries[key] = { at: new Date(this.now()).toISOString(), value };
    this.dirty = true;
  }
  async save(): Promise<void> {
    if (!this.dirty) return;
    // Purga entradas caducadas y escribe de forma atómica.
    for (const [key, entry] of Object.entries(this.data.entries))
      if (!(this.now() - Date.parse(entry.at) <= this.ttlMs)) delete this.data.entries[key];
    await mkdir(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.${process.pid}.tmp`;
    const sorted = Object.fromEntries(Object.entries(this.data.entries).sort(([a], [b]) => (a < b ? -1 : 1)));
    await writeFile(tmp, `${JSON.stringify({ schema_version: 1, entries: sorted })}\n`);
    await rename(tmp, this.path);
  }
}

export interface IntelOptions {
  policy: ResolvedDependencyPolicy;
  fetch: FetchLike;
  cache: IntelCache;
  now: () => number;
  lockfilePath: string;
}

interface Vuln {
  id: string;
  severity: DependencySeverity;
  summary?: string;
  aliases: string[];
}

class NetworkError extends Error {}

async function request(options: IntelOptions, url: string, body?: unknown): Promise<unknown> {
  let response: Awaited<ReturnType<FetchLike>>;
  try {
    response = await options.fetch(url, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { accept: 'application/json', ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(options.policy.network_timeout_ms),
    });
  } catch (error) {
    throw new NetworkError(`${new URL(url).host}: ${sanitize((error as Error).message) ?? 'error de red'}`);
  }
  if (response.status === 404) return null;
  if (!response.ok) throw new NetworkError(`${new URL(url).host}: HTTP ${response.status}`);
  try {
    return await response.json();
  } catch {
    throw new NetworkError(`${new URL(url).host}: respuesta no JSON`);
  }
}

/** Severidad OSV: database_specific.severity (GHSA) o puntuación CVSS numérica si existe. */
export function osvSeverity(vuln: Record<string, unknown>): DependencySeverity {
  const label = String(obj(vuln['database_specific'])['severity'] ?? '').toUpperCase();
  if (label === 'CRITICAL') return 'critical';
  if (label === 'HIGH') return 'high';
  if (label === 'MODERATE' || label === 'MEDIUM') return 'medium';
  if (label === 'LOW') return 'low';
  const scores = (Array.isArray(vuln['severity']) ? vuln['severity'] : [])
    .map((s) => Number.parseFloat(String(obj(s)['score'])))
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= 10);
  if (scores.length) {
    const max = Math.max(...scores);
    return max >= 9 ? 'critical' : max >= 7 ? 'high' : max >= 4 ? 'medium' : 'low';
  }
  // Sin severidad publicada: conservador.
  return 'high';
}

async function osv(options: IntelOptions, packages: LockPackage[]): Promise<DependencyFinding[]> {
  const pending = packages.filter((p) => options.cache.get(`osv:${p.name}@${p.version}`) === undefined);
  for (let i = 0; i < pending.length; i += MAX_BATCH) {
    const chunk = pending.slice(i, i + MAX_BATCH);
    const data = obj(
      await request(options, OSV_BATCH_URL, {
        queries: chunk.map((p) => ({ package: { name: p.name, ecosystem: 'npm' }, version: p.version })),
      }),
    );
    const results = Array.isArray(data['results']) ? data['results'] : [];
    if (results.length !== chunk.length) throw new NetworkError('api.osv.dev: respuesta con longitud inesperada');
    chunk.forEach((p, idx) => {
      const vulns = (Array.isArray(obj(results[idx])['vulns']) ? obj(results[idx])['vulns'] : []) as unknown[];
      const ids = vulns
        .map((v) => sanitize(obj(v)['id'], 64))
        .filter((id): id is string => !!id && /^[A-Za-z0-9._:-]+$/.test(id));
      options.cache.set(`osv:${p.name}@${p.version}`, [...new Set(ids)].sort());
    });
  }
  const findings: DependencyFinding[] = [];
  let details = 0;
  for (const p of packages) {
    const ids = (options.cache.get(`osv:${p.name}@${p.version}`) as string[] | undefined) ?? [];
    for (const id of ids) {
      let vuln = options.cache.get(`osv-vuln:${id}`) as Vuln | undefined;
      if (!vuln) {
        if (details++ >= MAX_VULN_DETAILS) vuln = { id, severity: 'high', aliases: [] };
        else {
          const raw = obj(await request(options, `${OSV_VULN_URL}${encodeURIComponent(id)}`));
          const summary = sanitize(raw['summary']);
          vuln = {
            id,
            severity: osvSeverity(raw),
            ...(summary ? { summary } : {}),
            aliases: (Array.isArray(raw['aliases']) ? raw['aliases'] : [])
              .map((a) => sanitize(a, 64))
              .filter((a): a is string => !!a)
              .sort(),
          };
          options.cache.set(`osv-vuln:${id}`, vuln);
        }
      }
      findings.push({
        ruleId: 'FKR-DEP-009',
        severity: vuln.severity,
        packageName: p.name,
        version: p.version,
        file: options.lockfilePath,
        message: `${p.name}@${p.version}: vulnerabilidad conocida ${vuln.id}${vuln.aliases.length ? ` (${vuln.aliases.join(', ')})` : ''}${vuln.summary ? `: ${vuln.summary}` : ''}.`,
        remediation:
          'Actualiza a una versión corregida (consulta https://osv.dev) o registra un waiver con fecha de expiración.',
        evidence: `https://osv.dev/vulnerability/${encodeURIComponent(vuln.id)}`,
      });
    }
  }
  return findings;
}

interface RegistryInfo {
  published?: string;
  deprecated?: string;
  provenance: boolean;
  found: boolean;
}

async function registry(options: IntelOptions, packages: LockPackage[]): Promise<DependencyFinding[]> {
  const base = (options.policy.allowed_registries[0] ?? 'https://registry.npmjs.org').replace(/\/$/, '');
  const findings: DependencyFinding[] = [];
  for (const p of packages.slice(0, MAX_REGISTRY_LOOKUPS)) {
    const key = `npm:${p.name}@${p.version}`;
    let info = options.cache.get(key) as RegistryInfo | undefined;
    if (!info) {
      const doc = obj(await request(options, `${base}/${p.name.replace('/', '%2f')}`));
      const version = obj(obj(doc['versions'])[p.version]);
      const deprecated = sanitize(version['deprecated']);
      const published = sanitize(obj(doc['time'])[p.version], 40);
      info = {
        found: Object.keys(version).length > 0,
        provenance: Boolean(obj(obj(version['dist'])['attestations'])['provenance']),
        ...(deprecated ? { deprecated } : {}),
        ...(published && !Number.isNaN(Date.parse(published)) ? { published } : {}),
      };
      options.cache.set(key, info);
    }
    const base2 = { packageName: p.name, version: p.version, file: options.lockfilePath };
    if (!info.found) {
      findings.push({
        ruleId: 'FKR-DEP-011',
        severity: 'high',
        ...base2,
        message: `${p.name}@${p.version} no existe en ${base} (retirado o despublicado).`,
        remediation: 'Elige una versión publicada; un paquete retirado puede reaparecer con otro contenido.',
      });
      continue;
    }
    if (info.deprecated)
      findings.push({
        ruleId: 'FKR-DEP-011',
        severity: 'medium',
        ...base2,
        message: `${p.name}@${p.version} está marcado como deprecated: ${info.deprecated}`,
        remediation: 'Migra a la alternativa recomendada por el mantenedor.',
      });
    if (info.published && options.policy.min_release_age_hours > 0) {
      const ageHours = (options.now() - Date.parse(info.published)) / 3_600_000;
      if (ageHours < options.policy.min_release_age_hours)
        findings.push({
          ruleId: 'FKR-DEP-010',
          severity: 'high',
          ...base2,
          message: `${p.name}@${p.version} se publicó hace ${Math.max(0, Math.floor(ageHours))} h (enfriamiento mínimo ${options.policy.min_release_age_hours} h).`,
          remediation: 'Espera a que termine el periodo de enfriamiento o fija la versión anterior.',
          evidence: info.published,
        });
    }
    if (options.policy.require_provenance && !info.provenance)
      findings.push({
        ruleId: 'FKR-DEP-010',
        severity: 'medium',
        ...base2,
        message: `${p.name}@${p.version} no publica attestations de procedencia (npm provenance).`,
        remediation: 'Prefiere versiones publicadas con --provenance (Trusted Publishing).',
      });
  }
  return findings;
}

/** Ejecuta FKR-DEP-009..011 sobre paquetes del registro. Los errores de red se degradan según la política. */
export async function onlineIntel(options: IntelOptions, packages: LockPackage[]): Promise<DependencyFinding[]> {
  const targets = packages.filter((p) => p.source === 'registry');
  if (!targets.length) return [];
  await options.cache.load();
  const findings: DependencyFinding[] = [];
  for (const [rule, run] of [
    ['FKR-DEP-009', osv],
    ['FKR-DEP-010', registry],
  ] as const) {
    try {
      findings.push(...(await run(options, targets)));
    } catch (error) {
      if (!(error instanceof NetworkError)) throw error;
      const closed = options.policy.on_network_error === 'fail-closed';
      findings.push({
        ruleId: rule,
        severity: closed ? 'critical' : 'low',
        file: options.lockfilePath,
        message: `Inteligencia de red no disponible (${error.message}); ${closed ? 'fail-closed: se bloquea' : 'se continúa sin ella'}.`,
        remediation: 'Reintenta con red o usa --offline para limitarte a las reglas deterministas.',
      });
    }
  }
  try {
    await options.cache.save();
  } catch {
    // La caché es una optimización; no invalida el informe.
  }
  return findings;
}
