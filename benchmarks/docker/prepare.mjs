import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync } from 'node:fs';

mkdirSync('/tmp/home', { recursive: true });
cpSync('/opt/fixture/node_modules', '/work/node_modules', { recursive: true, verbatimSymlinks: true });
cpSync('/opt/fixture/pnpm-lock.yaml', '/work/pnpm-lock.yaml');
if (process.argv[2] === 'foker') {
  process.env.XDG_CONFIG_HOME = '/work/.foker/bench-xdg';
  mkdirSync(process.env.XDG_CONFIG_HOME, { recursive: true });
  for (const args of [['init', '--targets', process.argv[3] ?? 'claude-code'], ['trust', '--yes', '--ci'], ['map']]) {
    const r = spawnSync('foker', args, { cwd: '/work', env: { ...process.env, CI: 'true' }, stdio: 'inherit' });
    if (r.status !== 0) process.exit(r.status ?? 1);
  }
  // El enlace usa la versión de Foker incluida en la imagen.
  mkdirSync('/work/node_modules/.bin', { recursive: true });
  const { symlinkSync } = await import('node:fs');
  symlinkSync('/opt/foker/packages/cli/dist/bin.js', '/work/node_modules/.bin/foker');
}
