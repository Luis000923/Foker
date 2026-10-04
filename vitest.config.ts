import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const packagesDir = fileURLToPath(new URL('./packages/', import.meta.url));

export default defineConfig({
  resolve: {
    // Los tests consumen el código fuente de los paquetes del workspace, sin compilar.
    alias: [{ find: /^@foker\/([a-z-]+)$/, replacement: `${packagesDir}$1/src/index.ts` }],
  },
  test: {
    include: ['packages/*/src/**/*.test.ts', 'packages/*/test/**/*.test.ts'],
    environment: 'node',
  },
});
