import { checkSecurity, SECURITY_RULES } from '@foker/engine';
import { type Command, flag } from '../types.js';

export const checkSecurityCommand: Command = {
  name: 'check-security',
  description: `Reglas defensivas OWASP ASVS Nivel 2 (${SECURITY_RULES.length} reglas estáticas FKR-SEC-NNN)`,
  maxArgs: 1,
  flags: [flag('strict', 'boolean', 'Los avisos también fallan')],
  async run(ctx) {
    const report = await checkSecurity(ctx.cwd, ctx.args[0] ?? '.');
    const errors = report.findings.filter((f) => f.severity === 'error');
    const warnings = report.findings.filter((f) => f.severity !== 'error');
    const failing = errors.length + (ctx.flags['strict'] ? warnings.length : 0);
    return {
      data: report,
      warnings: [],
      human: `${report.findings.map((f) => `${f.file}:${f.line} ${f.code} [${f.severity}] ${f.message}`).join('\n')}${
        report.findings.length ? '\n' : ''
      }${report.scanned} archivos; ${errors.length} errores, ${warnings.length} avisos.\n`,
      exitCode: failing ? 5 : 0,
    };
  },
};
