import { expect, it } from 'vitest';
import { assertSameOrigin } from './same-origin';

it('acepta el origen exacto', () => {
  expect(() => assertSameOrigin(new Request('https://example.test/api', { headers: { origin: 'https://example.test' } }))).not.toThrow();
});
it.each([null, 'null', 'https://evil.test', 'http://example.test', 'https://example.test:444', 'https://example.test.evil.test', 'https://example.test/path'])('rechaza %s', (origin) => {
  const headers = new Headers();
  if (origin !== null) headers.set('origin', origin);
  expect(() => assertSameOrigin(new Request('https://example.test/api', { headers }))).toThrow('Origen no permitido');
});
