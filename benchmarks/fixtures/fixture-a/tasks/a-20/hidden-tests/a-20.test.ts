import { expect, test } from 'vitest';
import { isValidEmail } from '../isValidEmail.js';

test('contrato de validación', () => {
  expect(isValidEmail('a b@c.com')).toBe(false);
});
