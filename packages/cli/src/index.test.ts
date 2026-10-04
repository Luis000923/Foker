import { describe, expect, it } from 'vitest';
import { PACKAGE_NAME } from './index.js';

describe('foker', () => {
  it('expone su nombre de paquete', () => {
    expect(PACKAGE_NAME).toBe('foker');
  });
});
