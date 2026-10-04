import { expect, test } from 'vitest';
import { normalizeEmail } from '../policy-4.js';

test('normalizeEmail: contrato de aceptación', () => {
  expect(normalizeEmail(' USER@SHOP.COM ')).toBe('user@shop.com');
});
