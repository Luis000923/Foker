import { createRequire } from 'node:module';
import type { VersionInfo } from '../binding.cjs';
import { FokerError } from './errors.js';

export type { VersionInfo } from '../binding.cjs';
export { FokerError, type FokerErrorCode } from './errors.js';

/** Nombre del paquete npm. */
export const PACKAGE_NAME = '@foker/core';

/** Superficie del addon nativo que usa este paquete. */
export interface NativeBinding {
  versionInfo(): VersionInfo;
}

const require = createRequire(import.meta.url);

/** Versión de este paquete; el addon debe coincidir exactamente (REQ-NAPI-003). */
export const PACKAGE_VERSION: string = (require('../package.json') as { version: string }).version;

/**
 * Comprueba que el addon tenga exactamente la versión del paquete JS (REQ-NAPI-003).
 * @throws {FokerError} `FKR-INT-002` si no coincide.
 */
export function checkBinding<T extends NativeBinding>(binding: T, expectedVersion: string = PACKAGE_VERSION): T {
  let info: VersionInfo;
  try {
    info = binding.versionInfo();
  } catch (error) {
    throw FokerError.fromNative(error);
  }
  if (info.coreVersion !== expectedVersion) {
    throw new FokerError(
      'FKR-INT-002',
      `La versión del addon nativo (${info.coreVersion}) no coincide con la de ${PACKAGE_NAME} (${expectedVersion}). Reinstala Foker.`,
    );
  }
  return binding;
}

/**
 * Carga un addon con `load` y verifica su versión.
 * @throws {FokerError} `FKR-INT-003` si no hay addon para la plataforma; `FKR-INT-002` si la versión no coincide.
 */
export function loadBinding<T extends NativeBinding>(load: () => T, expectedVersion: string = PACKAGE_VERSION): T {
  let binding: T;
  try {
    binding = load();
  } catch (error) {
    throw new FokerError(
      'FKR-INT-003',
      `No hay addon nativo de Foker para ${process.platform}-${process.arch}. Consulta las plataformas soportadas.`,
      { cause: error },
    );
  }
  return checkBinding(binding, expectedVersion);
}

let cached: NativeBinding | undefined;

/** Addon nativo de la plataforma actual, cargado y verificado una sola vez por proceso. */
export function native(): NativeBinding {
  cached ??= loadBinding(() => require('../binding.cjs') as NativeBinding);
  return cached;
}

/** Versiones del núcleo nativo. */
export function versionInfo(): VersionInfo {
  return native().versionInfo();
}
