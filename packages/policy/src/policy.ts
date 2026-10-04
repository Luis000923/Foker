import type { PolicyConfig } from '@foker/schemas';

export const DEFAULT_POLICY = {
  secret_globs: ['.env', '.env.*', '**/*.pem', '**/*.key', '**/id_rsa*', '**/*.p12', '**/.npmrc', '**/secrets/**'],
  protected_paths: [
    '.git/**',
    '.foker/**',
    'foker.config.yaml',
    'foker/rules.md',
    'foker/skills/**',
    'foker/roles/**',
    'foker/sync-manifest.json',
    '.claude/**',
    '.opencode/**',
    '.agents/**',
    'opencode.json',
    '.mcp.json',
  ],
  approval_required: {
    paths: ['.github/workflows/**', '**/next.config.*', '**/middleware.ts', 'AGENTS.md', 'CLAUDE.md'],
    dependency_changes: true,
    file_deletions_outside_scope: true,
  },
  env_allowlist: [
    'PATH',
    'HOME',
    'USERPROFILE',
    'SystemRoot',
    'TEMP',
    'TMP',
    'LANG',
    'LC_ALL',
    'CI',
    'NODE_OPTIONS',
    'NODE_ENV',
  ],
  tasks: { max_attempts_default: 3, max_active: 5 },
} satisfies PolicyConfig;

export function policyError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { name: 'FokerError', code });
}

export function effectivePolicy(defaults: PolicyConfig = DEFAULT_POLICY, project: PolicyConfig = {}) {
  const union = (a: string[] = [], b: string[] = []) => [...new Set([...a, ...b])];
  const policy = {
    secret_globs: union(defaults.secret_globs, project.secret_globs),
    protected_paths: union(defaults.protected_paths, project.protected_paths),
    approval_required: {
      paths: union(defaults.approval_required?.paths, project.approval_required?.paths),
      dependency_changes: Boolean(
        defaults.approval_required?.dependency_changes || project.approval_required?.dependency_changes,
      ),
      file_deletions_outside_scope: Boolean(
        defaults.approval_required?.file_deletions_outside_scope ||
          project.approval_required?.file_deletions_outside_scope,
      ),
    },
    env_allowlist: project.env_allowlist ?? defaults.env_allowlist ?? [],
    tasks: { ...defaults.tasks, ...project.tasks },
  };
  const overrides: NonNullable<PolicyConfig['overrides']> = [];
  for (const override of project.overrides ?? []) {
    if (override.justification.trim().length < 10)
      throw policyError('FKR-CFG-001', 'Override sin justificación suficiente');
    const remove = (values: string[], removals: string[] = []) => values.filter((v) => !removals.includes(v));
    const applied = {
      justification: override.justification,
      remove_secret_globs: policy.secret_globs.filter((v) => override.remove_secret_globs?.includes(v)),
      remove_protected_paths: policy.protected_paths.filter((v) => override.remove_protected_paths?.includes(v)),
      remove_approval_paths: policy.approval_required.paths.filter((v) => override.remove_approval_paths?.includes(v)),
    };
    policy.secret_globs = remove(policy.secret_globs, applied.remove_secret_globs);
    policy.protected_paths = remove(policy.protected_paths, applied.remove_protected_paths);
    policy.approval_required.paths = remove(policy.approval_required.paths, applied.remove_approval_paths);
    if (
      applied.remove_secret_globs.length +
      applied.remove_protected_paths.length +
      applied.remove_approval_paths.length
    )
      overrides.push(applied);
  }
  return { policy, overrides };
}
