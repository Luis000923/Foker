import { execFileSync } from 'node:child_process';
import {
  closeSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
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
};

/** Campos `os`/`cpu`/`libc` de cada paquete de plataforma; npm instala solo el que casa con el host. */
const PLATFORM_FIELDS = {
  'linux-x64-gnu': { os: ['linux'], cpu: ['x64'], libc: ['glibc'] },
  'linux-arm64-gnu': { os: ['linux'], cpu: ['arm64'], libc: ['glibc'] },
  'darwin-x64': { os: ['darwin'], cpu: ['x64'] },
  'darwin-arm64': { os: ['darwin'], cpu: ['arm64'] },
  'win32-x64-msvc': { os: ['win32'], cpu: ['x64'] },
};

export const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
export const corePkgDir = join(root, 'packages', 'core');
const isWindows = process.platform === 'win32';

/**
 * Ejecuta un comando sin shell y devuelve su stdout.
 * En Windows, npm/pnpm son scripts `.cmd` y requieren shell; los argumentos son constantes o rutas propias.
 * @param {string} command
 * @param {string[]} args
 * @param {string} cwd
 */
export function run(command, args, cwd) {
  // Un archivo evita depender de pipes bloqueados por algunos entornos aislados.
  const capture = mkdtempSync(join(tmpdir(), 'foker-command-'));
  const output = join(capture, 'stdout');
  const fd = openSync(output, 'w');
  try {
    execFileSync(command, args, { cwd, stdio: ['ignore', fd, 'inherit'], shell: isWindows });
    return readFileSync(output, 'utf8');
  } finally {
    closeSync(fd);
    rmSync(capture, { recursive: true, force: true });
  }
}

/** Genera con napi-rs el paquete de plataforma y añade el addon ya compilado.
 * @param {string} coreDir
 * @param {string} platform
 * @param {string} binariesDir
 */
export function prepareNative(coreDir, platform, binariesDir = coreDir) {
  const pkg = JSON.parse(readFileSync(join(coreDir, 'package.json'), 'utf8'));
  const binaryFile = `${pkg.napi.binaryName}.${platform}.node`;
  const binary = join(binariesDir, binaryFile);
  if (!existsSync(binary)) throw new Error(`no existe el binario ${binary}`);
  run(join(corePkgDir, 'node_modules', '.bin', isWindows ? 'napi.cmd' : 'napi'), ['create-npm-dirs'], coreDir);
  const platformDir = join(coreDir, 'npm', platform);
  copyFileSync(binary, join(platformDir, binaryFile));
  finalizeNativePackage(platformDir, pkg, platform);
  return platformDir;
}

/** Etiqueta de npm para una versión: el identificador de prerelease (`0.1.0-beta.0` → `beta`) o `latest`.
 * @param {string} version
 */
export function distTag(version) {
  return /^\d+\.\d+\.\d+-([a-z]+)/.exec(version)?.[1] ?? 'latest';
}

/** Fija en el package.json de plataforma lo que `napi create-npm-dirs` no garantiza: versión, licencia,
 * `os`/`cpu`/`libc` y `publishConfig`. Falla si algo no coincide con `@foker/core`.
 * @param {string} platformDir
 * @param {{ version: string, license: string }} corePkg
 * @param {string} platform
 */
export function finalizeNativePackage(platformDir, corePkg, platform) {
  const fields = PLATFORM_FIELDS[/** @type {keyof typeof PLATFORM_FIELDS} */ (platform)];
  if (!fields) throw new Error(`plataforma sin definición os/cpu/libc: ${platform}`);
  const file = join(platformDir, 'package.json');
  const pkg = JSON.parse(readFileSync(file, 'utf8'));
  if (pkg.name !== `@foker/core-${platform}`) throw new Error(`nombre inesperado: ${pkg.name}`);
  if (pkg.version !== corePkg.version) throw new Error(`${pkg.name}: versión ${pkg.version} != ${corePkg.version}`);
  const { libc: _libc, ...rest } = pkg;
  const out = {
    ...rest,
    license: corePkg.license,
    ...fields,
    publishConfig: { access: 'public', tag: distTag(corePkg.version) },
  };
  writeFileSync(file, `${JSON.stringify(out, null, 2)}\n`);
}

/** `optionalDependencies` de `@foker/core`: un paquete por plataforma soportada, versión exacta.
 * Se inyecta al empaquetar, no en el repo: antes de publicar, pnpm no puede resolverlos en el registro.
 * @param {string} version
 */
export function nativeOptionalDependencies(version) {
  return Object.fromEntries(Object.values(PLATFORMS).map((platform) => [`@foker/core-${platform}`, version]));
}

/** Empaqueta únicamente archivos locales; no ejecuta lifecycle scripts ni consulta el registro.
 * @param {string} dir
 * @param {string} out
 */
export function pack(dir, out) {
  const result = JSON.parse(
    run(
      'npm',
      [
        'pack',
        '.',
        '--update-notifier=false',
        '--json',
        '--offline',
        '--ignore-scripts',
        '--cache',
        join(out, '.npm-cache'),
        '--pack-destination',
        out,
      ],
      dir,
    ),
  );
  if (!result[0]?.filename) throw new Error('npm pack no devolvió el nombre del tarball');
  return result[0].filename;
}

/** Empaqueta `@foker/core` y los paquetes de plataforma desde los `.node` ya compilados por la matriz de CI.
 * @param {string} binariesDir directorio con `<binaryName>.<plataforma>.node` de las 5 plataformas
 * @param {string} out directorio de salida de los tarballs
 */
export function packRelease(binariesDir, out) {
  binariesDir = resolve(binariesDir);
  out = resolve(out);
  const source = JSON.parse(readFileSync(join(corePkgDir, 'package.json'), 'utf8'));
  const missing = Object.values(PLATFORMS).filter(
    (platform) => !existsSync(join(binariesDir, `${source.napi.binaryName}.${platform}.node`)),
  );
  if (missing.length) throw new Error(`faltan binarios en ${binariesDir}: ${missing.join(', ')}`);
  if (!existsSync(join(corePkgDir, 'dist', 'index.js')))
    throw new Error('falta packages/core/dist: ejecuta pnpm build');
  const work = mkdtempSync(join(tmpdir(), 'foker-release-'));
  try {
    const stage = join(work, 'core');
    mkdirSync(stage);
    for (const file of ['package.json', ...source.files])
      cpSync(join(corePkgDir, file), join(stage, file), { recursive: true });
    const staged = JSON.parse(readFileSync(join(stage, 'package.json'), 'utf8'));
    staged.optionalDependencies = nativeOptionalDependencies(staged.version);
    writeFileSync(join(stage, 'package.json'), `${JSON.stringify(staged, null, 2)}\n`);
    mkdirSync(out, { recursive: true });
    const tarballs = Object.values(PLATFORMS).map((platform) => pack(prepareNative(stage, platform, binariesDir), out));
    tarballs.push(pack(stage, out));
    return tarballs;
  } finally {
    rmSync(work, { recursive: true, force: true });
    rmSync(join(out, '.npm-cache'), { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    const option = (/** @type {string} */ name) => args[args.indexOf(name) + 1];
    if (args.length !== 4 || !option('--binaries') || !option('--out'))
      throw new Error('uso: node scripts/native-pack.mjs --binaries <dir-con-.node> --out <dir>');
    for (const tarball of packRelease(
      /** @type {string} */ (option('--binaries')),
      /** @type {string} */ (option('--out')),
    ))
      console.log(tarball);
  } catch (error) {
    console.error(`empaquetado fallido: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
