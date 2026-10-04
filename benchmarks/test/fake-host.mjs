// Simulated claude -p: never calls a provider or installs dependencies.
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const [mode, patch, outputFile] = process.argv.slice(2);
if (mode !== 'broken') {
  const applied = spawnSync('git', ['apply', patch], { cwd: process.cwd(), encoding: 'utf8' });
  if (applied.status !== 0) throw new Error(applied.stderr);
}
const output = JSON.stringify({
  usage: { input_tokens: 1000, cache_read_input_tokens: 2000, cache_creation_input_tokens: 500, output_tokens: 100 },
  total_cost_usd: 9,
  num_turns: 2,
  duration_ms: 50,
  transcript: [{ type: 'tool_use', name: 'Read', input: { file_path: '/work/packages/catalog/src/policy-1.ts' } }],
  tool_traces: [],
});
if (outputFile) writeFileSync(outputFile, output);
console.log(output);
if (mode === 'timeout') setTimeout(() => {}, 60_000);
