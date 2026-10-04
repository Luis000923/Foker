import { expect, test } from 'vitest';
import { canCancel } from '../canCancel.js';

test('canCancel: contrato de aceptación', () => {
  expect(canCancel('delivered')).toBe(false);
  expect(canCancel('pending')).toBe(true);
});
