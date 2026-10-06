import { expect, it } from 'vitest';
import { buildCsp } from './csp';

const productionCsp = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'";

it.each(['development', 'production', 'test'] as const)('construye la CSP para %s', (nodeEnv) => {
  expect(buildCsp(nodeEnv)).toBe(nodeEnv === 'development'
    ? productionCsp.replace("script-src 'self' 'unsafe-inline'", "script-src 'self' 'unsafe-inline' 'unsafe-eval'")
    : productionCsp);
  expect(buildCsp(nodeEnv).includes("'unsafe-eval'")).toBe(nodeEnv === 'development');
});
