// Borra los artefactos de compilación de los paquetes TypeScript y de Rust.
import { readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
for (const dir of readdirSync(join(root, 'packages'))) {
  rmSync(join(root, 'packages', dir, 'dist'), { recursive: true, force: true });
}
rmSync(join(root, 'target'), { recursive: true, force: true });
