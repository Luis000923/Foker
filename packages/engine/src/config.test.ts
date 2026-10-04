import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hashCanonicalJson } from '@foker/core';
import { DEFAULT_POLICY, TrustStore } from '@foker/policy';
import { afterEach, expect, it } from 'vitest';
import { loadConfig } from './config.js';

const roots: string[] = [];
async function temp() {
  const root = await mkdtemp(join(tmpdir(), 'foker-config-'));
  roots.push(root);
  return root;
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
it('defaults sin archivo; configuración válida y hash canónico', async () => {
  const root = await temp();
  const absent = await loadConfig(root);
  expect(absent.source).toBeNull();
  expect(absent.policy.secret_globs).toContain('.env');
  await writeFile(
    join(root, 'foker.config.yaml'),
    'version: 1\nmap:\n  max_files: 20\npolicy:\n  secret_globs: [private/**]\nvalidation:\n  checks:\n    test:\n      run: [node, -v]\n',
  );
  const loaded = await loadConfig(root);
  expect(loaded.mapConfig.maxFiles).toBe(20);
  expect(loaded.mapConfig.secretGlobs).toContain('private/**');
  expect(loaded.commandsHash).not.toBe(absent.commandsHash);
  expect(hashCanonicalJson('{"b":1,"a":2}')).toBe(hashCanonicalJson('{"a":2,"b":1}'));
});
it.each([
  'version: 2',
  'version: 1\nunknown: true',
  'version: 1\nvalidation:\n  checks:\n    test:\n      run: [node, "${HOME}"]',
])('rechaza configuración inválida %s', async (yaml) => {
  const root = await temp();
  await writeFile(join(root, 'foker.config.yaml'), yaml);
  await expect(loadConfig(root)).rejects.toMatchObject({ code: 'FKR-CFG-001' });
});
it('rechaza ruta externa', async () => {
  const root = await temp();
  await expect(loadConfig(root, { configPath: '../outside.yaml' })).rejects.toMatchObject({ code: 'FKR-POL-001' });
});

it('solo el config predeterminado implícito es opcional', async () => {
  const root = await temp();
  for (const configPath of ['missing.yaml', 'foker.config.yaml'])
    await expect(loadConfig(root, { configPath })).rejects.toMatchObject({ code: 'FKR-CFG-001' });
  expect((await loadConfig(root)).source).toBeNull();
});
it('trust incluye env_allowlist y network efectivos', async () => {
  const root = await temp();
  const path = join(root, 'foker.config.yaml');
  const config = (network: boolean, env = DEFAULT_POLICY.env_allowlist) =>
    JSON.stringify({
      version: 1,
      policy: { env_allowlist: env },
      validation: { checks: { test: { run: ['node', '-v'], network } } },
    });
  await writeFile(path, config(false));
  const original = await loadConfig(root);
  const store = new TrustStore(await temp());
  await store.approve(root, original.commandsHash, 'test');
  expect(await store.isTrusted(root, original.commandsHash)).toBe(true);
  await writeFile(path, config(false, [...DEFAULT_POLICY.env_allowlist, 'AWS_SECRET_ACCESS_KEY']));
  expect(await store.isTrusted(root, (await loadConfig(root)).commandsHash)).toBe(false);
  await writeFile(path, config(true));
  expect(await store.isTrusted(root, (await loadConfig(root)).commandsHash)).toBe(false);
  await writeFile(path, JSON.stringify({ version: 1, validation: { checks: { test: { run: ['node', '-v'] } } } }));
  expect((await loadConfig(root)).commandsHash).toBe(original.commandsHash);
});
