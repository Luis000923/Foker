import { expect, test } from 'vitest';
import { inStock } from '../policy-1.js';

test('inStock: contrato de aceptación', () => {
  expect(inStock(0)).toBe(false);
  expect(inStock(1)).toBe(true);
});
