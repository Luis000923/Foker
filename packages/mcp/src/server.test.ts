import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as engineApi from '@foker/engine';
import { hashCanonicalJson, loadConfig, skillTemplate, TrustStore } from '@foker/engine';
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
  await writeFile(join(root, 'foker/skills/demo/SKILL.md'), skillTemplate('demo').markdown);
  await writeFile(join(root, 'foker/skills/demo/foker.skill.yaml'), JSON.stringify(skillTemplate('demo').manifest));
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
      expect(result).toHaveProperty('structuredContent');
      const content = result['content'] as Array<{ type: string; text: string }>;
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
      expect(context.structuredContent).toMatchObject({ pack_version: 2 });
      expect(context.structuredContent).toHaveProperty('rendered');
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
      for (const uri of [
        'foker://rules',
        'foker://map/outline',
        'foker://skills/demo',
        'foker://skills/foker-workflow',
        `foker://tasks/${id}`,
      ])
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

it('recurso skills aplica disabled y devuelve FKR-SKL-001 si falta', async () => {
  const f = await fixture();
  try {
    await expect(f.client.readResource({ uri: 'foker://skills/missing' })).rejects.toMatchObject({
      data: { code: 'FKR-SKL-001' },
    });
    const path = join(f.root, 'foker.config.yaml');
    await writeFile(path, `${await readFile(path, 'utf8')}\nskills: {disabled: [foker-workflow]}\n`);
    await expect(f.client.readResource({ uri: 'foker://skills/foker-workflow' })).rejects.toMatchObject({
      data: { code: 'FKR-SKL-001' },
    });
  } finally {
    await f.client.close();
    await f.server.close();
  }
});

it('begin acota 1000 rutas sin modificar el baseline del motor', async () => {
  const f = await fixture();
  const original = engineApi.TaskStore.prototype.begin;
  const dirty = Array.from(
    { length: 1000 },
    (_, i) => `${i < 500 ? 'node_modules' : 'src'}/${String(i).padStart(4, '0')}.ts`,
  ).reverse();
  let task: Awaited<ReturnType<typeof original>> | undefined;
  const begin = vi.spyOn(engineApi.TaskStore.prototype, 'begin').mockImplementation(async function (
    this: engineApi.TaskStore,
    input,
  ) {
    task = await original.call(this, input);
    task.baseline.dirty_files = dirty;
    return task;
  });
  try {
    const result = await f.call('foker_task_begin', { description: 'compacta', scope: { paths: ['index.ts'] } });
    expect(result.isError).toBe(false);
    expect(result.structuredContent).toMatchObject({
      baseline: {
        dirty_files: dirty
          .filter((p) => p.startsWith('src/'))
          .sort()
          .slice(0, 20),
        dirty_files_total: 1000,
        dirty_files_truncated: true,
        snapshot_hash: task?.baseline.snapshot_hash,
      },
    });
    expect(JSON.stringify(result).length).toBeLessThan(4000);
    expect(task?.baseline.dirty_files).toEqual(dirty);
  } finally {
    begin.mockRestore();
    await f.client.close();
    await f.server.close();
  }
});

it('check y submit omiten output_tail en pass y eliminan ANSI en fail sin cambiar findings', async () => {
  const f = await fixture();
  const findings = [{ rule: 'test', message: 'Fallo medido' }];
  const checks = [
    {
      check: 'ok',
      status: 'pass' as const,
      exit_code: 0,
      duration_ms: 1,
      findings: [],
      output_tail: '\u001b[32méxito\u001b[0m',
    },
    {
      check: 'bad',
      status: 'fail' as const,
      exit_code: 1,
      duration_ms: 1,
      findings,
      output_tail: '\u001b[31mfallo\u001b[0m\u001b]8;;https://example.test\u0007 enlace\u001b]8;;\u0007',
    },
  ];
  const gate = { gate: 'checks' as const, status: 'fail' as const, findings, checks };
  const validate = vi.spyOn(engineApi, 'validateProfile').mockResolvedValue({ ...gate, log: '.foker/runs/adhoc/1' });
  const submit = vi.spyOn(engineApi, 'submitTask').mockResolvedValue({
    task_id: 'tsk_00000000000000000000000000',
    state: 'REJECTED',
    attempt: 1,
    gates: [gate],
    evidence: '.foker/runs/tsk_00000000000000000000000000/1/evidence.json',
    next_action: 'fix_and_resubmit',
  });
  try {
    for (const [tool, args] of [
      ['foker_check', {}],
      ['foker_task_submit', { task_id: 'tsk_00000000000000000000000000' }],
    ] as const) {
      // submit renueva el lease antes de ejecutar el motor.
      const touch = vi.spyOn(engineApi.TaskStore.prototype, 'touch').mockResolvedValue({} as never);
      try {
        const result = await f.call(tool, args);
        expect(result.isError).toBe(false);
        const data = result.structuredContent as { results?: typeof checks; gates?: Array<{ checks: typeof checks }> };
        const returned = data.results ?? data.gates?.[0]?.checks;
        expect(returned?.[0]).not.toHaveProperty('output_tail');
        expect(returned?.[1]).toMatchObject({ output_tail: 'fallo enlace', findings });
        expect(checks[0]?.output_tail).toContain('\u001b');
        expect(checks[1]?.output_tail).toContain('\u001b');
      } finally {
        touch.mockRestore();
      }
    }
  } finally {
    validate.mockRestore();
    submit.mockRestore();
    await f.client.close();
    await f.server.close();
  }
});

