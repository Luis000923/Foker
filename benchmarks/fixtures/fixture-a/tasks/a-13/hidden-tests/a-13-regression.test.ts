import { expect, test } from 'vitest';
import { ordersRecord } from '../index.js';

test('orders: contrato estable de registros', () => {
  const record = ordersRecord('sku-1');
  expect(record.id).toBe('sku-1');
  expect(record.label).toBe('orders');
  expect(record.amount).toBeGreaterThanOrEqual(0);
});
