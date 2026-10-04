import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

mkdirSync('/tmp/home', { recursive: true });
if (existsSync('/work/.foker/bench-xdg')) process.env.XDG_CONFIG_HOME = '/work/.foker/bench-xdg';
const [expectedVersion, ...args] = process.argv.slice(2);
const version = spawnSync('claude', ['--version'], { encoding: 'utf8' });
if (version.status !== 0 || !version.stdout.trim().startsWith(`${expectedVersion} `))
  throw new Error('La imagen no coincide con la versión de Claude del manifiesto');
const r = spawnSync('claude', args, {
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
process.exit(r.status ?? 1);
