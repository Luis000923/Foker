/** Nombre del paquete npm. */
export const PACKAGE_NAME = '@foker/schemas';

export {
  bundleSchema,
  type McpToolDefinition,
  mcpApiVersion,
  mcpTools,
  type ToolAnnotations,
} from './bundle.js';
export { designPreset, designPresetNames } from './design.js';
export { type ErrorCodeInfo, errorCode, errorCodes, type Recoverability } from './errors.js';
export * from './generated/types.js';
export {
  getSchema,
  type JsonSchema,
  SCHEMA_BASE_URL,
  SCHEMA_NAMES,
  type SchemaName,
  schemaFile,
  schemaId,
} from './registry.js';
export {
  ajv,
  formatIssues,
  type ValidationIssue,
  type ValidationResult,
  validate,
  validator,
} from './validate.js';
