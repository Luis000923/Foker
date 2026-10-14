/** Nombre del paquete npm. */
export const PACKAGE_NAME = '@foker/engine';
export type { ContextRequest, Engine } from '@foker/core';
// Primitivas compartidas por los adaptadores; la lógica sigue en core/policy.
export { FokerError, hashCanonicalJson, matchGlobs, normalizePath, openEngine } from '@foker/core';
export { assertCanTrust, isTrusted, redactSecrets, runCheck, SECURITY_RULES, TrustStore } from '@foker/policy';
export * from './compressor/index.js';
export { loadConfig, resolveConfig } from './config.js';
export { gatherContextInputs } from './context.js';
export { renderTokensCss } from './design/tokens.js';
export * from './findings/index.js';
export {
  assertUnprotectedScope,
  deriveScopePaths,
  directoryScope,
  nonexistentScopePaths,
  protectedPathsInScope,
  rankPackFiles,
} from './scope.js';
export { checkSecurity, type SecurityReport } from './security.js';
export * from './skills/index.js';
export * from './tasks/index.js';
