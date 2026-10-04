import { expect, test } from 'vitest';
import { hasRole, isAdmin } from '../isAdmin.js';

test('hasRole: extracción', () => {
  expect(hasRole(['buyer'], 'buyer')).toBe(true);
  expect(isAdmin(['admin'])).toBe(true);
});

import { staffAccess } from '../../../orders/src/staffAccess.js';

test('integración de resumen', () => {
  expect(staffAccess(['admin'])).toBe(true);
});
