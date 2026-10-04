import { expect, it } from 'vitest';
import { detectHosts, planSync, type SyncInput } from './index.js';

const input: SyncInput = { targets: ['codex'], skills: [], roles: [], protectedPaths: [], secretGlobs: [] };
it('TOML preserva opciones y servidores del usuario, detecta ediciones y retira solo su bloque', () => {
  const original = '# Mi configuración\nmodel = "propio"\n[mcp_servers.otro]\ncommand = "otro"\n';
  const files = new Map<string, string>([['.codex/config.toml', original]]);
  const io = { read: (path: string) => files.get(path) };
  const apply = (plan: ReturnType<typeof planSync>) => {
    for (const write of plan.writes) {
      if (write.content === null) files.delete(write.path);
      else files.set(write.path, String(write.content));
    }
  };
  apply(planSync(input, io));
  expect(files.get('.codex/config.toml')?.startsWith(original)).toBe(true);
  expect(planSync(input, io).writes).toEqual([]);
  const generated = files.get('.codex/config.toml') ?? '';
  files.set('.codex/config.toml', generated.replace('command = "npx"', 'command = "otro"'));
  expect(planSync(input, io).conflicts).toEqual([expect.objectContaining({ path: '.codex/config.toml' })]);
  apply(planSync(input, io, { force: true }));
  apply(planSync({ ...input, targets: [] }, io));
  expect(files.get('.codex/config.toml')).toBe(original);
  expect(detectHosts((path) => path === '.codex')).toEqual(['codex']);
});

it('no pisa tablas TOML preexistentes fuera del bloque, incluso con force', () => {
  for (const content of [
    '[mcp_servers.foker]\ncommand = "otro"\n',
    '[agents."foker-implementer"]\ndescription = "propio"\n',
  ]) {
    expect(
      planSync(input, { read: (path) => (path === '.codex/config.toml' ? content : undefined) }, { force: true })
        .conflicts,
    ).toHaveLength(1);
  }
});

it('rechaza claves TOML equivalentes y marcadores rotos sin apropiarse de contenido', () => {
  for (const content of [
    `[ "mcp_servers" . 'foker' ]\ncommand = "otro"\n`,
    `mcp_servers.foker.command = "otro"\n`,
    `[mcp_servers]\nfoker = {command = "otro"}\n`,
    `agents = {"foker-reviewer" = {description = "propio"}}\n`,
    `# foker:begin v1\n[mcp_servers.foker]\n`,
    `# foker:end\n`,
    `# foker:begin v2\n# foker:end\n`,
  ]) {
    const plan = planSync(
      input,
      { read: (path) => (path === '.codex/config.toml' ? content : undefined) },
      { force: true },
    );
    expect(plan.conflicts).toEqual([expect.objectContaining({ path: '.codex/config.toml' })]);
    expect(plan.writes.some((write) => write.path === '.codex/config.toml')).toBe(false);
  }
});
