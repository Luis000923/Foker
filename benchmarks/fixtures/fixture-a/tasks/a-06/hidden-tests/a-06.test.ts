import { expect, test } from 'vitest';
import { formatPrice } from '../formatPrice.js';

test('formatPrice: contrato de aceptación', () => {
  expect(formatPrice(105)).toBe('1.05');
  expect(formatPrice(100)).toBe('1.00');
});
