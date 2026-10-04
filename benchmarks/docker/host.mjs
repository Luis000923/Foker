import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

mkdirSync('/tmp/home', { recursive: true });
if (existsSync('/work/.foker/bench-xdg')) process.env.XDG_CONFIG_HOME = '/work/.foker/bench-xdg';
// node_modules se copia del fixture preinstalado: pnpm 11 lo ve desincronizado y lanzaría
// `pnpm install` (sin red) antes de cada script, rompiendo tests y foker_check del agente.
for (const dir of new Set(['/tmp/home/.config', process.env.XDG_CONFIG_HOME].filter(Boolean))) {
  mkdirSync(`${dir}/pnpm`, { recursive: true });
  writeFileSync(`${dir}/pnpm/config.yaml`, 'verifyDepsBeforeRun: false\n');
}
const [hostName, expectedVersion, ...args] = process.argv.slice(2);
const version = spawnSync(hostName === 'codex' ? 'codex' : 'claude', ['--version'], { encoding: 'utf8' });
if (
  version.status !== 0 ||
  !(hostName === 'codex'
    ? version.stdout.trim() === `codex-cli ${expectedVersion}`
    : version.stdout.trim().startsWith(`${expectedVersion} `))
)
  throw new Error('La imagen no coincide con la versión del anfitrión del manifiesto');
if (hostName === 'codex') {
  mkdirSync('/tmp/codex', { recursive: true });
  const { symlinkSync } = await import('node:fs');
  symlinkSync('/codex-auth/auth.json', '/tmp/codex/auth.json');
  process.env.CODEX_HOME = '/tmp/codex';
}
const r = spawnSync(hostName === 'codex' ? 'codex' : 'claude', args, {
  cwd: '/work',
  env: process.env,
  encoding: 'utf8',
  maxBuffer: 128 * 1024 * 1024,
});
process.stderr.write(r.stderr ?? '');
try {
  const output = JSON.parse(r.stdout);
  const transcript = [];
  const scan = (dir) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) scan(path);
      else if (entry.name.endsWith('.jsonl'))
        for (const line of readFileSync(path, 'utf8').split('\n')) {
          try {
            transcript.push(JSON.parse(line));
          } catch {}
        }
    }
  };
  scan('/tmp/home/.claude/projects');
  if (transcript.length) output.transcript = transcript;
  process.stdout.write(JSON.stringify(output));
} catch {
  process.stdout.write(r.stdout ?? '');
}
// exitCode y no exit(): salir en seco truncaría stdout pendiente en la tubería (64 KiB, smoke FKR-011).
process.exitCode = r.status ?? 1;
