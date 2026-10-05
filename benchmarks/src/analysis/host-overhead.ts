import { readFileSync } from 'node:fs';

type RecordValue = Record<string, unknown>;
function record(value: unknown): RecordValue {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as RecordValue) : {};
}
/** Estimador bytes-lf/3.2@1; no equivale al tokenizer del anfitrión. */
export function estimateTokens(text: string) {
  return Math.ceil(Buffer.byteLength(text.replace(/\r\n/g, '\n')) / 3.2);
}
function tokens(usage: RecordValue, key: string): number {
  const value = usage[key];
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new Error(`Usage incompleto o inválido: ${key}`);
  return value;
}

/** Acepta la transcripción o traces.json del arnés (selecciona traces[0]). */
export function analyzeHostOverhead(data: unknown) {
  if (!Array.isArray(data)) throw new Error('Se esperaba una transcripción JSON');
  const events: unknown[] = Array.isArray(data[0]) ? data[0] : data;
  const turns: Array<{
    id: string;
    input: number;
    cache_creation: number;
    cache_read: number;
    output: number;
    total_input: number;
    first_turn_baseline: number;
    growth_from_first: number;
    incremental_growth: number;
    visible_since_previous: { tool_results_bytes: number; model_bytes: number; other_user_bytes: number };
  }> = [];
  const seen = new Map<string, number[]>();
  let pending = { tool_results_bytes: 0, model_bytes: 0, other_user_bytes: 0 };
  for (const raw of events) {
    const event = record(raw);
    if (event['isSidechain'] === true) continue;
    const message = record(event['message']);
    const content = message['content'];
    if (event['type'] === 'assistant' && message['usage'] !== undefined) {
      const usage = record(message['usage']);
      const id = message['id'];
      if (typeof id !== 'string' || !id) throw new Error('Respuesta sin message.id');
      const values = ['input_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens', 'output_tokens'].map(
        (key) => tokens(usage, key),
      );
      const previous = seen.get(id);
      if (previous?.some((value, index) => value !== values[index])) throw new Error(`Usage contradictorio para ${id}`);
      if (!previous) {
        seen.set(id, values);
        const [input = 0, cache_creation = 0, cache_read = 0, output = 0] = values;
        const total_input = input + cache_creation + cache_read;
        const baseline = turns[0]?.total_input ?? total_input;
        turns.push({
          id,
          input,
          cache_creation,
          cache_read,
          output,
          total_input,
          first_turn_baseline: baseline,
          growth_from_first: total_input - baseline,
          incremental_growth: turns.length ? total_input - (turns.at(-1)?.total_input ?? 0) : 0,
          visible_since_previous: pending,
        });
        pending = { tool_results_bytes: 0, model_bytes: 0, other_user_bytes: 0 };
      }
      // Bloques visibles, sin firmas de thinking ni envoltorios internos del anfitrión.
      for (const block of Array.isArray(content) ? content : []) {
        const b = record(block);
        if (b['type'] === 'text' && typeof b['text'] === 'string') pending.model_bytes += Buffer.byteLength(b['text']);
        if (b['type'] === 'tool_use') pending.model_bytes += Buffer.byteLength(JSON.stringify(b['input'] ?? {}));
      }
    } else if (event['type'] === 'user') {
      if (typeof content === 'string') pending.other_user_bytes += Buffer.byteLength(content);
      for (const block of Array.isArray(content) ? content : []) {
        const b = record(block);
        const bytes = Buffer.byteLength(typeof b['content'] === 'string' ? b['content'] : JSON.stringify(b));
        if (b['type'] === 'tool_result') pending.tool_results_bytes += bytes;
        else pending.other_user_bytes += bytes;
      }
    }
  }
  const total = turns.reduce((sum, turn) => sum + turn.total_input, 0);
  return {
    calls: turns.length,
    first_turn_input: turns[0]?.total_input ?? null,
    mean_incremental_growth:
      turns.length > 1 ? ((turns.at(-1)?.total_input ?? 0) - (turns[0]?.total_input ?? 0)) / (turns.length - 1) : null,
    total_input: total,
    total_output: turns.reduce((sum, turn) => sum + turn.output, 0),
    turns,
  };
}

export async function main(args: string[]) {
  const path = args[0];
  if (args.length !== 1 || !path) throw new Error('Uso: host-overhead <traces.json>');
  process.stdout.write(`${JSON.stringify(analyzeHostOverhead(JSON.parse(readFileSync(path, 'utf8'))), null, 2)}\n`);
}
