/* Generado por packages/schemas/scripts/generate.mjs desde packages/schemas/data/error-codes.json. No editar. */

/** Códigos de error de FOKER-SPEC §18 (sin diagnósticos 1xx) y si el agente puede recuperarse. */
export const ERROR_RECOVERABLE = {
  'FKR-CFG-001': false,
  'FKR-CFG-002': false,
  'FKR-INP-001': true,
  'FKR-MAP-001': true,
  'FKR-MAP-003': false,
  'FKR-MAP-004': true,
  'FKR-MAP-005': false,
  'FKR-MAP-006': true,
  'FKR-CTX-001': true,
  'FKR-MCP-002': true,
  'FKR-POL-001': true,
  'FKR-POL-002': true,
  'FKR-POL-010': false,
  'FKR-TSK-001': true,
  'FKR-TSK-002': true,
  'FKR-TSK-005': true,
  'FKR-VAL-001': false,
  'FKR-VAL-002': true,
  'FKR-VAL-003': true,
  'FKR-VAL-004': false,
  'FKR-SKL-001': true,
  'FKR-SKL-002': false,
  'FKR-SYN-001': false,
  'FKR-INT-001': false,
  'FKR-INT-002': false,
  'FKR-INT-003': false,
} as const;

export type FokerErrorCode = keyof typeof ERROR_RECOVERABLE;
