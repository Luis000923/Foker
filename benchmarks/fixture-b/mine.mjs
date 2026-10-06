import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const exec = promisify(execFile);

// Copia literal de los patrones raw de EXCLUDE y TEST de:
// /home/luis/.local/share/foker-bench/fixture-b/tools/eligibility.py (E2/E3).
// Un solo escape, igual que el original (r'…\.github…' en Python).
export const EXCLUDE =
  /(^|\/)(node_modules|dist|build|coverage|vendor|vendored|generated|__generated__|fixtures?|__fixtures__|examples?|playground|docs?|benchmarks?|bench|scripts|\.github|\.changeset)(\/|$)/;
export const TEST = /(^|\/)(__tests__|tests?|test-d|__snapshots__|e2e)(\/|$)|\.(test|spec|test-d|bench)\.[cm]?[jt]sx?$/;
const TS = /\.(ts|tsx|mts|cts)$/;
const START = Date.parse('2026-04-01T00:00:00Z');
const END = Date.parse('2026-09-30T23:59:59Z');

/** @param {string} path @param {string[]} args */
async function git(path, args) {
  return (
    await exec('git', ['-C', path, ...args], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, GIT_NO_REPLACE_OBJECTS: '1', GIT_OPTIONAL_LOCKS: '0' },
    })
  ).stdout;
}

/** @param {string} commit */
export function seededKey(commit) {
  return createHash('sha256').update(`fixture-b-42:${commit}`).digest('hex');
}

/** @param {string} path */
function isTs(path) {
  return TS.test(path) && !path.endsWith('.d.ts');
}

/** Código TS propio: extensión TS sin `.d.ts`, fuera de tests y de EXCLUDE (E2/E3).
 * @param {string} path */
export function isOwnSource(path) {
  return isTs(path) && !TEST.test(path) && !EXCLUDE.test(path);
}

/** Entradas del diff B→C con renombres explícitos al 50 % (cada entrada una vez).
 * @param {string} path @param {string} base @param {string} commit */
export async function diffEntries(path, base, commit) {
  const tokens = (await git(path, ['diff', '--name-status', '-z', '--find-renames=50%', base, commit, '--'])).split(
    '\0',
  );
  /** @type {{status: string, path: string, oldPath?: string}[]} */
  const files = [];
  for (let i = 0; i < tokens.length && tokens[i]; ) {
    const status = tokens[i++] ?? '';
    const first = tokens[i++] ?? '';
    if (/^[RC]/.test(status)) files.push({ status, oldPath: first, path: tokens[i++] ?? '' });
    else files.push({ status, path: first });
  }
  return files;
}

/** @param {string} path */
function forbidden(path) {
  const name = basename(path);
  return (
    [
      'pnpm-lock.yaml',
      'package-lock.json',
      'npm-shrinkwrap.json',
      'yarn.lock',
      'bun.lockb',
      'bun.lock',
      'deno.lock',
      'package.json',
      'pnpm-workspace.yaml',
      '.nvmrc',
    ].includes(name) ||
    /^tsconfig.*\.json$/.test(name) ||
    /^vitest.*\.config\..+$/.test(name)
  );
}

/** @param {string} repo @param {string} path @param {string} identity */
export async function mine(repo, path, identity) {
  if (!/^[a-z][a-z0-9_-]*$/.test(repo)) throw new Error('Nombre de repo inválido');
  if (!/^[0-9a-f]{40}$/.test(identity)) throw new Error('La identidad debe ser un SHA de 40 hex');
  // No usar --since: puede podar ancestros con fechas no monótonas.
  const commits = (await git(path, ['log', '--first-parent', '--format=%H%x00%P%x00%cI%x00%s', identity]))
    .trimEnd()
    .split('\n');
  /** @type {{repo: string, commit: string, base: string, fecha: string, subject: string, type: string, src_modified: string[], src_added: string[], tests_changed: string[], files_total: number}[]} */
  const candidates = [];
  /** @type {{commit: string, fecha: string, reason: string}[]} */
  const rejected = [];
  for (const metadata of commits) {
    const [commit = '', parentText = '', date = '', subject = ''] = metadata.split('\0');
    const timestamp = Date.parse(date);
    if (timestamp < START || timestamp > END) continue;
    const fecha = new Date(timestamp).toISOString().replace('.000Z', 'Z');
    const parents = parentText.split(' ').filter(Boolean);
    let reason;
    if (parents.length !== 1) reason = 'merge';
    else if (
      /^(chore|ci|docs|build|release|test|style|revert)(?:\([^)]*\))?(?:!?:|\b)/i.test(subject) ||
      /\b(deps|dependency|bump|renovate)\b|update dependency/i.test(subject)
    )
      reason = 'subject';
    if (reason) {
      rejected.push({ commit, fecha, reason });
      continue;
    }
    const base = parents[0];
    if (!base) throw new Error('Falta el padre único');
    const files = await diffEntries(path, base, commit);
    const own = isOwnSource;
    const src_modified = files
      .filter((f) => f.status === 'M' && own(f.path))
      .map((f) => f.path)
      .sort();
    const src_added = files
      .filter((f) => f.status === 'A' && own(f.path))
      .map((f) => f.path)
      .sort();
    const tests_changed = files
      .filter((f) => ['A', 'M'].includes(f.status) && isTs(f.path) && TEST.test(f.path))
      .map((f) => f.path)
      .sort();
    if (src_modified.length < 1 || src_modified.length > 5) reason = 'src_count';
    else if (!tests_changed.length) reason = 'no_test';
    else if (files.some((f) => forbidden(f.path) || (f.oldPath !== undefined && forbidden(f.oldPath))))
      reason = 'forbidden_file';
    else if (files.length > 20) reason = 'too_many_files';
    if (reason) rejected.push({ commit, fecha, reason });
    else {
      const prefix = /^(fix|feat|perf|refactor)(?:\([^)]*\))?!?:/.exec(subject);
      candidates.push({
        repo,
        commit,
        base,
        fecha,
        subject,
        type: prefix?.[1] ?? 'otro',
        src_modified,
        src_added,
        tests_changed,
        files_total: files.length,
      });
    }
  }
  candidates.sort((a, b) => seededKey(a.commit).localeCompare(seededKey(b.commit)));
  rejected.sort((a, b) => seededKey(a.commit).localeCompare(seededKey(b.commit)));
  return { candidates, rejected };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length !== 6 || args[0] !== '--repo' || args[2] !== '--path' || args[4] !== '--identity') {
    throw new Error('Uso: node benchmarks/fixture-b/mine.mjs --repo <nombre> --path <clon> --identity <sha>');
  }
  const result = await mine(args[1] ?? '', args[3] ?? '', args[5] ?? '');
  const output = fileURLToPath(new URL('./candidates/', import.meta.url));
  mkdirSync(output, { recursive: true });
  writeFileSync(
    resolve(output, `${args[1]}.jsonl`),
    result.candidates.map((row) => JSON.stringify(row)).join('\n') + (result.candidates.length ? '\n' : ''),
  );
  writeFileSync(
    resolve(output, `${args[1]}.rejected.jsonl`),
    result.rejected.map((row) => JSON.stringify(row)).join('\n') + (result.rejected.length ? '\n' : ''),
  );
  console.log(
    JSON.stringify({ repo: args[1], candidates: result.candidates.length, rejected: result.rejected.length }),
  );
}
