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

import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Target Rust → sufijo de plataforma de napi-rs (`<binaryName>.<sufijo>.node`). */
export const PLATFORMS = {
  'x86_64-unknown-linux-gnu': 'linux-x64-gnu',
  'aarch64-unknown-linux-gnu': 'linux-arm64-gnu',
  'x86_64-apple-darwin': 'darwin-x64',
  'aarch64-apple-darwin': 'darwin-arm64',
  'x86_64-pc-windows-msvc': 'win32-x64-msvc',
  'aarch64-pc-windows-msvc': 'win32-arm64-msvc',
};

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const corePkgDir = join(root, 'packages', 'core');
const isWindows = process.platform === 'win32';

/**
 * Ejecuta un comando sin shell y devuelve su stdout.
 * En Windows, npm/pnpm son scripts `.cmd` y requieren shell; los argumentos son constantes o rutas propias.
 * @param {string} command
 * @param {string[]} args
 * @param {string} cwd
 */
function run(command, args, cwd) {
  return execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], shell: isWindows });
}

/** @param {string} target @param {string} binariesDir */
function smoke(target, binariesDir) {
  const platform = PLATFORMS[/** @type {keyof typeof PLATFORMS} */ (target)];
  if (!platform) throw new Error(`target desconocido: ${target}. Válidos: ${Object.keys(PLATFORMS).join(', ')}`);

  const corePkg = JSON.parse(readFileSync(join(corePkgDir, 'package.json'), 'utf8'));
  const binaryName = corePkg.napi.binaryName;
  const binary = join(binariesDir, `${binaryName}.${platform}.node`);
  if (!existsSync(binary)) throw new Error(`no existe el binario ${binary}`);
  if (!existsSync(join(corePkgDir, 'dist', 'index.js')))
    throw new Error('falta packages/core/dist: ejecuta pnpm build');

  run('pnpm', ['exec', 'napi', 'create-npm-dirs'], corePkgDir);
  const platformDir = join(corePkgDir, 'npm', platform);
  copyFileSync(binary, join(platformDir, `${binaryName}.${platform}.node`));

  const work = mkdtempSync(join(tmpdir(), 'foker-smoke-'));
  try {
    const coreTgz = run('npm', ['pack', '--silent', '--pack-destination', work], corePkgDir).trim().split('\n').pop();
    const platformTgz = run('npm', ['pack', '--silent', '--pack-destination', work], platformDir)
      .trim()
      .split('\n')
      .pop();
    if (!coreTgz || !platformTgz) throw new Error('npm pack no devolvió el nombre del tarball');

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
