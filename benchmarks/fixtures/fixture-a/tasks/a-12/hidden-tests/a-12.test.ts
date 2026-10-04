import { expect, test } from 'vitest';
import { displayName } from '../displayName.js';

test('displayName: contrato de aceptación', () => {
  expect(displayName(' Ana ', ' ')).toBe('Ana');
  expect(displayName('Ana', 'Sol')).toBe('Ana Sol');
});

import { customerLabel } from '../../../orders/src/customerLabel.js';

test('integración de resumen', () => {
  expect(customerLabel(' Ana ', ' Ruiz ')).toBe('Ana Ruiz');
});
