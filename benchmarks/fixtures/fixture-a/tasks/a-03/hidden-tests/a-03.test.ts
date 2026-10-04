import { expect, test } from 'vitest';
import { discount } from '../policy-3.js';

test('discount: contrato de aceptación', () => {
  expect(discount(999, 15)).toBe(150);
});
