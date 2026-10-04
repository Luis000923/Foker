import { expect, test } from 'vitest';
import { shippingCost } from '../policy-8.js';

test('shippingCost: contrato de aceptación', () => {
  expect(shippingCost(5000)).toBe(0);
});
