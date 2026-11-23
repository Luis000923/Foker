import assert from 'node:assert/strict';
import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ajv } from '@foker/schemas';
import { afterAll as after, beforeAll as before, test } from 'vitest';

// El servidor se prueba tal como lo arranca el anfitrión: `foker mcp` sobre stdio.
const bin = fileURLToPath(new URL('../../cli/dist/bin.js', import.meta.url));
let root = '';
let child: ChildProcess;
let id = 0;
let buffer = '';
const waiters = new Map<number, (msg: Record<string, unknown>) => void>();

function rpc(method: string, params: unknown): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    const n = ++id;
    waiters.set(n, resolve);
    child.stdin?.write(`${JSON.stringify({ jsonrpc: '2.0', id: n, method, params })}\n`);
  });
}
async function call(name: string, args: Record<string, unknown>) {
  const msg = await rpc('tools/call', { name, arguments: args });
  return msg['result'] as {
    isError?: boolean;
    structuredContent?: Record<string, unknown>;
    content: { text: string }[];
  };
}

before(async () => {
  root = mkdtempSync(join(tmpdir(), 'foker-mcp-'));
  const write = (id: string, text: string) => {
    mkdirSync(dirname(join(root, id)), { recursive: true });
    writeFileSync(join(root, id), text);
  };
  write('src/util.ts', 'export function twice(n: number): number {\n  return n * 2;\n}\n');
  write('src/main.ts', "import { twice } from './util';\nexport const four = twice(2);\n");
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('node', [bin, 'init', '--targets', 'claude-code', '--non-interactive'], { cwd: root, stdio: 'ignore' });
  child = spawn('node', [bin, 'mcp', '--root', root], { cwd: root, stdio: ['pipe', 'pipe', 'ignore'] });
  child.stdout?.on('data', (data) => {
    buffer += data;
    for (let i = buffer.indexOf('\n'); i >= 0; i = buffer.indexOf('\n')) {
      const line = buffer.slice(0, i);
      buffer = buffer.slice(i + 1);
      if (!line.trim()) continue;
      const msg = JSON.parse(line) as Record<string, unknown>;
      waiters.get(msg['id'] as number)?.(msg);
    }
  });
  await rpc('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'test', version: '0' },
  });
  child.stdin?.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
});
after(() => {
  child?.kill();
  rmSync(root, { recursive: true, force: true });
});

test('las respuestas cumplen el outputSchema compacto publicado en tools/list', async () => {
  const list = (await rpc('tools/list', {}))['result'] as { tools: { name: string; outputSchema: object }[] };
  const schemas = new Map(list.tools.map((t) => [t.name, ajv().compile(t.outputSchema)]));
  for (const [name, args] of [
    ['foker_status', {}],
    ['foker_search', { query: 'twice' }],
    ['foker_impact', { files: ['src/util.ts'] }],
    ['foker_context', { task: 'Cambiar twice', anchors: { files: ['src/util.ts'] } }],
    ['foker_check_deps', {}],
  ] as const) {
    const result = await call(name, args);
    assert.ok(!result.isError, `${name}: ${result.content[0]?.text}`);
    const validate = schemas.get(name);
    assert.ok(validate?.(result.structuredContent), `${name}: ${JSON.stringify(validate?.errors)}`);
  }
});

test('foker://map/outline lista ids reales por PageRank, no índices', async () => {
  const read = (await rpc('resources/read', { uri: 'foker://map/outline' }))['result'] as {
    contents: { text: string }[];
  };
  const lines = read.contents[0]?.text.split('\n') ?? [];
  assert.ok(
    lines.some((l) => l.startsWith('src/util.ts: ') && l.includes('twice')),
    lines.join('\n'),
  );
  assert.ok(!lines.some((l) => /^\d+: /.test(l)));
});

test('contexto diferencial por task_id; full=true reenvía', async () => {
  const begun = await call('foker_task_begin', {
    description: 'Cambiar twice',
    scope: { paths: ['src/**'] },
    profile: 'quick',
    context: { anchors: { files: ['src/util.ts'] } },
  });
  assert.ok(!begun.isError, begun.content[0]?.text);
  const task_id = begun.structuredContent?.['task_id'];
  const args = { task: 'Cambiar twice', anchors: { files: ['src/util.ts'] }, task_id };
  const second = await call('foker_context', args);
  assert.ok((second.structuredContent?.['unchanged_files'] as number) >= 1);
  assert.ok(!second.content[0]?.text.includes('return n * 2'));
  assert.ok(second.content[0]?.text.includes('unchanged="'));
  const full = await call('foker_context', { ...args, full: true });
  assert.equal(full.structuredContent?.['unchanged_files'], undefined);
  assert.ok(full.content[0]?.text.includes('return n * 2'));
  await call('foker_task_cancel', { task_id });
});

test('foker_check_deps: solo lectura, offline y con inputSchema estricto', async () => {
  const list = (await rpc('tools/list', {}))['result'] as {
    tools: { name: string; annotations: { readOnlyHint: boolean; openWorldHint: boolean } }[];
  };
  const tool = list.tools.find((t) => t.name === 'foker_check_deps');
  assert.equal(tool?.annotations.readOnlyHint, true);
  assert.equal(tool?.annotations.openWorldHint, false);
  writeFileSync(join(root, 'package.json'), JSON.stringify({ dependencies: { zod: 'latest' } }));
  const result = await call('foker_check_deps', {});
  assert.equal(result.structuredContent?.['status'], 'FAIL');
  const rejected = await call('foker_check_deps', { diff_base: '--output=/tmp/x' });
  assert.ok(rejected.isError);
  const extra = await call('foker_check_deps', { online: true });
  assert.ok(extra.isError);
});