for (const legacy of [false, true]) {
  it(`contexto compacto contiene código; explain conserva el pack completo (legacy=${legacy})`, async () => {
    const f = await fixture(legacy);
    try {
      await f.client.listTools();
      const args = { task: 'Cambiar demo', anchors: { files: ['index.ts'] }, dirty_files: false };
      const result = await f.call('foker_context', args);
      const data = result.structuredContent as Record<string, unknown>;
      expect(Object.keys(data).sort()).toEqual(['budget', 'diagnostics', 'pack_hash', 'pack_version', 'rendered']);
      expect(Object.keys(data['budget'] as object).sort()).toEqual(['limit', 'used']);
      expect(data['rendered']).toContain('export const demo = 1;');
      expect(result['content']).toEqual([{ type: 'text', text: data['rendered'] }]);
      const explained = await f.call('foker_context', { ...args, explain: true });
      expect(explained.structuredContent).toMatchObject({
        files: expect.any(Array),
        sections: expect.any(Array),
        excluded: expect.any(Array),
        budget: { estimator: expect.any(String) },
        rendered: expect.stringContaining('export const demo = 1;'),
      });
      expect(explained['content']).toEqual([
        { type: 'text', text: (explained.structuredContent as { rendered: string }).rendered },
      ]);
    } finally {
      await f.client.close();
      await f.server.close();
    }
  });

  it(`begin con contexto usa task_id y defaults/opciones sin alterar client_token (legacy=${legacy})`, async () => {
    const f = await fixture(legacy);
    try {
      await f.client.listTools();
      const args = {
        description: 'Modificar demo',
        scope: { paths: ['index.ts'] },
        skill: 'demo',
        client_token: 'combined',
      };
      const result = await f.call('foker_task_begin', { ...args, context: true });
      const data = result.structuredContent as {
        task_id: string;
        context: { pack_hash: string; budget: { limit: number }; rendered: string };
      };
      expect(result.isError).toBe(false);
      expect(data.context.rendered).toContain(data.task_id);
      expect(data.context.rendered).toContain('demo');
      const context = { budget_tokens: 8000, anchors: { files: ['index.ts'] }, intent: 'fix' };
      const retry = await f.call('foker_task_begin', { ...args, context });
      const retried = retry.structuredContent as typeof data;
      expect(retried.task_id).toBe(data.task_id);
      expect(retried.context.budget.limit).toBe(8000);
      expect(retried.context.rendered).toContain('export const demo = 1;');
      expect(JSON.parse((retry['content'] as { text: string }[])[0]?.text ?? '')).toEqual(retry.structuredContent);
      const standalone = await f.call('foker_context', {
        task: args.description,
        task_id: data.task_id,
        skill: 'demo',
        ...context,
      });
      expect(standalone.structuredContent).toMatchObject(retried.context);
      expect(await f.call('foker_task_begin', args)).toMatchObject({ structuredContent: { task_id: data.task_id } });
      expect(await new engineApi.TaskStore(f.root).list()).toHaveLength(1);
      expect(await f.call('foker_task_get', { task_id: data.task_id })).not.toHaveProperty('structuredContent.context');
      expect(await f.call('foker_task_begin', { ...args, description: 'Otra tarea', context: true })).toMatchObject({
        isError: true,
        error: { code: 'FKR-INP-001' },
      });
    } finally {
      await f.client.close();
      await f.server.close();
    }
  });

  it(`un pack fallido conserva tarea y permite recuperar con el mismo token (legacy=${legacy})`, async () => {
    const f = await fixture(legacy);
    try {
      await f.client.listTools();
      const args = { description: 'demo', scope: { paths: ['index.ts'] }, client_token: 'recover' };
      for (const context of [false, { budget_tokens: 999 }, { explain: true }, { anchors: { extra: [] } }])
        expect(await f.call('foker_task_begin', { ...args, context })).toMatchObject({
          isError: true,
          error: { code: 'FKR-INP-001' },
        });
      expect(await new engineApi.TaskStore(f.root).list()).toHaveLength(0);
      await writeFile(join(f.root, 'foker/rules.md'), 'reglas obligatorias\n'.repeat(1000));
      const result = await f.call('foker_task_begin', { ...args, context: { budget_tokens: 1000 } });
      expect(result).toMatchObject({
        isError: false,
        structuredContent: { task_id: expect.any(String), context_error: { code: 'FKR-CTX-001', recoverable: true } },
      });
      expect(result.structuredContent).not.toHaveProperty('context');
      const id = (result.structuredContent as { task_id: string }).task_id;
      expect(await f.call('foker_task_get', { task_id: id })).toMatchObject({
        structuredContent: { state: 'RUNNING' },
      });
      await writeFile(join(f.root, 'foker/rules.md'), '# Reglas\n');
      expect(await f.call('foker_task_begin', { ...args, context: true })).toMatchObject({
        isError: false,
        structuredContent: { task_id: id, context: { rendered: expect.any(String) } },
      });
      expect(await new engineApi.TaskStore(f.root).list()).toHaveLength(1);
    } finally {
      await f.client.close();
      await f.server.close();
    }
  });
}

