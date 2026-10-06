import { execFileSync } from 'node:child_process';
import { closeSync, copyFileSync, existsSync, mkdtempSync, openSync, readFileSync, rmSync } from 'node:fs';
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
  return platformDir;
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
