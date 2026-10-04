import next from '@next/eslint-plugin-next';
import base from './index.mjs';

/** Configuración para apps Next.js: la base más las reglas de @next/next. */
export default [
  ...base,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { '@next/next': next },
    rules: { ...next.configs.recommended.rules },
  },
];
