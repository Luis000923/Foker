import { expect, test } from 'vitest';
import { isPositiveQuantity } from '../isPositiveQuantity.js';

test('contrato de validación', () => {
  expect(isPositiveQuantity(0)).toBe(false);
});
