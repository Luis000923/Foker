/** Verifica gold contra el fixture generado; conserva las creaciones históricas explícitas. */
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCases } from '../dist/ctx-gold.js';
import { generate } from '../fixtures/fixture-a/generate.mjs';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const cases = loadCases(readFileSync(new URL('./cases.jsonl', import.meta.url), 'utf8'));
const creations = new Set([
  'a-15:packages/catalog/src/moneyPolicy.ts',
  'a-16:packages/pricing/src/moneyPolicy.ts',
  'a-17:packages/users/src/accessPolicy.ts',
  'a-18:packages/orders/src/moneyPolicy.ts',
  'a-19:packages/catalog/src/isPositiveQuantity.test.ts',
  'a-20:packages/users/src/isValidEmail.test.ts',
]);
const temp = mkdtempSync(join(tmpdir(), 'foker-gold-paths-'));
try {
  generate(temp);
  let checked = 0;
  const absent = [];
  for (const item of cases) {
    const root = item.fixture === 'fixture-a' ? temp : join(repo, 'fixtures/monorepo-pnpm');
    for (const path of [...item.gold_modified, ...(item.gold_read ?? [])]) {
      let exists = false;
      try {
        exists = statSync(join(root, path)).isFile();
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      if (exists) checked++;
      else if (creations.has(`${item.id}:${path}`)) absent.push(`${item.id}:${path}`);
      else throw new Error(`Ruta gold ausente: ${item.id}:${path}`);
    }
  }
  console.log(
    `${cases.length} casos; ${checked} rutas gold existentes; ${absent.length} creaciones históricas ausentes.`,
  );
  console.log(absent.join('\n'));
} finally {
  rmSync(temp, { recursive: true, force: true });
}
