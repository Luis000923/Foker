import type { BenchmarkManifest } from '../types.js';
export interface HostOutput {
  codex?: boolean;
  usage?: {
    input_tokens?: number | undefined;
    cache_read_input_tokens?: number | undefined;
    cache_creation_input_tokens?: number | undefined;
    output_tokens?: number | undefined;
  };
  total_cost_usd?: number;
  num_turns?: number;
  duration_ms?: number;
  is_error?: boolean;
  transcript?: unknown[];
  tool_traces?: unknown[];
}
export function extractUsage(output: HostOutput, manifest: BenchmarkManifest) {
  const u = output.usage;
  if (!u) throw new Error('Claude no devolvió usage agregado');
  const token = (value: number | undefined) => {
    if (value === undefined || !Number.isSafeInteger(value) || value < 0)
      throw new Error('Usage incompleto o inválido');
    return value;
  };
  const input = token(u.input_tokens),
    cached = token(u.cache_read_input_tokens),
    write = output.codex ? null : token(u.cache_creation_input_tokens),
    out = token(u.output_tokens);
  const price = manifest.prices.models.find((p) => p.model === manifest.model);
  const cost =
    !price || [price.input, price.cache_read, ...(output.codex ? [] : [price.cache_write]), price.output].includes(null)
      ? null
      : (input * (price.input as number) +
          cached * (price.cache_read as number) +
          (write ?? 0) * (price.cache_write ?? 0) +
          out * (price.output as number)) /
        1e6;
  return {
    input_tokens_total: input + cached + (write ?? 0),
    cached_tokens: cached,
    cache_write_tokens: write,
    output_tokens: out,
    cost_usd: cost,
    turns: output.num_turns ?? null,
    reported_cost_usd: output.total_cost_usd ?? null,
    duration_ms: output.duration_ms ?? null,
  };
}
export function traceMetrics(
  data: unknown,
  files = new Set<string>(),
): { files: Set<string>; retries: number; errors: number; packs: { files: string[]; tokens: number }[] } {
  let retries = 0;
  const packs: { files: string[]; tokens: number }[] = [];
  const commands = new Map<string, string>();
  const results: Record<string, unknown>[] = [];
  const seenPacks = new Set<string>();
  const visit = (value: unknown) => {
    if (typeof value === 'string' && /^[[{]/.test(value.trim())) {
      try {
        visit(JSON.parse(value));
      } catch {
        /* text */
      }
      return;
    }
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const v = value as Record<string, unknown>;
    if (v['type'] === 'tool_use' && ['Read', 'read_file'].includes(String(v['name']))) {
      const input = v['input'] as Record<string, unknown> | undefined;
      const path = input?.['file_path'] ?? input?.['path'];
      if (typeof path === 'string') files.add(path.replace(/^\/work\//, ''));
    }
    if (v['type'] === 'tool_use' && v['name'] === 'Bash' && typeof v['id'] === 'string')
      commands.set(v['id'], String((v['input'] as Record<string, unknown>)?.['command'] ?? ''));
    if (v['type'] === 'tool_result') results.push(v);
    if (typeof v['pack_hash'] === 'string' && Array.isArray(v['files']) && !seenPacks.has(v['pack_hash'])) {
      seenPacks.add(v['pack_hash']);
      const selected = (v['files'] as { id: string; level: string }[])
        .filter((f) => ['L1', 'L2', 'L3'].includes(f.level))
        .map((f) => f.id.replace(/^file:/, ''));
      selected.forEach((f) => {
        files.add(f);
      });
      const tokens = (v['budget'] as { used?: number })?.used;
      if (typeof tokens === 'number' && tokens > 0) packs.push({ files: selected, tokens });
    }
    if (typeof v['path'] === 'string' && ['L1', 'L2', 'L3'].includes(String(v['level']))) files.add(v['path']);

    if (
      /test|typecheck|vitest|tsc/.test(String(v['command'] ?? '')) &&
      typeof v['exit_code'] === 'number' &&
      v['exit_code'] !== 0
    )
      retries++;
    Object.values(v).forEach(visit);
  };
  visit(data);
  for (const result of results)
    if (
      result['is_error'] === true &&
      /(?:^|[\s;&|])(typecheck|test|vitest|tsc)(?:[\s;&|]|$)/.test(commands.get(String(result['tool_use_id'])) ?? '')
    )
      retries++;
  const errors = new Set(results.filter((r) => r['is_error'] === true).map((r, i) => String(r['tool_use_id'] ?? i)))
    .size;
  return { files, retries, errors, packs };
}

// Codex emite eventos JSONL; thread.started no contiene métricas de uso.
export function parseCodexOutput(text: string): HostOutput {
  const output: HostOutput = { codex: true };
  for (const line of text.split('\n').filter(Boolean)) {
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (event['type'] === 'turn.failed' || event['type'] === 'error') output.is_error = true;
    if (event['type'] !== 'turn.completed' || !event['usage']) continue;
    const u = event['usage'] as Record<string, number>;
    const input = u['input_tokens'],
      cached = u['cached_input_tokens'];
    const sum = (previous: number | undefined, current: number | undefined) =>
      current === undefined || (output.usage && previous === undefined) ? undefined : (previous ?? 0) + current;
    output.usage = {
      input_tokens: sum(
        output.usage?.input_tokens,
        input === undefined || cached === undefined ? undefined : input - cached,
      ),
      cache_read_input_tokens: sum(output.usage?.cache_read_input_tokens, cached),
      output_tokens: sum(output.usage?.output_tokens, u['output_tokens']),
    };
  }
  return output;
}
