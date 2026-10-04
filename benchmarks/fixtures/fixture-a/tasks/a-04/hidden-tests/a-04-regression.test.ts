import { expect, test } from 'vitest';
import { usersRecord } from '../index.js';

import { normalizeEmail } from '../policy-4.js';

test('users: contrato estable de registros', () => {
  const record = usersRecord('sku-1');
  expect(record.id).toBe('sku-1');
  expect(record.label).toBe('users');
  expect(record.amount).toBeGreaterThanOrEqual(0);
});

test('comportamiento público preservado', () => {
  expect(normalizeEmail('ANA@SHOP.COM')).toBe('ana@shop.com');
});
