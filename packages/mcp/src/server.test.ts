import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as engineApi from '@foker/engine';
import { hashCanonicalJson, loadConfig, TrustStore } from '@foker/engine';
import { Client } from '@modelcontextprotocol/client';
import { Client as LegacyClient } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { afterEach, expect, it, vi } from 'vitest';
import { createFokerServer, runStdio } from './index.js';
import { limitOutput, sanitize, TokenBucket } from './safety.js';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function fixture(legacy = false) {
  const root = await mkdtemp(join(tmpdir(), 'foker-mcp-unit-'));
  roots.push(root);
  await mkdir(join(root, 'foker/skills/demo'), { recursive: true });
  await writeFile(join(root, 'foker/rules.md'), '# Rules\n');
  await writeFile(join(root, 'foker/skills/demo/SKILL.md'), '# Demo');
  await writeFile(join(root, 'index.ts'), 'export const demo = 1;\n');
  await writeFile(
    join(root, 'foker.config.yaml'),
    'version: 1\nvalidation:\n  profiles:\n    default: {checks: [secrets]}\n    quick: {checks: [secrets]}\n  checks:\n    secrets: {builtin: secret-scan}\n',
  );
  const xdg = await mkdtemp(join(tmpdir(), 'foker-mcp-trust-'));
  roots.push(xdg);
  await new TrustStore(xdg).approve(root, (await loadConfig(root)).commandsHash);
  const logs: string[] = [];
  let now = Date.now();
  const server = await createFokerServer({
    root,
    trustBaseDir: xdg,
    clock: () => now,
    stderr: (line) => logs.push(line),
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = legacy
    ? new LegacyClient({ name: 'unit', version: '1.0.0' })
    : new Client({ name: 'unit', version: '1.0.0' }, { versionNegotiation: { mode: { pin: '2026-07-28' } } });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
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
  return {
    root,
    client,
    server,
    logs,
    call,
    advance: (ms: number) => {
      now += ms;
    },
  };
}
async function tree(root: string, prefix = ''): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
    const path = join(prefix, entry.name);
    if (prefix === '' && entry.name === '.foker') continue;
    if (entry.isDirectory()) Object.assign(result, await tree(root, path));
    else result[path] = (await readFile(join(root, path))).toString('base64');
  }
  return result;
}
it('root inválido es error de protocolo', async () => {
  await expect(createFokerServer({ root: '/does/not/exist' })).rejects.toMatchObject({
    code: -32602,
    data: { code: 'FKR-CFG-002' },
  });
});
it('token bucket recupera, resiste reloj hacia atrás y limita por proceso', () => {
  let time = 0;
  const bucket = new TokenBucket(() => time);
  for (let n = 0; n < 120; n++) expect(bucket.take()).toBe(0);
  expect(bucket.take()).toBe(500);
  time = -10;
  expect(bucket.take()).toBe(500);
  time = 250;
  expect(bucket.take()).toBe(250);
  time = 500;
  expect(bucket.take()).toBe(0);
});
it('redacción recursiva y truncado con diagnóstico', () => {
  const secret = 'AK' + 'IA' + 'A1B2C3D4E5F6G7H8';
  expect(JSON.stringify(sanitize({ text: secret, nested: [secret] }))).not.toContain(secret);
  const result = limitOutput({ hits: Array.from({ length: 3000 }, () => ({ name: 'x'.repeat(100) })) });
  expect(result.structured).toHaveProperty('diagnostics');
  expect(
    JSON.stringify({
      content: [{ type: 'text', text: JSON.stringify(result.structured) }],
      structuredContent: result.structured,
    }).length,
  ).toBeLessThanOrEqual(80000);
});
for (const legacy of [false, true])
  it(`8 herramientas, recursos, tarea y auditoría; confinamiento .foker (legacy=${legacy})`, async () => {
    const f = await fixture(legacy);
    try {
      const before = await tree(f.root);
      const list = await f.client.listTools();
      expect(list.tools).toHaveLength(8);
      expect(JSON.stringify(list)).not.toContain('"$ref"');
      expect(f.client.getServerVersion()).toMatchObject({ name: 'foker' });
      expect(await f.call('foker_status')).toMatchObject({ isError: false, structuredContent: { foker_mcp_api: 1 } });
      expect(await f.call('foker_search', { query: 'demo' })).toMatchObject({ isError: false });
      expect(await f.call('foker_impact', { files: ['index.ts'] })).toMatchObject({ isError: false });
      expect(await f.call('foker_check')).toMatchObject({ isError: false, structuredContent: { ok: true } });
      const args = { description: 'demo', scope: { paths: ['index.ts'] }, client_token: 'token' };
      const begin = await f.call('foker_task_begin', args);
      expect(begin.isError).toBe(false);
      const id = (begin.structuredContent as { task_id: string }).task_id;
      expect(await f.call('foker_task_begin', args)).toMatchObject({ structuredContent: { task_id: id } });
      f.advance(1000);
      const context = await f.call('foker_context', { task: 'demo', task_id: id });
      expect(context.isError).toBe(false);
      expect(context.structuredContent).not.toHaveProperty('rendered');
      expect(await f.call('foker_task_submit', { task_id: id })).toMatchObject({
        isError: false,
        structuredContent: { state: 'COMPLETED' },
      });
      expect(await f.call('foker_task_get', { task_id: id })).toMatchObject({
        structuredContent: { created_by: 'mcp:unit' },
      });
      expect(await f.client.listResources()).toMatchObject({
        resources: expect.any(Array),
        ttlMs: 0,
        cacheScope: 'private',
      });
      expect((await f.client.listResourceTemplates()).resourceTemplates).toHaveLength(2);
      for (const uri of ['foker://rules', 'foker://map/outline', 'foker://skills/demo', `foker://tasks/${id}`])
        expect(await f.client.readResource({ uri })).toHaveProperty('cacheScope', 'private');
      expect(await tree(f.root)).toEqual(before);
      const entries = (
        await readFile(join(f.root, '.foker/audit', (await readdir(join(f.root, '.foker/audit')))[0] ?? ''), 'utf8')
      )
        .trim()
        .split('\n')
        .map((s) => JSON.parse(s));
      expect(entries[0].prev_hash).toBeNull();
      for (let n = 1; n < entries.length; n++)
        expect(entries[n].prev_hash).toBe(hashCanonicalJson(JSON.stringify(entries[n - 1])));
      expect(entries.every((e) => e.actor === 'mcp:unit')).toBe(true);
      expect(entries.find((e) => e.tool === 'foker_task_begin').args_digest).toBe(
        hashCanonicalJson(JSON.stringify(args)),
      );
      expect(f.logs.every((s) => JSON.parse(s).event === 'tool_call')).toBe(true);
    } finally {
      await f.client.close();
      await f.server.close();
    }
  });
