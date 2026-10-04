import { expect, test } from 'vitest';
import { orderTotal, sumCents } from '../orderTotal.js';

test('sumCents: extracción', () => {
  expect(sumCents([10, 20])).toBe(30);
  expect(orderTotal([])).toBe(0);
});

import { receiptAmount } from '../../../ui/src/receiptAmount.js';

test('integración de resumen', () => {
  expect(receiptAmount([10, 20])).toBe(30);
});
