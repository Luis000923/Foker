import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import hooks from 'eslint-plugin-react-hooks';

export default [
  { ignores: ['.next/**', 'dist/**', 'next-env.d.ts', 'coverage/**', 'playwright-report/**', 'test-results/**'] },
  ...tseslint.configs.strict,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { react, 'react-hooks': hooks },
    settings: { react: { version: '19.3.0' } },
    rules: {
      ...hooks.configs.recommended.rules,
      'react/no-danger': 'error',
    },
  },
  {
    // También cubre código CommonJS y require().
    files: ['**/*.{js,mjs,cjs,ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { paths: ['child_process', 'node:child_process'] }],
      'no-restricted-modules': ['error', 'child_process', 'node:child_process'],
    },
  },
];
