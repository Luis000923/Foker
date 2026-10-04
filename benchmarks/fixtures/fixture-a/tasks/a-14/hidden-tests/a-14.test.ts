import { expect, test } from 'vitest';
import { itemLabel } from '../itemLabel.js';

test('itemLabel: contrato de aceptación', () => {
  expect(itemLabel(1)).toBe('1 artículo');
  expect(itemLabel(2)).toBe('2 artículos');
});

import { basketCaption } from '../../../ui/src/basketCaption.js';

test('integración de resumen', () => {
  expect(basketCaption(2)).toBe('2 artículos');
});
