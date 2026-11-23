import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { checkDependenciesInRepo, FokerError, loadConfig } from '@foker/engine';
import { type Command, flag } from '../types.js';

/** `foker check-deps`: seguridad de dependencias de terceros (FKR-DEP-001..012), separada de check-security. */
export const checkDepsCommand: Command = {
  name: 'check-deps',
  description:
    'Audita dependencias de terceros (FKR-DEP-001..012): lockfiles, rangos, integridad, scripts, licencias, typosquatting y CVEs opt-in',
  maxArgs: 0,
  flags: [
    flag('offline', 'boolean', 'Sin red: solo reglas deterministas (por defecto salvo política hybrid)'),
    flag('online', 'boolean', 'Activa OSV y metadatos del registro (FKR-DEP-009..011)'),
    flag('strict', 'boolean', 'Falla desde severidad medium y ante errores de red (fail-closed)'),
    flag('diff-base', 'string', 'Audita solo el delta frente a un ref de git'),
    flag('sbom', 'string', 'Exporta un SBOM CycloneDX 1.5 JSON a esta ruta'),
  ],
  async run(ctx) {
    if (ctx.flags['offline'] && ctx.flags['online'])
      throw new FokerError('FKR-INP-001', '--offline y --online son incompatibles');
    const loaded = await loadConfig(
      ctx.cwd,
      typeof ctx.flags['config'] === 'string' && ctx.flags['config'] ? { configPath: ctx.flags['config'] } : {},
    );
    const diffBase =
      typeof ctx.flags['diff-base'] === 'string' && ctx.flags['diff-base'] ? ctx.flags['diff-base'] : undefined;
    const sbomPath = typeof ctx.flags['sbom'] === 'string' && ctx.flags['sbom'] ? ctx.flags['sbom'] : undefined;
    const strict = ctx.flags['strict'] === true;
    const policy = loaded.policy.dependency_security;
    const audit = await checkDependenciesInRepo(ctx.cwd, {
      ...(policy ? { policy } : {}),
      ...(ctx.flags['online'] ? { mode: 'hybrid' as const } : ctx.flags['offline'] ? { mode: 'offline' as const } : {}),
      ...(strict ? { failOn: 'medium' as const, onNetworkError: 'fail-closed' as const } : {}),
      ...(diffBase ? { diffBase } : {}),
      ...(sbomPath ? { sbom: true } : {}),
    });
    const { report } = audit;
    if (sbomPath && audit.sbom && !ctx.flags['dry-run']) {
      const target = resolve(ctx.cwd, sbomPath);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, `${JSON.stringify(audit.sbom, null, 2)}\n`);
    }
    const s = report.summary;
    const lines = [
      `check-deps (${report.mode}${diffBase ? `, delta frente a ${diffBase}` : ''}): ${report.status}`,
      `${s.packages} paquetes en ${report.lockfiles?.join(', ') || 'ningún lockfile'}; +${s.added} ~${s.updated} -${s.removed}; ${s.findings} hallazgos, ${s.blocking} bloqueantes (umbral ${report.fail_on}), ${s.waived} con waiver.`,
      ...report.diff.map((d) =>
        `  ${d.changeType} ${d.name} ${d.fromVersion ?? ''}${d.fromVersion && d.toVersion ? ' → ' : ''}${d.toVersion ?? ''}`.trimEnd(),
      ),
      ...report.findings.map(
        (f) =>
          `  ${f.ruleId} [${f.severity}${f.waived ? `, waiver ${f.waiverId}` : ''}] ${f.file ? `${f.file}: ` : ''}${f.message}\n    → ${f.remediation}`,
      ),
      ...(sbomPath ? [`SBOM CycloneDX 1.5: ${sbomPath}`] : []),
    ];
    return {
      data: report,
      human: `${lines.join('\n')}\n`,
      warnings: [],
      exitCode: report.status === 'FAIL' ? 1 : 0,
    };
  },
};
