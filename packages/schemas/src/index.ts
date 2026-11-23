/** Nombre del paquete npm. */
export const PACKAGE_NAME = '@foker/schemas';

export {
  bundleSchema,
  type McpToolDefinition,
  mcpApiVersion,
  mcpTools,
  mcpWireTools,
  type ToolAnnotations,
  WIRE_OUTPUT_DEPTH,
  wireSchema,
} from './bundle.js';
export {
  DEFAULT_DEPENDENCY_POLICY,
  DEPENDENCY_SEVERITY_RANK,
  type ResolvedDependencyPolicy,
  resolveDependencyPolicy,
  validateDependencyPolicy,
  validateDependencyReport,
  validateDependencyWaivers,
} from './dependency-security.js';
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
