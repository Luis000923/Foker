/**
 * Integración del subsistema `dependency-security` (FKR-DEP-*) en el motor: check integrado, gate de
 * aprobación de dependencias y auditoría para CLI/MCP. Separado de `static-security` (FKR-SEC-*).
 */
import { FokerError } from '@foker/core';
import { auditDependencies, type CheckDependenciesOptions, type DependencyAudit, isBlocking } from '@foker/policy';
import {
  type CheckResult,
  type DependencyAuditReport,
  type DependencyFinding,
  type DependencySecurityPolicy,
  type Finding,
  resolveDependencyPolicy,
} from '@foker/schemas';
import { gitRead } from './git.js';

const MAX_DIFF_FINDINGS = 50;

/** Hallazgo FKR-DEP → hallazgo de gate (error si bloquea con el umbral de la política). */
export function toGateFinding(finding: DependencyFinding, failOn: DependencyAuditReport['fail_on']): Finding {
  const blocking = isBlocking(finding, failOn ?? 'high');
  return {
    rule: `dependency/${finding.ruleId}`,
    code: finding.ruleId,
    severity: blocking ? 'error' : 'warning',
    ...(finding.file ? { file: finding.file } : {}),
    message:
      `[${finding.severity}${finding.waived ? `, waiver ${finding.waiverId}` : ''}] ${finding.message} ${finding.remediation}`.trim(),
  };
}

export function summarize(report: DependencyAuditReport): string {
  const s = report.summary;
  return `Dependency Security (FKR-DEP, modo ${report.mode}): ${report.status}; ${s.packages} paquetes, +${s.added} ~${s.updated} -${s.removed}; ${s.findings} hallazgos (${s.blocking} bloqueantes, ${s.waived} con waiver).`;
}

/** Check integrado `builtin: dependency-security`: auditoría completa del lockfile actual. */
export async function runDependencyCheck(
  root: string,
  name: string,
  policy: DependencySecurityPolicy | undefined,
): Promise<CheckResult> {
  const started = Date.now();
  const { report } = await auditDependencies(root, policy ? { policy } : {});
  const failed = report.status === 'FAIL';
  return {
    check: name,
    status: failed ? 'fail' : 'pass',
    exit_code: failed ? 1 : 0,
    duration_ms: Date.now() - started,
    findings: report.findings.filter((f) => f.severity !== 'info').map((f) => toGateFinding(f, report.fail_on)),
    output_tail: summarize(report),
  };
}

/** Línea de evidencia para la persona que aprueba: qué cambió y con qué propiedades. */
function describe(entry: DependencyAuditReport['diff'][number]): string {
  const version =
    entry.changeType === 'updated'
      ? `${entry.fromVersion} → ${entry.toVersion}`
      : (entry.toVersion ?? entry.fromVersion ?? '?');
  const parts = [
    `${entry.changeType === 'added' ? 'añadido' : entry.changeType === 'updated' ? 'actualizado' : 'eliminado'} ${entry.name}@${version}${entry.direct ? ' (directa)' : ''}`,
  ];
  if (entry.changeType !== 'removed') {
    parts.push(`licencia ${entry.license ?? 'desconocida'}`);
    parts.push(entry.integrity ? `integridad ${entry.integrity.split('-')[0]}` : 'sin integridad');
    parts.push(
      entry.hasLifecycleScripts
        ? `scripts de instalación: ${(entry.lifecycleScripts ?? []).join(', ')}`
        : 'sin scripts de instalación',
    );
    if (entry.resolvedUrl) parts.push(`origen ${entry.resolvedUrl.replace(/[?#].*$/, '')}`);
  }
  return parts.join(' · ');
}

/**
 * Gate de `approval_required.dependency_changes`: analiza el delta frente a la línea base de la tarea.
 * Hallazgos ≥ fail_on sin waiver vigente bloquean de forma determinista; el resto se adjunta como evidencia.
 */
export async function dependencyGateFindings(
  root: string,
  policy: DependencySecurityPolicy | undefined,
  baseline: (path: string) => Promise<string | null>,
): Promise<{ blocking: boolean; findings: Finding[]; report: DependencyAuditReport | null }> {
  if (!resolveDependencyPolicy(policy).enabled) return { blocking: false, findings: [], report: null };
  const { report } = await auditDependencies(root, { ...(policy ? { policy } : {}), baseline });
  const findings: Finding[] = [
    { rule: 'dependency/report', severity: report.status === 'FAIL' ? 'error' : 'warning', message: summarize(report) },
    ...report.diff.slice(0, MAX_DIFF_FINDINGS).map((entry) => ({
      rule: 'dependency/diff',
      severity: 'warning' as const,
      ...(report.lockfiles?.[0] ? { file: report.lockfiles[0] } : {}),
      message: describe(entry),
    })),
    ...(report.diff.length > MAX_DIFF_FINDINGS
      ? [
          {
            rule: 'dependency/diff',
            severity: 'warning' as const,
            message: `y ${report.diff.length - MAX_DIFF_FINDINGS} cambios más`,
          },
        ]
      : []),
    ...report.findings.filter((f) => f.severity !== 'info').map((f) => toGateFinding(f, report.fail_on)),
  ];
  return { blocking: report.status === 'FAIL', findings, report };
}

const SAFE_REF = /^(?!-)[A-Za-z0-9._/@^~{}-]{1,200}$/;

/** Auditoría para `foker check-deps` y `foker_check_deps`; `diffBase` audita solo el delta frente a un ref de git. */
export async function checkDependenciesInRepo(
  root: string,
  options: Omit<CheckDependenciesOptions, 'baseline'> & { diffBase?: string },
): Promise<DependencyAudit> {
  const { diffBase, ...rest } = options;
  if (diffBase === undefined) return auditDependencies(root, rest);
  if (!SAFE_REF.test(diffBase) || diffBase.includes('..'))
    throw new FokerError('FKR-INP-001', `Ref de git inválido: ${diffBase}`);
  const resolved = (await gitRead(root, ['rev-parse', '--verify', '--quiet', `${diffBase}^{commit}`]))?.trim();
  if (!resolved) throw new FokerError('FKR-INP-001', `Ref de git inexistente: ${diffBase}`);
  return auditDependencies(root, {
    ...rest,
    baseline: async (path) => gitRead(root, ['show', `${resolved}:./${path}`]),
  });
}
