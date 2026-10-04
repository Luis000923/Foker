import { describe, expect, it } from 'vitest';
import { checkBinding, FokerError, loadBinding, native, PACKAGE_NAME, PACKAGE_VERSION, versionInfo } from './index.js';

const fakeInfo = (coreVersion: string) => ({ coreVersion, nativeApi: 1, mapSchema: 1, contextSchema: 1, grammars: {} });

describe(PACKAGE_NAME, () => {
  it('carga el addon real con la versión exacta del paquete (REQ-NAPI-003)', () => {
    const info = versionInfo();
    expect(info.coreVersion).toBe(PACKAGE_VERSION);
    expect(info.nativeApi).toBe(1);
    expect(info.mapSchema).toBe(1);
    expect(info.contextSchema).toBe(1);
    expect(native()).toBe(native());
  });

  it('rechaza un addon con otra versión con FKR-INT-002', () => {
    const fake = { versionInfo: () => fakeInfo('9.9.9') };
    expect(() => checkBinding(fake, '0.0.0')).toThrowError(
      expect.objectContaining({ name: 'FokerError', code: 'FKR-INT-002', recoverable: false }),
    );
  });

  it('acepta un addon con la misma versión', () => {
    const fake = { versionInfo: () => fakeInfo('1.2.3') };
    expect(loadBinding(() => fake, '1.2.3')).toBe(fake);
  });

  it('informa FKR-INT-003 si no hay addon para la plataforma', () => {
    let error: unknown;
    try {
      loadBinding(() => {
        throw new Error('Cannot find native binding');
      });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(FokerError);
    expect(error).toMatchObject({ code: 'FKR-INT-003' });
    expect((error as Error).cause).toBeInstanceOf(Error);
  });

  it('propaga el código de un error nativo', () => {
    const failing = {
      versionInfo: () => {
        throw Object.assign(new Error('pánico'), { code: 'FKR-INT-001' });
      },
    };
    expect(() => checkBinding(failing)).toThrowError(expect.objectContaining({ code: 'FKR-INT-001' }));
  });
});

describe('FokerError.fromNative', () => {
  it('trata códigos desconocidos como FKR-INT-001', () => {
    expect(FokerError.fromNative(Object.assign(new Error('x'), { code: 'EACCES' })).code).toBe('FKR-INT-001');
    expect(FokerError.fromNative('texto').message).toBe('texto');
  });

  it('marca la recuperabilidad según FOKER-SPEC §18', () => {
    expect(new FokerError('FKR-POL-001', 'x').recoverable).toBe(true);
    expect(new FokerError('FKR-CFG-002', 'x').recoverable).toBe(false);
  });
});
