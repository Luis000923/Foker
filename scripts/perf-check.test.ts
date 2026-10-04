import { describe, expect, it } from 'vitest';
import { compare, readMetrics } from './perf-check.mjs';

describe('perf-check', () => {
  it('lee las líneas JSON de la salida de nextest', () => {
    const text =
      'PASS foo\n{"full_build_ms":416,"unchanged_check_ms":24}\nbuildContext\n  {"build_context_p95_ms":221.5}\n';
    expect(readMetrics(text)).toEqual({ full_build_ms: 416, unchanged_check_ms: 24, build_context_p95_ms: 221.5 });
  });

  it('marca como regresión lo que supera 1,2 × la referencia', () => {
    expect(compare({ unchanged_check_ms: 119 })).toEqual([]);
    expect(compare({ unchanged_check_ms: 121 })).toEqual([{ metric: 'unchanged_check_ms', value: 121, limit: 120 }]);
  });
});