for (const legacy of [false, true])
  it(`entrada y errores recuperables; rate limit con reloj inyectable (legacy=${legacy})`, async () => {
    const f = await fixture(legacy);
    await f.client.listTools();
    try {
      expect(await f.call('foker_context', { task: 'demo', budget_tokens: 20001 })).toMatchObject({
        isError: true,
        error: { code: 'FKR-INP-001' },
      });
      expect(await f.call('foker_task_get', { task_id: 'tsk_00000000000000000000000000' })).toMatchObject({
        isError: true,
        error: { code: 'FKR-TSK-001' },
      });
      for (let n = 0; n < 118; n++) await f.call('foker_search', {});
      expect(await f.call('foker_search', {})).toMatchObject({
        isError: true,
        error: { code: 'FKR-MCP-002', retry_after_ms: 500 },
      });
      f.advance(500);
      expect(await f.call('foker_search', {})).toMatchObject({ error: { code: 'FKR-INP-001' } });
    } finally {
      await f.client.close();
      await f.server.close();
    }
  });

for (const legacy of [false, true])
  it(`serveStdio selecciona era sobre transporte de memoria: ${legacy}`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'foker-era-'));
    roots.push(root);
    const [ct, st] = InMemoryTransport.createLinkedPair();
    const handle = await runStdio({ root, stderr: () => {} }, { transport: st });
    const client = legacy
      ? new LegacyClient({ name: 'era', version: '1.0.0' })
      : new Client({ name: 'era', version: '1.0.0' }, { versionNegotiation: { mode: { pin: '2026-07-28' } } });
    try {
      await client.connect(ct);
      expect((await client.listTools()).tools).toHaveLength(8);
      const result = await client.callTool({ name: 'foker_status', arguments: {} });
      expect(result).toMatchObject({ structuredContent: { protocol: legacy ? '2025-11-25' : '2026-07-28' } });
    } finally {
      await client.close();
      await handle.close();
    }
  });
