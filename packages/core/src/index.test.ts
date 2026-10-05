import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  checkBinding,
  FokerError,
  loadBinding,
  matchGlobs,
  native,
  normalizePath,
  PACKAGE_NAME,
  PACKAGE_VERSION,
  versionInfo,
} from './index.js';

const fakeInfo = (coreVersion: string) => ({ coreVersion, nativeApi: 1, mapSchema: 1, contextSchema: 1, grammars: {} });
const fake = (coreVersion: string) => ({
  versionInfo: () => fakeInfo(coreVersion),
  normalizePath: (_r: string, i: string) => i,
  matchGlobs: () => false,
  FokerEngine: { open: () => Promise.reject(new Error('fake')) },
});

describe(PACKAGE_NAME, () => {
  it('carga el addon real con la versión exacta del paquete (REQ-NAPI-003)', () => {
    const info = versionInfo();
    expect(info.coreVersion).toBe(PACKAGE_VERSION);
    expect(info.nativeApi).toBe(1);
    expect(info.mapSchema).toBe(1);
    expect(info.contextSchema).toBe(2);
    expect(native()).toBe(native());
  });

  it('rechaza un addon con otra versión con FKR-INT-002', () => {
    expect(() => checkBinding(fake('9.9.9'), '0.0.0')).toThrowError(
      expect.objectContaining({ name: 'FokerError', code: 'FKR-INT-002', recoverable: false }),
    );
  });

  it('acepta un addon con la misma versión', () => {
    const binding = fake('1.2.3');
    expect(loadBinding(() => binding, '1.2.3')).toBe(binding);
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
      normalizePath: (_r: string, i: string) => i,
      matchGlobs: () => false,
      FokerEngine: { open: () => Promise.reject(new Error('fake')) },
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

describe('normalizePath (REQ-XPLAT-001…003)', () => {
  const corpus = JSON.parse(
    readFileSync(new URL('../../../tests/security/paths/corpus.json', import.meta.url), 'utf8'),
  ) as { cases: { input: string; unix: string; windows: string }[] };
  const root = mkdtempSync(join(tmpdir(), 'foker-paths-'));
  const platformKey = process.platform === 'win32' ? 'windows' : 'unix';

  it.each(corpus.cases.map((c) => [c.input, c[platformKey]] as const))('%j → %j', (input, expected) => {
    if (expected === 'FKR-POL-001') {
      expect(() => normalizePath(root, input)).toThrowError(expect.objectContaining({ code: 'FKR-POL-001' }));
    } else {
      expect(normalizePath(root, input)).toBe(expected);
    }
  });

  it.runIf(process.platform !== 'win32')('rechaza symlinks que salen del root', () => {
    const outside = mkdtempSync(join(tmpdir(), 'foker-out-'));
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src', 'a.ts'), '');
    symlinkSync(outside, join(root, 'out'));
    try {
      expect(() => normalizePath(root, 'out/x')).toThrowError(expect.objectContaining({ code: 'FKR-POL-001' }));
      expect(normalizePath(root, 'src/a.ts')).toBe('src/a.ts');
    } finally {
      rmSync(outside, { recursive: true, force: true });
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('matchGlobs', () => {
  it('usa la semántica del motor', () => {
    expect(matchGlobs('apps/web/.env', ['.env'])).toBe(true);
    expect(matchGlobs('src/lib/a.ts', ['src/*.ts'])).toBe(false);
    expect(matchGlobs('src/lib/a.ts', ['src/**/*.ts'])).toBe(true);
    expect(matchGlobs('a.ts', [])).toBe(false);
  });

  it('lanza FKR-INP-001 con globs inválidos', () => {
    expect(() => matchGlobs('a', ['a['])).toThrowError(expect.objectContaining({ code: 'FKR-INP-001' }));
  });
});
