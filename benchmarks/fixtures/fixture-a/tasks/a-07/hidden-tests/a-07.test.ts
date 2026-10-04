import { expect, test } from 'vitest';
import { remainingQuantity } from '../policy-7.js';

test('remainingQuantity: contrato de aceptación', () => {
  expect(remainingQuantity(2, 5)).toBe(0);
});
