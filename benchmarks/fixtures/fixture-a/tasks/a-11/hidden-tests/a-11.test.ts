import { expect, test } from 'vitest';
import { taxAmount } from '../taxAmount.js';

test('taxAmount: contrato de aceptación', () => {
  expect(taxAmount(999, 12)).toBe(120);
});

import { checkoutTax } from '../../../orders/src/checkoutTax.js';

test('integración de resumen', () => {
  expect(checkoutTax(999, 15)).toBe(150);
});
