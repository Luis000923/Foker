import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const FIXTURE_SEED = 42;
const packages = ['catalog', 'cart', 'pricing', 'users', 'orders', 'ui'];
/** @param {number} seed */
export function fixtureFiles(seed = FIXTURE_SEED) {
  let state = BigInt(seed);
  const next = () => {
    state = BigInt.asUintN(64, state * 6364136223846793005n + 1442695040888963407n);
    return Number(state >> 33n);
  };
  /** @type {Record<string, string>} */
  const files = {};
  /** @param {string} path @param {unknown} value */
  const json = (path, value) => {
    files[path] = `${JSON.stringify(value, null, 2)}\n`;
  };
  files['pnpm-workspace.yaml'] = 'packages:\n  - packages/*\n';
  json('package.json', {
    name: 'fixture-a',
    private: true,
    type: 'module',
    scripts: { typecheck: 'tsc --noEmit', lint: 'node scripts/lint.mjs', test: 'vitest run' },
    devDependencies: { typescript: '5.9.3', vitest: '5.0.3' },
  });
  json('tsconfig.json', {
    compilerOptions: {
      target: 'ES2023',
      module: 'ESNext',
      moduleResolution: 'Bundler',
      strict: true,
      noEmit: true,
      paths: Object.fromEntries(packages.map((p) => [`@shop/${p}`, [`./packages/${p}/src/index.ts`]])),
    },
    include: ['packages/**/*.ts'],
    exclude: ['packages/**/*.test.ts'],
  });
  files['vitest.config.ts'] =
    `import { fileURLToPath } from 'node:url';\nimport { defineConfig } from 'vitest/config';\nexport default defineConfig({ resolve: { alias: ${JSON.stringify(Object.fromEntries(packages.map((p) => [`@shop/${p}`, `./packages/${p}/src/index.ts`])))} }, test: { include: ['packages/**/*.test.ts'] } });\n`.replace(
      /"\.\/packages\/([^" ]+)"/g,
      "fileURLToPath(new URL('./packages/$1', import.meta.url))",
    );
  // Lint local reproducible: rejects tabs/trailing whitespace and validates every .mjs syntax.
  files['scripts/lint.mjs'] =
    `import { readdirSync, readFileSync } from 'node:fs';\nimport { join } from 'node:path';\nfunction scan(dir) { for (const entry of readdirSync(dir, { withFileTypes: true })) { const path = join(dir, entry.name); if (entry.isDirectory()) { if (!['node_modules', '.git'].includes(entry.name)) scan(path); } else if (/\\.(ts|mjs)$/.test(entry.name) && /\\t| +$/m.test(readFileSync(path, 'utf8'))) throw new Error('Whitespace: ' + path); } }\nscan(new URL('../packages', import.meta.url).pathname);\n`;
  files['.github/workflows/ci.yaml'] =
    'name: fixture-ci\non: [push]\njobs:\n  checks:\n    runs-on: ubuntu-latest\n    steps:\n      - run: pnpm typecheck\n      - run: pnpm lint\n      - run: pnpm test\n';
  files['README.md'] =
    '# Tienda Fixture A\n\nImportes en centavos; cantidades enteras. Catálogo, carrito, precios, usuarios, pedidos y UI.\n';
  const dependencies = {
    catalog: [],
    cart: ['catalog'],
    pricing: ['cart'],
    users: [],
    orders: ['users', 'pricing'],
    ui: ['orders', 'catalog'],
  };
  for (const pkg of packages) {
    const deps = dependencies[/** @type {keyof typeof dependencies} */ (pkg)];
    json(`packages/${pkg}/package.json`, {
      name: `@shop/${pkg}`,
      version: '1.0.0',
      private: true,
      type: 'module',
      exports: './src/index.ts',
      scripts: {
        typecheck: 'tsc --noEmit -p ../../tsconfig.json',
        lint: 'node ../../scripts/lint.mjs',
        test: 'vitest run',
      },
      dependencies: Object.fromEntries(deps.map((d) => [`@shop/${d}`, 'workspace:*'])),
    });
    files[`packages/${pkg}/src/index.ts`] =
      `${deps.map((d) => `import { ${d}Record } from '@shop/${d}';`).join('\n')}\nexport interface ${pkg}Entity { id: string; label: string; amount: number; }\nexport function ${pkg}Record(id: string): ${pkg}Entity { return { id, label: '${pkg}', amount: ${next() % 1000} }; }\nexport const related = [${deps.map((d) => `${d}Record('${pkg}')`).join(', ')}];\n`;
    files[`packages/${pkg}/src/baseline.test.ts`] =
      `import { expect, test } from 'vitest';\nimport { ${pkg}Record } from './index.js';\ntest('${pkg}: identidad estable', () => { expect(${pkg}Record('id').id).toBe('id'); });\n`;
    // 22 domain records + their tests per package, with references to the public domain model.
    for (let i = 0; i < 22; i++) {
      const name = `${pkg}Entry${i}`;
      files[`packages/${pkg}/src/record-${i}.ts`] =
        `import { ${pkg}Record, type ${pkg}Entity } from './index.js';\n/** Registro ${i} de ${pkg}, valor reproducible por semilla. */\nexport function ${name}(id: string): ${pkg}Entity { const record = ${pkg}Record(id); return { ...record, amount: record.amount + ${next() % 100} }; }\n`;
      files[`packages/${pkg}/src/record-${i}.test.ts`] =
        `import { expect, test } from 'vitest';\nimport { ${name} } from './record-${i}.js';\ntest('${name}: identidad', () => { expect(${name}('sku').id).toBe('sku'); });\n`;
    }
  }
  /** @type {{before: Record<string, string>}[]} */
  const sources = JSON.parse(readFileSync(new URL('./task-definitions.json', import.meta.url), 'utf8'));
  for (const source of sources) Object.assign(files, source.before);
  return files;
}
/** El destino debe estar vacío: nunca borra un proyecto existente. @param {string} destination @param {number} seed */
export function generate(destination, seed = FIXTURE_SEED) {
  if (existsSync(destination) && readdirSync(destination).length) throw new Error('El destino debe estar vacío');
  const files = fixtureFiles(seed);
  for (const [path, content] of Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) {
    mkdirSync(dirname(join(destination, path)), { recursive: true });
    writeFileSync(join(destination, path), content);
  }
  return Object.keys(files).length;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const destination = process.argv[2];
  if (!destination) throw new Error('Uso: generate.mjs <destino vacío> [semilla]');
  console.log(`${generate(resolve(destination), Number(process.argv[3] ?? FIXTURE_SEED))} archivos generados`);
}