it('salida inválida se convierte en FKR-INT-001 de protocolo', async () => {
  const f = await fixture();
  const engine = await engineApi.openEngine(f.root);
  await engine.refresh();
  const search = vi
    .spyOn(engine, 'search')
    .mockReturnValue([{ id: 'bad', kind: 'invalid', name: 'bad', file: 'index.ts', score: 1 }]);
  const opened = vi.spyOn(engineApi, 'openEngine').mockResolvedValue(engine);
  try {
    await expect(f.call('foker_search', { query: 'demo' })).rejects.toMatchObject({
      code: -32603,
      data: { code: 'FKR-INT-001' },
    });
  } finally {
    opened.mockRestore();
    search.mockRestore();
    await f.client.close();
    await f.server.close();
  }
});
it('redacta recursos, rechaza traversal y estado enlazado a archivos fuente', async () => {
  const f = await fixture();
  try {
    const secret = 'AK' + 'IA' + 'A1B2C3D4E5F6G7H8';
    await writeFile(join(f.root, 'foker/rules.md'), secret);
    expect(JSON.stringify(await f.client.readResource({ uri: 'foker://rules' }))).not.toContain(secret);
    await expect(f.client.readResource({ uri: 'foker://skills/../rules.md' })).rejects.toMatchObject({ code: -32602 });
    await mkdir(join(f.root, '.foker'), { recursive: true });
    await symlink(join(f.root, 'foker'), join(f.root, '.foker/tasks'));
    expect(await f.call('foker_status')).toMatchObject({ isError: true, error: { code: 'FKR-POL-001' } });
  } finally {
    await f.client.close();
    await f.server.close();
  }
});
it('check usa quick y timeout sigue siendo resultado; no concede trust', async () => {
  const f = await fixture();
  const validate = vi.spyOn(engineApi, 'validateProfile').mockResolvedValue({
    gate: 'checks',
    status: 'fail',
    findings: [],
    checks: [{ check: 'slow', status: 'timeout', exit_code: null, duration_ms: 1000, findings: [], output_tail: '' }],
    log: '.foker/runs/adhoc/1',
  });
  try {
    expect(await f.call('foker_check')).toMatchObject({
      isError: false,
      structuredContent: { ok: false, results: [{ status: 'timeout' }] },
    });
    expect(validate).toHaveBeenCalledWith(f.root, expect.objectContaining({ profile: 'quick' }));
    validate.mockRestore();
    const trust = vi.spyOn(TrustStore.prototype, 'isTrusted').mockResolvedValue(false);
    try {
      expect(await f.call('foker_check')).toMatchObject({
        isError: true,
        error: { code: 'FKR-POL-010', recoverable: false },
      });
    } finally {
      trust.mockRestore();
    }
  } finally {
    validate.mockRestore();
    await f.client.close();
    await f.server.close();
  }
});

for (const legacy of [false, true])
  it(`rechaza globs protegidos sin depender del mapa (legacy=${legacy})`, async () => {
    const f = await fixture(legacy);
    try {
      await f.client.listTools();
      for (const path of ['.git/**', '.agents/**', '.foker/**', 'foker/skills/**', 'foker/**']) {
        const result = await f.call('foker_task_begin', { description: 'protegido', scope: { paths: [path] } });
        expect(result).toMatchObject({
          isError: true,
          error: { code: 'FKR-POL-002', message: expect.stringContaining('protected_paths_in_scope') },
        });
      }
      expect(await new engineApi.TaskStore(f.root).list()).toEqual([]);
    } finally {
      await f.client.close();
      await f.server.close();
    }
  });
