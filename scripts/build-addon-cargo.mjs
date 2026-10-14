// Compila el addon con cargo y lo copia como `<binaryName>.<plataforma>.node`, sin pasar por `napi build`.
//
// Uso: node scripts/build-addon-cargo.mjs <target-rust> <directorio-de-salida>
//
// Existe porque `napi build` (@napi-rs/cli 3.10.x) agota el bloqueo de reconciliación del sistema de
// archivos en los runners de Windows. No genera binding.cjs ni binding.d.cts: están versionados.

import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { corePkgDir, PLATFORMS, root } from './native-pack.mjs';

/** Nombre del artefacto cdylib de `foker-napi` según el sistema del target. */
const LIBRARIES = { windows: 'foker_napi.dll', darwin: 'libfoker_napi.dylib', linux: 'libfoker_napi.so' };

/** @param {string} target @param {string} outDir */
export function buildAddon(target, outDir) {
  const platform = PLATFORMS[/** @type {keyof typeof PLATFORMS} */ (target)];
  if (!platform) throw new Error(`target desconocido: ${target}. Válidos: ${Object.keys(PLATFORMS).join(', ')}`);
  const library =
    LIBRARIES[
      /** @type {keyof typeof LIBRARIES} */ (
        target.includes('windows') ? 'windows' : target.includes('darwin') ? 'darwin' : 'linux'
      )
    ];
  const { napi } = JSON.parse(readFileSync(join(corePkgDir, 'package.json'), 'utf8'));
  execFileSync('cargo', ['build', '--release', '--locked', '-p', 'foker-napi', '--target', target], {
    cwd: root,
    stdio: 'inherit',
  });
  const targetDir = resolve(root, process.env['CARGO_TARGET_DIR'] ?? 'target');
  const output = resolve(root, outDir);
  mkdirSync(output, { recursive: true });
  const destination = join(output, `${napi.binaryName}.${platform}.node`);
  copyFileSync(join(targetDir, target, 'release', library), destination);
  return destination;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [target, outDir] = process.argv.slice(2);
  if (!target || !outDir) {
    console.error('uso: node scripts/build-addon-cargo.mjs <target-rust> <directorio-de-salida>');
    process.exit(2);
  }
  try {
    console.log(buildAddon(target, outDir));
  } catch (error) {
    console.error(`compilación fallida: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
