import type { Finding } from '@foker/schemas';
import { SECURITY_RULES, type SecurityRule } from './rules.js';

export { SECURITY_RULES, type SecurityRule };

export interface ScanFile {
  /** Ruta relativa POSIX. */
  path: string;
  content: string;
}

/** Evalúa las reglas defensivas sobre archivos ya leídos. Determinista: orden por ruta, línea y regla. */
export function scanSecurity(files: readonly ScanFile[], rules: readonly SecurityRule[] = SECURITY_RULES): Finding[] {
  const findings: Finding[] = [];
  for (const file of [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    for (const rule of rules) {
      if (!rule.applies(file.path)) continue;
      for (const line of [...new Set(rule.check(file.content, file.path))].sort((a, b) => a - b))
        findings.push({
          rule: `security/${rule.id}`,
          file: file.path,
          line,
          code: rule.id,
          severity: rule.severity,
          message: `${rule.title} (ASVS ${rule.asvs}). ${rule.hint}`,
        });
    }
  }
  return findings;
}
