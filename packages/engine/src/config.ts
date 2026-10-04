import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { type EngineConfig, FokerError, hashCanonicalJson, normalizePath } from '@foker/core';
import { DEFAULT_POLICY, effectivePolicy } from '@foker/policy';
import { type FokerConfig, formatIssues, validate } from '@foker/schemas';
import { parse } from 'yaml';

export async function loadConfig(root: string, options: { configPath?: string } = {}) {
  root = resolve(root);
  const path = join(root, normalizePath(root, options.configPath ?? 'foker.config.yaml'));
  let source: string | null = path;
  let project: FokerConfig = { version: 1 };
  try {
    const document: unknown = parse(await readFile(path, 'utf8'));
    const result = validate<FokerConfig>('foker-config', document);
    if (!result.ok) throw new FokerError('FKR-CFG-001', formatIssues(result.issues));
    project = result.value;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT' && options.configPath === undefined) source = null;
    else if (error instanceof FokerError) throw error;
    else throw new FokerError('FKR-CFG-001', error instanceof Error ? error.message : String(error));
  }
  const { policy, overrides } = effectivePolicy(DEFAULT_POLICY, project.policy);
  const validation = {
    profiles: project.validation?.profiles ?? {},
    checks: Object.fromEntries(
      Object.entries(project.validation?.checks ?? {}).map(([name, check]) => [
        name,
        check && { timeout_s: 300, ...('run' in check ? { network: false, parser: 'generic' } : {}), ...check },
      ]),
    ),
  };
  const config = {
    ...project,
    context: { default_budget_tokens: 8000, core_files: 15, ...project.context },
    validation,
    policy,
    skills: { disabled: [], ...project.skills },
    integrations: { targets: [], ...project.integrations },
  };
  const map = project.map ?? {};
  const mapConfig: EngineConfig = {
    ...(map.include ? { include: map.include } : {}),
    ...(map.exclude ? { exclude: map.exclude } : {}),
    ...(map.tsconfig ? { tsconfig: map.tsconfig } : {}),
    ...(map.kinds ? { kinds: map.kinds } : {}),
    ...(map.max_file_bytes !== undefined ? { maxFileBytes: map.max_file_bytes } : {}),
    ...(map.max_files !== undefined ? { maxFiles: map.max_files } : {}),
    secretGlobs: policy.secret_globs,
  };
  return {
    config,
    source,
    policy,
    overrides,
    mapConfig,
    commandsHash: hashCanonicalJson(JSON.stringify({ validation, env_allowlist: policy.env_allowlist })),
  };
}
