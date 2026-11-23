import { mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FokerError } from '@foker/engine';
import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport, ProtocolErrorCode } from '@modelcontextprotocol/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CLIENT_SAFE_CODES, createFokerServer, protocolFailure } from '../src/index.js';

describe('protocolFailure', () => {
  it('expone FKR-CFG-002 y FKR-POL-001 y oculta el resto', () => {
    expect([...CLIENT_SAFE_CODES].sort()).toEqual(['FKR-CFG-002', 'FKR-POL-001']);
    const policy = protocolFailure(new FokerError('FKR-POL-001', 'El estado .foker no admite symlinks.'));
    expect(policy.code).toBe(ProtocolErrorCode.InvalidRequest);
    expect(policy.data).toMatchObject({ code: 'FKR-POL-001', message: 'El estado .foker no admite symlinks.' });
    const internal = protocolFailure(new FokerError('FKR-INT-001', 'ruta /secreta/interna'));
    expect(internal.code).toBe(ProtocolErrorCode.InternalError);
    expect(internal.data).toMatchObject({ code: 'FKR-INT-001', message: 'Error interno de Foker.' });
  });
});

describe('servidor MCP: FKR-POL-001 llega al cliente', () => {
  let base: string;
  let client: Client | undefined;
  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), 'foker-mcp-'));
  });
  afterEach(async () => {
    await client?.close();
    await rm(base, { recursive: true, force: true });
  });

  it('resources/read con .foker symlink devuelve el código y el mensaje diagnóstico', async () => {
    const root = join(base, 'root');
    await mkdir(root);
    await mkdir(join(base, 'elsewhere'));
    await symlink(join(base, 'elsewhere'), join(root, '.foker'), process.platform === 'win32' ? 'junction' : 'dir');
    const server = await createFokerServer({ root, stderr: () => {} });
    client = new Client({ name: 'test', version: '1' }, { versionNegotiation: { mode: { pin: '2026-07-28' } } });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const failure = await client
      .readResource({ uri: `foker://tasks/tsk_${'0'.repeat(26)}` })
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(Error);
    const data = (failure as { data?: { code?: string; message?: string } }).data;
    expect(data?.code).toBe('FKR-POL-001');
    expect(data?.message).toBe('El estado .foker no admite symlinks.');
  });
});

describe('servidor MCP sin git en el PATH (modo degradado)', () => {
  let base: string;
  let client: Client | undefined;
  const path = process.env['PATH'];
  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), 'foker-mcp-nogit-'));
  });
  afterEach(async () => {
    process.env['PATH'] = path;
    await client?.close();
    await rm(base, { recursive: true, force: true });
  });

  it('foker_context responde sin error y lleva el aviso en _meta.diagnostics', async () => {
    const { writeFile } = await import('node:fs/promises');
    await mkdir(join(base, 'src'));
    await writeFile(join(base, 'src/a.ts'), 'export const a = 1;\n');
    const server = await createFokerServer({ root: base, stderr: () => {} });
    client = new Client({ name: 'test', version: '1' }, { versionNegotiation: { mode: { pin: '2026-07-28' } } });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    process.env['PATH'] = join(base, 'sin-binarios');
    const result = await client.callTool({
      name: 'foker_context',
      arguments: { task: 'revisar a.ts', anchors: { files: ['src/a.ts'] } },
    });
    expect(result.isError).toBeFalsy();
    const diagnostics = (result._meta as { diagnostics?: { code: string; message: string }[] } | undefined)
      ?.diagnostics;
    expect(diagnostics).toEqual([
      expect.objectContaining({ code: 'FKR-MAP-001', message: expect.stringContaining('git no está instalado') }),
    ]);
  });
});
