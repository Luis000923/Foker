import type {
  DependencyAuditReport,
  DependencySecurityPolicy,
  DependencySeverity,
  DependencyWaiversFile,
} from './generated/types.js';
import { type ValidationResult, validate } from './validate.js';

/** Política efectiva de FKR-DEP-* cuando foker.config.yaml no declara `policy.dependency_security`. */
export const DEFAULT_DEPENDENCY_POLICY = {
  enabled: true,
  mode: 'offline',
  fail_on: 'high',
  allowed_registries: ['https://registry.npmjs.org'],
  allowed_licenses: [],
  denied_licenses: ['AGPL-1.0-only', 'AGPL-3.0-only', 'AGPL-3.0-or-later', 'SSPL-1.0', 'BUSL-1.1'],
  require_ignore_scripts: true,
  require_integrity_hash: true,
  block_floating_versions: true,
  require_provenance: false,
  min_release_age_hours: 72,
  banned_packages: [],
  internal_packages: [],
  critical_packages: ['react', 'react-dom', 'next', 'typescript'],
  override_justifications: {},
  on_network_error: 'warn',
  cache_ttl_hours: 6,
  network_timeout_ms: 8000,
} as const satisfies Required<DependencySecurityPolicy>;

export type ResolvedDependencyPolicy = Required<DependencySecurityPolicy>;

/** Fusiona la política del proyecto sobre los valores por defecto. */
export function resolveDependencyPolicy(project: DependencySecurityPolicy = {}): ResolvedDependencyPolicy {
  return structuredClone({ ...DEFAULT_DEPENDENCY_POLICY, ...project }) as ResolvedDependencyPolicy;
}

/** Orden de severidad: mayor número = más grave. */
export const DEPENDENCY_SEVERITY_RANK: Record<DependencySeverity, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export const validateDependencyPolicy = (data: unknown): ValidationResult<DependencySecurityPolicy> =>
  validate('dependency-security#/$defs/policy', data);
export const validateDependencyWaivers = (data: unknown): ValidationResult<DependencyWaiversFile> =>
  validate('dependency-security#/$defs/waivers', data);
export const validateDependencyReport = (data: unknown): ValidationResult<DependencyAuditReport> =>
  validate('dependency-security', data);
