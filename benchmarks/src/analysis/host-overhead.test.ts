import { expect, it } from 'vitest';
import { analyzeHostOverhead, estimateTokens } from './host-overhead.js';

const assistant = (id: string, read: number, write: number, content: unknown[] = []) => ({
  type: 'assistant',
  message: {
    id,
    content,
    usage: {
      input_tokens: 2,
      cache_read_input_tokens: read,
      cache_creation_input_tokens: write,
      output_tokens: 8,
    },
  },
});
const fixture = [
  { type: 'user', message: { content: 'é' } },
  assistant('a', 100, 20, [{ type: 'text', text: 'hola' }]),
  assistant('a', 100, 20, [{ type: 'tool_use', input: { x: 1 } }]),
  { type: 'user', message: { content: [{ type: 'tool_result', content: 'éxito' }] } },
  { ...assistant('side', 999, 99), isSidechain: true },
  assistant('b', 120, 10),
  assistant('c', 0, 50), // Contracción: no se oculta como crecimiento cero.
];
it('deduplica bloques, separa caché y mide deltas y bytes visibles UTF-8', () => {
  const result = analyzeHostOverhead([fixture, []]);
  expect(result.calls).toBe(3);
  expect(result.first_turn_input).toBe(122);
  expect(result.total_input).toBe(306);
  expect(result.total_output).toBe(24);
  expect(result.mean_incremental_growth).toBe(-35);
  expect(result.turns.map((t) => t.incremental_growth)).toEqual([0, 10, -80]);
  expect(result.turns[1]?.visible_since_previous).toEqual({
    model_bytes: 11,
    tool_results_bytes: 6,
    other_user_bytes: 0,
  });
  expect(result.turns[2]?.growth_from_first).toBe(-70);
  expect(estimateTokens('é\r\nabc')).toBe(2);
});
it('no inventa ceros ni acepta contadores contradictorios', () => {
  expect(() => analyzeHostOverhead([assistant('a', 1, 2), assistant('a', 2, 2)])).toThrow('contradictorio');
  expect(() => analyzeHostOverhead([{ type: 'assistant', message: { id: 'a', usage: {} } }])).toThrow('incompleto');
  expect(() => analyzeHostOverhead({})).toThrow('transcripción');
  expect(analyzeHostOverhead([]).first_turn_input).toBeNull();
  expect(analyzeHostOverhead([assistant('a', 1, 2)]).mean_incremental_growth).toBeNull();
});
