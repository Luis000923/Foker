import { ERROR_RECOVERABLE, type FokerErrorCode } from './error-codes.generated.js';

export type { FokerErrorCode } from './error-codes.generated.js';

function isFokerErrorCode(code: unknown): code is FokerErrorCode {
  return typeof code === 'string' && Object.hasOwn(ERROR_RECOVERABLE, code);
}

/** Error de Foker con código estable. */
export class FokerError extends Error {
  readonly code: FokerErrorCode;
  readonly recoverable: boolean;

  constructor(code: FokerErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'FokerError';
    this.code = code;
    this.recoverable = ERROR_RECOVERABLE[code];
  }

  /**
   * Convierte un error lanzado por el addon (que trae `error.code`) en `FokerError`.
   * Un error sin código conocido se trata como `FKR-INT-001`.
   */
  static fromNative(error: unknown): FokerError {
    if (error instanceof FokerError) return error;
    const code = (error as { code?: unknown } | null)?.code;
    const message = error instanceof Error ? error.message : String(error);
    if (isFokerErrorCode(code)) return new FokerError(code, message, { cause: error });
    // Las funciones async del addon no pueden fijar error.code: el código llega como prefijo.
    const prefixed = /^\[(FKR-[A-Z]{3}-\d{3})\] ([\s\S]*)$/.exec(message);
    if (prefixed?.[1] && isFokerErrorCode(prefixed[1])) {
      return new FokerError(prefixed[1], prefixed[2] ?? '', { cause: error });
    }
    return new FokerError('FKR-INT-001', message, { cause: error });
  }
}
