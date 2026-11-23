import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BUILD_PLATFORMS,
  nativeOptionalDependencies,
  PLATFORMS,
  UNPUBLISHED_PLATFORMS,
  writeNativePackage,
} from '../../../scripts/native-pack.mjs';

describe('plataformas nativas (ADR-014)', () => {
  it('Windows x64 y ARM64 se compilan en CI', () => {
    expect(BUILD_PLATFORMS['x86_64-pc-windows-msvc']).toBe('win32-x64-msvc');
    expect(BUILD_PLATFORMS['aarch64-pc-windows-msvc']).toBe('win32-arm64-msvc');
  });

  it('ARM64 de Windows no se publica: queda fuera de PLATFORMS y de las optionalDependencies', () => {
    expect(Object.keys(UNPUBLISHED_PLATFORMS)).toEqual(['aarch64-pc-windows-msvc']);
    expect(Object.values(PLATFORMS)).not.toContain('win32-arm64-msvc');
    expect(nativeOptionalDependencies('1.2.3')).not.toHaveProperty(['@foker/core-win32-arm64-msvc']);
    expect(Object.keys(nativeOptionalDependencies('1.2.3'))).toHaveLength(5);
  });

  it('las plataformas publicadas siguen siendo exactamente las 5 de la beta', () => {
    expect(Object.values(PLATFORMS).sort()).toEqual([
      'darwin-arm64',
      'darwin-x64',
      'linux-arm64-gnu',
      'linux-x64-gnu',
      'win32-x64-msvc',
    ]);
  });

  it('el paquete de plataforma ARM64 declara os=win32 y cpu=arm64 (para el smoke)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'foker-platform-'));
    try {
      writeNativePackage(
        dir,
        { version: '0.1.0-beta.0', license: 'Apache-2.0' },
        'win32-arm64-msvc',
        'foker-core.win32-arm64-msvc.node',
      );
      const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
      expect(pkg).toMatchObject({ name: '@foker/core-win32-arm64-msvc', os: ['win32'], cpu: ['arm64'] });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
