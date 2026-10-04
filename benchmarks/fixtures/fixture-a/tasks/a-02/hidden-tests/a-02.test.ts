import { expect, test } from 'vitest';
import { lineTotal } from '../lineTotal.js';

test('lineTotal: contrato de aceptación', () => {
  expect(lineTotal(125, 3)).toBe(375);
});
