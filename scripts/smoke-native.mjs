// Smoke test del addon nativo empaquetado (FKR-006, FOKER-SPEC §21.2).
//
// Uso: node scripts/smoke-native.mjs <target-rust> [directorio-con-.node]
//
// 1. Crea los paquetes npm por plataforma de @foker/core (`napi create-npm-dirs`).
// 2. Copia el binario del target a su paquete de plataforma.
// 3. Empaqueta @foker/core y el paquete de plataforma con `npm pack`.
// 4. Instala ambos tarballs en un directorio limpio y ejecuta `versionInfo()` desde `@foker/core`.
//
// Requiere `pnpm build` previo (dist/ de @foker/core). Sale con código 1 si algo falla.

import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { corePkgDir, PLATFORMS, pack, prepareNative, run } from './native-pack.mjs';

export { PLATFORMS } from './native-pack.mjs';

/** @param {string} target @param {string} binariesDir */
function smoke(target, binariesDir) {
  const platform = PLATFORMS[/** @type {keyof typeof PLATFORMS} */ (target)];
  if (!platform) throw new Error(`target desconocido: ${target}. Válidos: ${Object.keys(PLATFORMS).join(', ')}`);

  if (!existsSync(join(corePkgDir, 'dist', 'index.js')))
    throw new Error('falta packages/core/dist: ejecuta pnpm build');
  const platformDir = prepareNative(corePkgDir, platform, binariesDir);

  const work = mkdtempSync(join(tmpdir(), 'foker-smoke-'));
  try {
    const coreTgz = pack(corePkgDir, work);
    const platformTgz = pack(platformDir, work);

    const app = join(work, 'app');
    mkdirSync(app);
    writeFileSync(join(app, 'package.json'), JSON.stringify({ name: 'foker-smoke', private: true, type: 'module' }));
    run(
      'npm',
      ['install', '--no-audit', '--no-fund', '--ignore-scripts', join(work, coreTgz), join(work, platformTgz)],
      app,
    );

    const check = [
      "import { PACKAGE_VERSION, versionInfo } from '@foker/core';",
      'const info = versionInfo();',
      "if (info.coreVersion !== PACKAGE_VERSION) throw new Error('versión distinta: ' + info.coreVersion);",
      'console.log(JSON.stringify(info));',
    ].join('\n');
    writeFileSync(join(app, 'check.mjs'), check);
    const output = run('node', ['check.mjs'], app).trim();
    console.log(`smoke ${target} (${process.platform}-${process.arch}): ${output}`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [target, dir] = process.argv.slice(2);
  if (!target) {
    console.error('uso: node scripts/smoke-native.mjs <target-rust> [directorio-con-.node]');
    process.exit(2);
  }
  try {
    smoke(target, resolve(dir ?? corePkgDir));
  } catch (error) {
    console.error(`smoke fallido: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
