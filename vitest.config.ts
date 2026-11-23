import { fileURLToPath } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';

const packagesDir = fileURLToPath(new URL('./packages/', import.meta.url));

export default defineConfig({
  resolve: {
    // Los tests consumen el código fuente de los paquetes del workspace, sin compilar.
    alias: [{ find: /^@foker\/([a-z-]+)$/, replacement: `${packagesDir}$1/src/index.ts` }],
  },
  test: {
    include: ['packages/*/src/**/*.test.ts', 'packages/*/test/**/*.test.ts'],
    exclude: [...configDefaults.exclude],
    environment: 'node',
    // Tests de integración (git, addon nativo, servidor MCP por stdio) necesitan más que el default de 5 s.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
