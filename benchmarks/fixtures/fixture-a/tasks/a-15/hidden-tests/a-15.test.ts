import { expect, test } from 'vitest';
import { multiplyCents, stockValue } from '../stockValue.js';

test('multiplyCents: extracción', () => {
  expect(multiplyCents(20, 3)).toBe(60);
  expect(stockValue(20, 3)).toBe(60);
});

import { inventoryAmount } from '../../../cart/src/inventoryAmount.js';

test('integración de resumen', () => {
  expect(inventoryAmount(20, 3)).toBe(60);
});
