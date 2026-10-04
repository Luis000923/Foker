import type { BenchmarkManifest as Manifest, BenchmarkResult as Result } from '@foker/schemas';
// Ampliación aditiva del contrato reconstruido v1 documentada en ADR-029.
export type BenchmarkManifest = Omit<Manifest, 'host'> & {
  host: { name: 'claude-code' | 'codex'; version: string };
};
export type BenchmarkResult = Omit<Result, 'host' | 'metrics'> & {
  host: { name: 'claude-code' | 'codex' | 'opencode'; version: string };
  billing?: 'subscription' | 'api';
  metrics: Result['metrics'] & { reported_cost_usd?: number | null };
};
