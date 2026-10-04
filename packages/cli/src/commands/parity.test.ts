import { createHash } from 'node:crypto';
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { agentsBlock, findBlock, HOST_IDS, loadRoles } from '@foker/integrations';
import { createFokerServer } from '@foker/mcp';
import { mcpTools } from '@foker/schemas';
import { expect, it } from 'vitest';
import { runSync } from './sync.js';

const hash = (text: string | Uint8Array) => createHash('sha256').update(text).digest('hex');
/** Cliente mínimo en memoria: comprueba tools/list sin red ni dependencias de cliente. */
async function exposedTools(root: string): Promise<string[]> {
  const server = await createFokerServer({ root, stderr: () => {} });
  type Transport = Parameters<typeof server.connect>[0];
  const pending = new Map<number, (response: unknown) => void>();
  let nextId = 0;
  const transport: Transport = {
    async start() {},
    async close() {},
    async send(message) {
      if ('id' in message && typeof message.id === 'number') pending.get(message.id)?.(message);
    },
  };
  const request = (method: string, params: Record<string, unknown>) =>
    new Promise<unknown>((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(() => reject(new Error('Respuesta MCP ausente')), 2000);
      pending.set(id, (response) => {
        clearTimeout(timer);
        pending.delete(id);
        resolve(response);
      });
      transport.onmessage?.({ jsonrpc: '2.0', id, method, params });
    });
  try {
    await server.connect(transport);
    await request('initialize', {
      protocolVersion: '2026-07-28',
      capabilities: {},
      clientInfo: { name: 'paridad-foker', version: '1' },
    });
    transport.onmessage?.({ jsonrpc: '2.0', method: 'notifications/initialized' });
    const response = (await request('tools/list', {})) as { result: { tools: { name: string }[] } };
    return response.result.tools.map((tool) => tool.name).sort();
  } finally {
    await server.close();
  }
}

it('paridad por suscripción: cuatro targets, mismas tools MCP, reglas, skills y roles sin claves', async () => {
  const base = await mkdtemp(join(tmpdir(), 'foker-parity-'));
  const results: unknown[] = [];
  try {
    for (const target of HOST_IDS) {
      const root = join(base, target);
      await cp(new URL('../../../../fixtures/monorepo-pnpm/', import.meta.url), root, { recursive: true });
      const { plan, applied } = await runSync(root, { targets: target });
      expect(plan.conflicts).toEqual([]);
      expect(applied).toBe(true);
      expect((await runSync(root, { targets: target, check: true })).plan.writes).toEqual([]);
      const read = (path: string) => readFile(join(root, path), 'utf8');
      let server: Record<string, unknown>;
      if (target === 'codex') {
        const config = await read('.codex/config.toml');
        server = {
          command: JSON.parse(config.match(/^command = (.+)$/m)?.[1] ?? 'null'),
          args: JSON.parse(config.match(/^args = (.+)$/m)?.[1] ?? 'null'),
        };
        expect(config).not.toMatch(/enabled_tools|disabled_tools/);
      } else if (target === 'opencode') {
        const config = JSON.parse(await read('opencode.json'));
        const { command, ...options } = config.mcp.foker;
        expect(options).toEqual({ type: 'local', enabled: true, timeout: 600000 });
        server = { command: command[0], args: command.slice(1) };
      } else {
        const config = JSON.parse(await read(target === 'claude-code' ? '.mcp.json' : '.agents/mcp_config.json'));
        server = config.mcpServers.foker;
      }
      // Mismo servidor sin filtros de tools ni variables de autenticación: catálogo MCP completo.
      expect(Object.keys(server).sort()).toEqual(['args', 'command']);
      expect(server['command']).toBe('npx');
      const args = server['args'] as string[];
      expect(args.slice(0, -1)).toEqual(['--no-install', 'foker', 'mcp', '--root']);
      expect(args.at(-1)).toBe(target === 'claude-code' ? '${CLAUDE_PROJECT_DIR}' : '.');
      const rules = findBlock(await read('AGENTS.md'))?.body ?? '';
      expect(hash(rules)).toBe(hash(agentsBlock()));
      const skills = await Promise.all(
        plan.writes
          .filter((w) => w.path.includes('/skills/'))
          .map(async (w) => [w.path.split('/skills/')[1], hash(await readFile(join(root, w.path)))]),
      );
      const roles = await loadRoles();
      const generatedRoles: [string, string][] = [];
      const rolePaths = plan.writes.filter((write) =>
        target === 'antigravity'
          ? write.path.startsWith('.agents/rules/') && write.path !== '.agents/rules/foker.md'
          : write.path.includes('/agents/'),
      );
      expect(rolePaths).toHaveLength(roles.length);
      for (const role of roles) {
        const path =
          target === 'codex'
            ? `.codex/agents/${role.name}.toml`
            : target === 'antigravity'
              ? `.agents/rules/${role.name}.md`
              : `${target === 'claude-code' ? '.claude' : '.opencode'}/agents/${role.name}.md`;
        const text = await read(path);
        const body =
          target === 'codex' ? JSON.parse(text.match(/^developer_instructions = (.+)$/m)?.[1] ?? 'null') : text;
        const roleText = target === 'codex' ? body : body.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').trimStart();
        const canonicalBody = roleText.replace(/^<!-- generado por foker sync; no editar -->\s*/, '').trim();
        expect(canonicalBody).toBe(role.body.trim());
        generatedRoles.push([role.name, hash(canonicalBody)]);
        if (target === 'codex') expect(await read('.codex/config.toml')).toContain(`agents/${role.name}.toml`);
      }
      for (const write of plan.writes) expect(String(write.content)).not.toMatch(/\b[A-Z_]*API_KEY\b/);
      const tools = await exposedTools(root);
      expect(tools).toEqual(
        mcpTools()
          .map((tool) => tool.name)
          .sort(),
      );
      results.push({
        tools,
        rules: hash(rules),
        skills: skills.sort(),
        roles: generatedRoles,
      });
    }
    for (const result of results) expect(result).toEqual(results[0]);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});
