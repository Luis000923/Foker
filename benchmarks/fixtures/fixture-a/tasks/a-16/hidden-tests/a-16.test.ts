import { expect, test } from 'vitest';
import { clampCents, netPrice } from '../netPrice.js';

test('clampCents: extracción', () => {
  expect(clampCents(-1)).toBe(0);
  expect(netPrice(50, 60)).toBe(0);
});

import { payableAmount } from '../../../orders/src/payableAmount.js';

test('integración de resumen', () => {
  expect(payableAmount(-5)).toBe(0);
});
