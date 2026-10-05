import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validate } from '@foker/schemas';
import { afterEach, expect, it, vi } from 'vitest';
import { main } from './src/bench-run.js';
import { claudeArgs, claudeCredential, codexArgs, containerBackend, ROOT } from './src/harness/index.js';
import { extractUsage, parseCodexOutput } from './src/harness/metrics.js';
import { execute } from './src/harness/process.js';
import { readManifest } from './src/validate-manifest.js';

vi.mock('./src/harness/process.js', () => ({
  detectRuntime: () => 'docker',
  execute: vi.fn(async () => ({ stdout: '', stderr: '', exitCode: 0, timedOut: false })),
}));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
it('acepta suscripción, prioriza OAuth y explica ambas vías', () => {
  expect(claudeCredential({ CLAUDE_CODE_OAUTH_TOKEN: 'secreto', ANTHROPIC_API_KEY: 'clave' })).toBe(
    'CLAUDE_CODE_OAUTH_TOKEN',
  );
  expect(claudeCredential({ ANTHROPIC_API_KEY: 'clave' })).toBe('ANTHROPIC_API_KEY');
  expect(() => claudeCredential({})).toThrow('claude setup-token');
  expect(claudeArgs('tarea', 'modelo', 60, '/mcp', null)).not.toContain('--max-budget-usd');
  expect(claudeArgs('tarea', 'modelo', 60, '/mcp', null)).not.toContain('--allowedTools');
  expect(claudeArgs('tarea', 'modelo', 60, '/mcp', null, ['mcp__foker']).slice(-2)).toEqual([
    '--allowedTools',
    'mcp__foker',
  ]);
});
it('solo el anfitrión recibe OAuth por nombre; Codex monta autenticación explícita readonly', async () => {
  vi.stubEnv('CLAUDE_CODE_OAUTH_TOKEN', 'secreto-no-en-argv');
  const manifest = readManifest(join(ROOT, 'benchmarks/manifest.yaml'));
  const backend = containerBackend(manifest);
  await backend.prepare?.('/fixture', 'control');
  expect(vi.mocked(execute).mock.calls[0]?.[1]).not.toContain('CLAUDE_CODE_OAUTH_TOKEN');
  await backend.host('/fixture', [], 100);
  const argv = vi.mocked(execute).mock.calls[1]?.[1] ?? [];
  expect(argv).toContain('CLAUDE_CODE_OAUTH_TOKEN');
  expect(argv.join(' ')).not.toContain('secreto-no-en-argv');
  expect(argv).not.toContain('ANTHROPIC_API_KEY');
  manifest.host = { name: 'codex', version: '0.159.3' };
  await containerBackend(manifest, { codexAuthDir: '/explicit/auth' }).host('/fixture', [], 100);
  expect(vi.mocked(execute).mock.calls[2]?.[1]).toContain('type=bind,src=/explicit/auth,dst=/codex-auth,readonly');
  expect(codexArgs('tarea', 'modelo', 60, 'foker')).toContain('mcp_servers.foker.args=["mcp","--root","/work"]');
  expect(codexArgs('tarea', 'modelo', 60, 'control').join(' ')).not.toContain('mcp_servers');
});
it('Codex JSONL conserva usage inclusivo, caché y campos no observados', () => {
  const manifest = readManifest(join(ROOT, 'benchmarks/manifest.yaml'));
  manifest.model = 'codex-exacto';
  const output = parseCodexOutput(
    '{"type":"thread.started"}\n{"type":"turn.completed","usage":{"input_tokens":100,"cached_input_tokens":20,"output_tokens":10}}\n',
  );
  const usage = extractUsage(output, manifest);
  expect(usage.input_tokens_total).toBe(100);
  expect(usage.cached_tokens).toBe(20);
  expect(usage.cache_write_tokens).toBeNull();
  expect(usage.turns).toBeNull();
  expect(usage.reported_cost_usd).toBeNull();
  expect(usage.cost_usd).toBeNull();
  manifest.prices.models = [{ model: manifest.model, input: 3, cache_read: 1, cache_write: null, output: 10 }];
  expect(extractUsage(output, manifest).cost_usd).toBeCloseTo(0.00036);
  expect(parseCodexOutput('{"type":"turn.failed"}').is_error).toBe(true);
});

it('falla pronto sin autenticación y valida la ampliación de resultados', async () => {
  vi.stubEnv('CLAUDE_CODE_OAUTH_TOKEN', '');
  vi.stubEnv('ANTHROPIC_API_KEY', '');
  await expect(main(['--yes'])).rejects.toThrow('CLAUDE_CODE_OAUTH_TOKEN');
  const result = JSON.parse(readFileSync(join(ROOT, 'packages/schemas/examples/benchmark-result.json'), 'utf8'));
  result.host = { name: 'codex', version: '0.159.3' };
  result.billing = 'subscription';
  result.metrics.reported_cost_usd = null;
  expect(validate('benchmark-result', result).ok).toBe(true);
  result.billing = 'desconocido';
  expect(validate('benchmark-result', result).ok).toBe(false);
});
it('agrega varios eventos de uso sin inventar turnos ni resultados parciales', () => {
  const manifest = readManifest(join(ROOT, 'benchmarks/manifest.yaml'));
  const line = '{"type":"turn.completed","usage":{"input_tokens":100,"cached_input_tokens":20,"output_tokens":10}}';
  expect(extractUsage(parseCodexOutput(`${line}\n${line}`), manifest).input_tokens_total).toBe(200);
  expect(parseCodexOutput('JSON incompleto').usage).toBeUndefined();
});
