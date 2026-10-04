/** Nombre del paquete npm. */
export const PACKAGE_NAME = '@foker/integrations';

export { antigravity, RULE_MAX_BYTES } from './adapters/antigravity.js';
export { claudeCode, claudeDenyRules } from './adapters/claude-code.js';
export { codex } from './adapters/codex.js';
export { opencode } from './adapters/opencode.js';
export { agentsBlock, MCP_ARGS } from './content.js';
export { findBlock, removeBlock, upsertBlock } from './markdown.js';
export { loadRoles, parseRole } from './roles.js';
export {
  ADAPTERS,
  type Conflict,
  detectHosts,
  emptyManifest,
  formatManifest,
  MANIFEST_PATH,
  type ManifestEntry,
  parseManifest,
  planSync,
  type SyncManifest,
  type SyncPlan,
} from './sync.js';
export {
  HOST_IDS,
  type HostAdapter,
  type HostId,
  type Role,
  type SkillFile,
  type SkillInput,
  type SyncInput,
} from './types.js';
