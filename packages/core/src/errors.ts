/** Códigos de error que puede lanzar `@foker/core` o el addon nativo (FOKER-SPEC §18). */
export type CoreErrorCode =
  | 'FKR-CFG-002'
  | 'FKR-INP-001'
  | 'FKR-MAP-001'
  | 'FKR-MAP-003'
  | 'FKR-MAP-004'
  | 'FKR-MAP-005'
  | 'FKR-MAP-006'
  | 'FKR-CTX-001'
  | 'FKR-POL-001'
  | 'FKR-INT-001'
  | 'FKR-INT-002'
  | 'FKR-INT-003';

/**
 * Si el agente puede recuperarse del error por sí mismo (columna "Recuperable" de FOKER-SPEC §18).
 * PENDIENTE: generar esta tabla desde `@foker/schemas` cuando exista (FKR-004).
 */
const RECOVERABLE: Record<CoreErrorCode, boolean> = {
  'FKR-CFG-002': false,
  'FKR-INP-001': true,
  'FKR-MAP-001': true,
  'FKR-MAP-003': false,
  'FKR-MAP-004': true,
  'FKR-MAP-005': false,
  'FKR-MAP-006': true,
  'FKR-CTX-001': true,
  'FKR-POL-001': true,
  'FKR-INT-001': false,
  'FKR-INT-002': false,
  'FKR-INT-003': false,
};

function isCoreErrorCode(code: unknown): code is CoreErrorCode {
  return typeof code === 'string' && Object.hasOwn(RECOVERABLE, code);
}

/** Error de Foker con código estable. */
export class FokerError extends Error {
  readonly code: CoreErrorCode;
  readonly recoverable: boolean;

  constructor(code: CoreErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'FokerError';
    this.code = code;
    this.recoverable = RECOVERABLE[code];
  }

  /**
   * Convierte un error lanzado por el addon (que trae `error.code`) en `FokerError`.
   * Un error sin código conocido se trata como `FKR-INT-001`.
   */
  static fromNative(error: unknown): FokerError {
    if (error instanceof FokerError) return error;
    const code = (error as { code?: unknown } | null)?.code;
    const message = error instanceof Error ? error.message : String(error);
    return new FokerError(isCoreErrorCode(code) ? code : 'FKR-INT-001', message, { cause: error });
  }
}
