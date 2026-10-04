/** Nombre del paquete npm. */
export const PACKAGE_NAME = '@foker/engine';
export type { ContextRequest, Engine } from '@foker/core';
// Primitivas compartidas por los adaptadores; la lógica sigue en core/policy.
export { FokerError, hashCanonicalJson, matchGlobs, normalizePath, openEngine } from '@foker/core';
export { assertCanTrust, isTrusted, redactSecrets, TrustStore } from '@foker/policy';
export { loadConfig } from './config.js';
export { gatherContextInputs } from './context.js';
export * from './findings/index.js';
export { assertUnprotectedScope, protectedPathsInScope } from './scope.js';
export * from './skills/index.js';
export * from './tasks/index.js';
