import { expect, test } from 'vitest';
import { skuMatches } from '../skuMatches.js';

test('skuMatches: contrato de aceptación', () => {
  expect(skuMatches('BOOK-42', ' book ')).toBe(true);
  expect(skuMatches('BOOK', 'shoe')).toBe(false);
});

import { referenceSearch } from '../../../ui/src/referenceSearch.js';

test('integración de resumen', () => {
  expect(referenceSearch('ABC', ' b ')).toBe(true);
});
