import { Ajv2020, type ErrorObject, type ValidateFunction } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { getSchema, SCHEMA_NAMES, type SchemaName, schemaId } from './registry.js';

/** Error de validación legible: ruta JSON + mensaje. */
export interface ValidationIssue {
  /** JSON Pointer del valor inválido (`""` = raíz). */
  path: string;
  message: string;
  /** Palabra clave de JSON Schema que falló. */
  keyword: string;
}

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; issues: ValidationIssue[] };

let ajvInstance: Ajv2020 | undefined;

/** Instancia Ajv con todos los esquemas de Foker registrados. */
export function ajv(): Ajv2020 {
  if (!ajvInstance) {
    const instance = new Ajv2020({
      strict: true,
      // required en if/then y anyOf, y prefixItems + items, son 2020-12 válidos y se usan a propósito.
      strictRequired: false,
      strictTuples: false,
      allErrors: true,
      allowUnionTypes: true,
    });
    addFormats.default(instance);
    // Anotaciones propias de mcp-tools.json; no validan nada.
    instance.addKeyword({ keyword: 'foker_mcp_api' });
    instance.addKeyword({ keyword: 'tools' });
    for (const name of SCHEMA_NAMES) instance.addSchema(getSchema(name));
    ajvInstance = instance;
  }
  return ajvInstance;
}

function toIssues(errors: ErrorObject[] | null | undefined): ValidationIssue[] {
  return (errors ?? []).map((e) => ({
    path: e.instancePath,
    message: e.message ?? 'inválido',
    keyword: e.keyword,
  }));
}

const validators = new Map<string, ValidateFunction>();

/**
 * Validador compilado para un esquema o un fragmento suyo.
 * @param ref nombre del esquema, opcionalmente con fragmento JSON Pointer (`task#/$defs/event`).
 */
export function validator(ref: SchemaName | `${SchemaName}#${string}`): ValidateFunction {
  let fn = validators.get(ref);
  if (!fn) {
    const [name, fragment] = ref.split('#') as [SchemaName, string | undefined];
    const id = schemaId(name) + (fragment === undefined ? '' : `#${fragment}`);
    fn = ajv().getSchema(id) ?? ajv().compile({ $ref: id });
    validators.set(ref, fn);
  }
  return fn;
}

/** Valida `data` contra un esquema de Foker. */
export function validate<T = unknown>(ref: SchemaName | `${SchemaName}#${string}`, data: unknown): ValidationResult<T> {
  const fn = validator(ref);
  return fn(data) ? { ok: true, value: data as T } : { ok: false, issues: toIssues(fn.errors) };
}

/** Formatea incidencias en una línea por error, para mensajes `FKR-CFG-001`/`FKR-INP-001`. */
export function formatIssues(issues: ValidationIssue[]): string {
  return issues.map((i) => `${i.path || '/'}: ${i.message}`).join('\n');
}
