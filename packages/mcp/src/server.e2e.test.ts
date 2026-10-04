import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { loadConfig, TrustStore } from '@foker/engine';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { Client as LegacyClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport as LegacyTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterAll, beforeAll, expect, it } from 'vitest';

const temporaries: string[] = [];
beforeAll(async () => {
  // Recompilar siempre para probar las fuentes actuales.
  for (const pkg of ['schemas', 'core', 'policy', 'engine', 'integrations', 'mcp', 'cli'])
    await promisify(execFile)(resolve('node_modules/.bin/tsc'), ['-p', `packages/${pkg}/tsconfig.json`]);
}, 60000);
afterAll(async () => {
  for (const dir of temporaries) await rm(dir, { recursive: true, force: true });
});
for (const legacy of [false, true])
  it(`flujo real stdio ${legacy ? '2025-11-25' : '2026-07-28'}`, async () => {
    const base = await mkdtemp(join(tmpdir(), 'foker-mcp-e2e-'));
    temporaries.push(base);
    const root = join(base, 'repo');
    const xdg = join(base, 'xdg');
    await cp(resolve('fixtures/monorepo-pnpm'), root, { recursive: true });
    await mkdir(join(root, 'foker/skills/demo'), { recursive: true });
    await writeFile(join(root, 'foker/rules.md'), '# Reglas\n');
    await writeFile(join(root, 'foker/skills/demo/SKILL.md'), '# Demo\n');
    await writeFile(
      join(root, 'foker.config.yaml'),
      'version: 1\nvalidation:\n  profiles:\n    default: {checks: [secrets]}\n    quick: {checks: [secrets]}\n  checks:\n    secrets: {builtin: secret-scan}\n',
    );
    await new TrustStore(xdg).approve(root, (await loadConfig(root)).commandsHash);
    const client = legacy
      ? new LegacyClient({ name: 'legacy-test', version: '1.0.0' })
      : new Client({ name: 'modern-test', version: '1.0.0' }, { versionNegotiation: { mode: { pin: '2026-07-28' } } });
    const params = {
      command: process.execPath,
      args: [resolve('packages/cli/dist/bin.js'), 'mcp', '--root', root],
      env: { PATH: process.env['PATH'] ?? '', XDG_CONFIG_HOME: xdg },
      stderr: 'pipe' as const,
    };
    const transport = legacy ? new LegacyTransport(params) : new StdioClientTransport(params);
    let logs = '';
    transport.stderr?.on('data', (chunk) => {
      logs += String(chunk);
    });
    try {
      await client.connect(transport);
      expect(client.getServerVersion()).toMatchObject({ name: 'foker', version: '0.0.0' });
      const listed = await client.listTools();
      expect(listed.tools).toHaveLength(8);
      const names = listed.tools.map((t) => t.name);
      expect(names).toEqual([...names].sort());
      expect(JSON.stringify(listed.tools)).not.toContain('"$ref"');
      const call = (
        name: string,
        args: Record<string, unknown> = {},
      ): Promise<{ isError?: unknown; structuredContent?: unknown; error?: unknown; [key: string]: unknown }> =>
        client.callTool({ name, arguments: args }).then((result) => {
          if (!('content' in result)) throw new Error('Resultado de herramienta sin content');
          if (!result.isError) return result;
          expect(result).not.toHaveProperty('structuredContent');
          const content = result.content as Array<{ type: string; text: string }>;
          expect(content[0]?.type).toBe('text');
          return { ...result, error: JSON.parse(content[0]?.text ?? '') };
        });
      expect(await call('foker_status')).toMatchObject({
        isError: false,
        structuredContent: { protocol: legacy ? '2025-11-25' : '2026-07-28', trust: 'trusted', foker_mcp_api: 1 },
      });
      expect(await call('foker_search', { query: 'button' })).toMatchObject({ isError: false });
      expect(await call('foker_impact', { files: ['packages/ui/src/button.tsx'] })).toMatchObject({ isError: false });
      expect(await call('foker_check')).toMatchObject({ isError: false, structuredContent: { ok: true } });
      const begun = await call('foker_task_begin', {
        description: 'Editar botón',
        scope: { paths: ['packages/ui/**'] },
        client_token: 'once',
      });
      expect(begun.isError).toBe(false);
      const id = (begun.structuredContent as { task_id: string }).task_id;
      expect(
        await call('foker_task_begin', {
          description: 'Editar botón',
          scope: { paths: ['packages/ui/**'] },
          client_token: 'once',
        }),
      ).toMatchObject({ structuredContent: { task_id: id } });
      const context = await call('foker_context', { task: 'Editar botón', task_id: id, budget_tokens: 8000 });
      expect(context.isError).toBe(false);
      expect(context.structuredContent).not.toHaveProperty('rendered');
      const path = join(root, 'packages/ui/src/button.tsx');
      await writeFile(path, `${await readFile(path, 'utf8')}\n// cambio MCP\n`);
      expect(await call('foker_task_submit', { task_id: id })).toMatchObject({
        isError: false,
        structuredContent: { state: 'COMPLETED' },
      });
      expect(await call('foker_task_get', { task_id: id })).toMatchObject({
        structuredContent: { state: 'COMPLETED', created_by: legacy ? 'mcp:legacy-test' : 'mcp:modern-test' },
      });
      const resources = await client.listResources();
      expect(resources.resources).toHaveLength(4);
      expect(resources).toMatchObject({ ttlMs: 0, cacheScope: 'private' });
      for (const uri of ['foker://rules', 'foker://map/outline', 'foker://skills/demo', `foker://tasks/${id}`])
        expect(await client.readResource({ uri })).toMatchObject({
          ttlMs: uri.includes('/tasks/') ? 0 : 60000,
          cacheScope: 'private',
        });
      expect(await call('foker_task_get', { task_id: 'tsk_00000000000000000000000000' })).toMatchObject({
        isError: true,
        error: { code: 'FKR-TSK-001' },
      });
      let limited = false;
      for (let n = 0; n < 125; n++) {
        const result = await call('foker_task_get', { task_id: 'tsk_00000000000000000000000000' });
        if (('error' in result ? (result.error as { code?: string }).code : undefined) === 'FKR-MCP-002') {
          limited = true;
          expect(result).toMatchObject({ isError: true, error: { retry_after_ms: expect.any(Number) } });
          break;
        }
      }
      expect(limited).toBe(true);
      for (const line of logs.trim().split('\n').filter(Boolean)) {
        expect(JSON.parse(line)).toHaveProperty('event');
        expect(line).not.toContain('Editar botón');
      }
    } finally {
      await client.close();
      await transport.close();
    }
  }, 60000);
