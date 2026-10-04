import { expect, test } from 'vitest';
import { usersRecord } from '../index.js';

import { isAdmin } from '../isAdmin.js';

test('users: contrato estable de registros', () => {
  const record = usersRecord('sku-1');
  expect(record.id).toBe('sku-1');
  expect(record.label).toBe('users');
  expect(record.amount).toBeGreaterThanOrEqual(0);
});

test('comportamiento público preservado', () => {
  expect(isAdmin(['buyer'])).toBe(false);
});
