import { expect, test } from 'vitest';
import { trackingUrl } from '../trackingUrl.js';

test('trackingUrl: contrato de aceptación', () => {
  expect(trackingUrl('a/b')).toBe('https://shop.example/track/a%2Fb');
});

import { deliveryLink } from '../../../ui/src/deliveryLink.js';

test('integración de resumen', () => {
  expect(deliveryLink('a/b')).toBe('https://shop.example/track/a%2Fb');
});
