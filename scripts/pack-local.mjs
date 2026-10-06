// FKR-100: distribución local de los artefactos ya compilados, sin publicar ni usar red.
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLATFORMS, pack, prepareNative, root } from './native-pack.mjs';

const packages = ['cli', 'core', 'engine', 'integrations', 'mcp', 'policy', 'schemas'];

export function hostPlatform() {
  const libc =
    process.platform === 'linux' ? (process.report.getReport().header.glibcVersionRuntime ? 'gnu' : 'musl') : '';
  const suffix = [process.platform, process.arch, process.platform === 'win32' ? 'msvc' : libc]
    .filter(Boolean)
    .join('-');
  if (!Object.values(PLATFORMS).includes(suffix)) throw new Error(`plataforma no soportada: ${suffix}`);
  return suffix;
}

export function packLocal(out = join(root, 'dist-local')) {
  out = resolve(out);
  const platform = hostPlatform();
  const manifests = packages.map((dir) =>
    JSON.parse(readFileSync(join(root, 'packages', dir, 'package.json'), 'utf8')),
  );
  const versions = Object.fromEntries(manifests.map((pkg) => [pkg.name, pkg.version]));
  const work = mkdtempSync(join(tmpdir(), 'foker-pack-'));
  try {
    for (const [index, dir] of packages.entries()) {
      const source = join(root, 'packages', dir);
      const stage = join(work, dir);
      const pkg = manifests[index];
      if (!existsSync(join(source, 'dist', 'index.js')))
        throw new Error(`falta ${source}/dist: compila TypeScript antes de empaquetar`);
      mkdirSync(stage);
      for (const file of pkg.files) {
        if (!existsSync(join(source, file))) throw new Error(`falta el artefacto ${source}/${file}`);
        cpSync(join(source, file), join(stage, file), { recursive: true });
      }
      for (const section of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
        for (const [name, version] of Object.entries(pkg[section] ?? {})) {
          if (!version.startsWith('workspace:')) continue;
          if (version !== 'workspace:*' || !versions[name])
            throw new Error(`dependencia workspace no resoluble: ${name}@${version}`);
          pkg[section][name] = versions[name];
        }
      }
      writeFileSync(join(stage, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`);
    }
    const core = join(work, 'core');
    const native = prepareNative(core, platform, join(root, 'packages', 'core'));
    // El lote local solo contiene el host actual: no resolver otras plataformas en el registro.
    const nativePkg = JSON.parse(readFileSync(join(native, 'package.json'), 'utf8'));
    const corePkg = JSON.parse(readFileSync(join(core, 'package.json'), 'utf8'));
    corePkg.optionalDependencies = { [nativePkg.name]: nativePkg.version };
    writeFileSync(join(core, 'package.json'), `${JSON.stringify(corePkg, null, 2)}\n`);
    mkdirSync(out, { recursive: true });
    const overrides = {};
    let cliTarball;
    for (const dir of [...packages.map((name) => join(work, name)), native]) {
      const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
      const tarball = pack(dir, out);
      if (pkg.name === 'foker') cliTarball = tarball;
      else overrides[pkg.name] = `file:${join(out, tarball)}`;
    }
    writeFileSync(join(out, 'install-local.json'), `${JSON.stringify({ overrides }, null, 2)}\n`);
    writeFileSync(
      join(out, 'README.md'),
      `# Instalación local de Foker\n\nNode >= 22.14; lote para ${platform}.\n\nEn un proyecto limpio ejecuta \`npm init -y\` y copia el bloque \`overrides\` de\n\`install-local.json\` al package.json del proyecto antes de instalar:\n\n\`npm install "${join(out, cliTarball)}"\`\n\nDespués: \`npx --no-install foker doctor\`. Las dependencias externas pueden requerir\nregistro o caché de npm. Los tarballs de Foker no requieren publicación. Si mueves\nel lote, actualiza las rutas absolutas de los overrides.\n`,
    );
    return out;
  } finally {
    rmSync(work, { recursive: true, force: true });
    rmSync(join(out, '.npm-cache'), { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length && (args.length !== 2 || args[0] !== '--out' || !args[1]))
      throw new Error('uso: node scripts/pack-local.mjs [--out <dir>]');
    console.log(`Paquetes locales: ${packLocal(args[1])}`);
  } catch (error) {
    console.error(`empaquetado fallido: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
