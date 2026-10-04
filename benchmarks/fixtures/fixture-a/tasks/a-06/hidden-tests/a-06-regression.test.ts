import { expect, test } from 'vitest';
import { formatPrice } from '../formatPrice.js';
import { uiRecord } from '../index.js';

test('ui: contrato estable de registros', () => {
  const record = uiRecord('sku-1');
  expect(record.id).toBe('sku-1');
  expect(record.label).toBe('ui');
  expect(record.amount).toBeGreaterThanOrEqual(0);
});

test('comportamiento público preservado', () => {
  expect(formatPrice(105)).toBe('1.05');
});
