import { createRequire } from 'node:module';
import type { VersionInfo } from '../binding.cjs';
import { Engine, type EngineConfig, type NativeEngineClass } from './engine.js';
import { FokerError } from './errors.js';

export type { VersionInfo } from '../binding.cjs';
export * from './engine.js';
export { FokerError, type FokerErrorCode } from './errors.js';

/** Nombre del paquete npm. */
export const PACKAGE_NAME = '@foker/core';

/** Superficie del addon nativo que usa este paquete. */
export interface NativeBinding {
  hashBytes?(bytes: Buffer): string;
  hashCanonicalJson?(json: string): string;
  versionInfo(): VersionInfo;
  normalizePath(root: string, input: string): string;
  matchGlobs(id: string, globs: string[]): boolean;
  FokerEngine: NativeEngineClass;
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

/**
 * Normaliza una ruta de entrada a id de archivo (REQ-XPLAT-001…003).
 * @throws {FokerError} `FKR-POL-001` si es inválida, sale del root o atraviesa un symlink externo.
 */
export function normalizePath(root: string, input: string): string {
  const binding = native();
  try {
    return binding.normalizePath(root, input);
  } catch (error) {
    throw FokerError.fromNative(error);
  }
}

/**
 * `true` si algún glob casa con el id, con la misma semántica que el Project Map: `*` no cruza `/`,
 * `**` sí, y un glob sin `/` casa con el nombre del archivo a cualquier profundidad.
 * @throws {FokerError} `FKR-INP-001` si un glob es inválido.
 */
export function matchGlobs(id: string, globs: string[]): boolean {
  const binding = native();
  try {
    return binding.matchGlobs(id, globs);
  } catch (error) {
    throw FokerError.fromNative(error);
  }
}

/** Abre el motor del Project Map para un root absoluto con el addon de la plataforma. */
export function openEngine(root: string, config?: EngineConfig): Promise<Engine> {
  return Engine.open(native().FokerEngine, root, config);
}

/** BLAKE3 del JSON canónico del núcleo. */
export function hashCanonicalJson(json: string): string {
  try {
    const hash = native().hashCanonicalJson;
    if (!hash) throw new FokerError('FKR-INT-002', 'El addon no expone hashCanonicalJson');
    return hash(json);
  } catch (error) {
    throw FokerError.fromNative(error);
  }
}

/** BLAKE3 de bytes usando el núcleo nativo. */
export function hashBytes(bytes: Buffer): string {
  try {
    const hash = native().hashBytes;
    if (!hash) throw new FokerError('FKR-INT-002', 'El addon no expone hashBytes');
    return hash(bytes);
  } catch (error) {
    throw FokerError.fromNative(error);
  }
}
