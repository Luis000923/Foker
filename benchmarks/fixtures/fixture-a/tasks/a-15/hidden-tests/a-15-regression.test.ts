import { expect, test } from 'vitest';
import { catalogRecord } from '../index.js';

import { stockValue } from '../stockValue.js';

test('catalog: contrato estable de registros', () => {
  const record = catalogRecord('sku-1');
  expect(record.id).toBe('sku-1');
  expect(record.label).toBe('catalog');
  expect(record.amount).toBeGreaterThanOrEqual(0);
});

test('comportamiento público preservado', () => {
  expect(stockValue(20, 3)).toBe(60);
});
