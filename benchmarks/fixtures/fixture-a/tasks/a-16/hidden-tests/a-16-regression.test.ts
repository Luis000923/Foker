import { expect, test } from 'vitest';
import { pricingRecord } from '../index.js';

import { netPrice } from '../netPrice.js';

test('pricing: contrato estable de registros', () => {
  const record = pricingRecord('sku-1');
  expect(record.id).toBe('sku-1');
  expect(record.label).toBe('pricing');
  expect(record.amount).toBeGreaterThanOrEqual(0);
});

test('comportamiento público preservado', () => {
  expect(netPrice(40, 10)).toBe(30);
});
