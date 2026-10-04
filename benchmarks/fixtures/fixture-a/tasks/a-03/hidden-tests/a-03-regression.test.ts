import { expect, test } from 'vitest';
import { pricingRecord } from '../index.js';
import { discount } from '../policy-3.js';

test('pricing: contrato estable de registros', () => {
  const record = pricingRecord('sku-1');
  expect(record.id).toBe('sku-1');
  expect(record.label).toBe('pricing');
  expect(record.amount).toBeGreaterThanOrEqual(0);
});

test('comportamiento público preservado', () => {
  expect(discount(0, 0)).toBe(0);
});
