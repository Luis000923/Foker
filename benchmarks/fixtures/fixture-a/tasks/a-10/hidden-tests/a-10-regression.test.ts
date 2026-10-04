import { expect, test } from 'vitest';
import { cartWeight } from '../cartWeight.js';
import { cartRecord } from '../index.js';

test('cart: contrato estable de registros', () => {
  const record = cartRecord('sku-1');
  expect(record.id).toBe('sku-1');
  expect(record.label).toBe('cart');
  expect(record.amount).toBeGreaterThanOrEqual(0);
});

test('comportamiento público preservado', () => {
  expect(cartWeight([])).toBe(0);
});
