// Copia un directorio de datos del repo (skills/, roles/) dentro de un paquete antes de compilarlo.
// Uso: node scripts/copy-data.mjs <origen-relativo-al-repo> <destino-relativo-al-repo>

import { cp, readdir, rename, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Evita que npm pack descarte los .gitignore, también en directorios anidados.
 * @param {URL} source
 * @param {URL} target
 */
export async function copyData(source, target) {
  await rm(target, { recursive: true, force: true });
  await cp(source, target, { recursive: true });
  /** @param {string} dir */
  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && entry.name === '.gitignore') {
        if (entries.some((other) => other.name === '_gitignore'))
          throw new Error(`Nombre reservado para empaquetado: ${join(dir, '_gitignore')}`);
        await rename(path, join(dir, '_gitignore'));
      }
    }
  }
  await walk(fileURLToPath(target));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [from, to] = process.argv.slice(2);
  if (!from || !to) {
    console.error('uso: node scripts/copy-data.mjs <origen> <destino>');
    process.exit(2);
  }
  const root = new URL('../', import.meta.url);
  await copyData(new URL(`${from.replace(/\/?$/, '/')}`, root), new URL(`${to.replace(/\/?$/, '/')}`, root));
}
