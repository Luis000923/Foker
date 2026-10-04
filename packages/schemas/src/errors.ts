import { readFileSync } from 'node:fs';

/** Recuperabilidad según la columna de FOKER-SPEC §18. `diagnostic` = código 1xx, no es un error. */
export type Recoverability = 'yes' | 'no' | 'partial' | 'automatic' | 'diagnostic';

/** Fila de la tabla de errores de FOKER-SPEC §18. */
export interface ErrorCodeInfo {
  code: string;
  description: string;
  recoverable: Recoverability;
  /** Acción sugerida, o `null`. */
  action: string | null;
  /** Exit code de la CLI, o `null` si no aplica. */
  exit: number | null;
  /** Cómo se refleja en MCP, o `null` si no aplica. */
  mcp: string | null;
}

let table: readonly ErrorCodeInfo[] | undefined;

/** Todos los códigos de error y diagnóstico de Foker, en el orden de la especificación. */
export function errorCodes(): readonly ErrorCodeInfo[] {
  table ??= Object.freeze(
    (
      JSON.parse(readFileSync(new URL('../data/error-codes.json', import.meta.url), 'utf8')) as {
        codes: ErrorCodeInfo[];
      }
    ).codes,
  );
  return table;
}

/** Información de un código, o `undefined` si no existe. */
export function errorCode(code: string): ErrorCodeInfo | undefined {
  return errorCodes().find((c) => c.code === code);
}