it('truncado conserva rendered idéntico y task_id; redacta el código de ambos transportes', () => {
  const secret = 'AK' + 'IA' + 'A1B2C3D4E5F6G7H8';
  const rendered = `${secret}\n${'código\n'.repeat(30000)}`;
  const result = limitOutput(
    { pack_version: 2, pack_hash: 'a'.repeat(64), budget: { used: 1000, limit: 8000 }, rendered, diagnostics: [] },
    rendered,
  );
  expect(result.structured['rendered']).toBe(result.rendered);
  expect(result.rendered).not.toContain(secret);
  expect(result.rendered).toContain('FKR-MCP-101');
  expect(result.structured['diagnostics']).toContainEqual(expect.objectContaining({ code: 'FKR-MCP-101' }));
  expect(
    JSON.stringify({ content: [{ type: 'text', text: result.rendered }], structuredContent: result.structured }).length,
  ).toBeLessThanOrEqual(80000);
  const taskId = 'tsk_00000000000000000000000000';
  const begin = limitOutput({
    task_id: taskId,
    context: { pack_hash: 'b'.repeat(64), budget: { used: 1000, limit: 8000 }, rendered },
  });
  expect(begin.structured['task_id']).toBe(taskId);
  expect(begin.structured).toHaveProperty('diagnostics');
});

it('valida el pack completo antes de proyectarlo y conserva task_id si falla en begin', async () => {
  const f = await fixture();
  const engine = await engineApi.openEngine(f.root);
  await engine.refresh();
  const build = engine.buildContext.bind(engine);
  const mocked = vi.spyOn(engine, 'buildContext').mockImplementation(async (input) => {
    const pack = await build(input);
    const data = JSON.parse(pack.json);
    delete data.map_hash;
    return { ...pack, json: JSON.stringify(data) };
  });
  const opened = vi.spyOn(engineApi, 'openEngine').mockResolvedValue(engine);
  try {
    await expect(f.call('foker_context', { task: 'demo' })).rejects.toMatchObject({
      code: -32603,
      data: { code: 'FKR-INT-001' },
    });
    const result = await f.call('foker_task_begin', {
      description: 'demo',
      scope: { paths: ['index.ts'] },
      context: true,
    });
    expect(result).toMatchObject({
      isError: false,
      structuredContent: { task_id: expect.any(String), context_error: { code: 'FKR-INT-001' } },
    });
    expect(await new engineApi.TaskStore(f.root).list()).toHaveLength(1);
  } finally {
    opened.mockRestore();
    mocked.mockRestore();
    await f.client.close();
    await f.server.close();
  }
});
