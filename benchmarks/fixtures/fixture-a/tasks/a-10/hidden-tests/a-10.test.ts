import { expect, test } from 'vitest';
import { cartWeight } from '../cartWeight.js';

test('cartWeight: contrato de aceptación', () => {
  expect(cartWeight([2, 3, 4])).toBe(9);
  expect(cartWeight([])).toBe(0);
});

import { parcelWeight } from '../../../orders/src/parcelWeight.js';

test('integración de resumen', () => {
  expect(parcelWeight([10, 20])).toBe(30);
});
