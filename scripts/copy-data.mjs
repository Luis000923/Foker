// Copia un directorio de datos del repo (skills/, roles/) dentro de un paquete antes de compilarlo.
// Uso: node scripts/copy-data.mjs <origen-relativo-al-repo> <destino-relativo-al-repo>

import { cp, rm } from 'node:fs/promises';

const [from, to] = process.argv.slice(2);
if (!from || !to) {
  console.error('uso: node scripts/copy-data.mjs <origen> <destino>');
  process.exit(2);
}
const root = new URL('../', import.meta.url);
const target = new URL(`${to.replace(/\/?$/, '/')}`, root);
await rm(target, { recursive: true, force: true });
await cp(new URL(`${from.replace(/\/?$/, '/')}`, root), target, { recursive: true });
