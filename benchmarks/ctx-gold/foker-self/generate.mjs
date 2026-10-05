import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openEngine } from '../../../packages/core/dist/index.js';

/** @typedef {{id:string, parent:string|null, range:{start:{line:number,col:number},end:{line:number,col:number}}}} SymbolRow */
const repo = fileURLToPath(new URL('../../../', import.meta.url));
const output = fileURLToPath(new URL('./', import.meta.url));
/** @param {string} command @param {string[]} args @param {Buffer} [input] */
function run(command, args, input) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(command, args, { cwd: repo, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } });
    /** @type {Buffer[]} */
    const stdout = [];
    /** @type {Buffer[]} */
    const stderr = [];
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolveResult(Buffer.concat(stdout)) : reject(new Error(Buffer.concat(stderr).toString())),
    );
    child.stdin.on('error', reject);
    child.stdin.end(input);
  });
}
/** @param {string[]} args */
function git(args) {
  return run('git', args);
}
/** Materializa exclusivamente el árbol versionado; no instala dependencias.
 * @param {string} sha @param {string} dir */
export async function materialize(sha, dir) {
  mkdirSync(dir, { recursive: true });
  await run('tar', ['-x', '-C', dir], await git(['archive', sha]));
}
/** @param {string} id */
export function splitFor(id) {
  return createHash('sha256').update(id).digest().readUInt8(0) % 2 === 0 ? 'calibration' : 'validation';
}
/** Líneas Git (base 1); una inserción usa exactamente su anclaje antiguo, incluido 0.
 * @param {string} diff */
export function oldLines(diff) {
  const lines = new Set();
  for (const match of diff.matchAll(/^@@ -(\d+)(?:,(\d+))? \+\d+(?:,\d+)? @@/gm)) {
    const start = Number(match[1]);
    const count = match[2] === undefined ? 1 : Number(match[2]);
    if (count === 0) lines.add(start);
    for (let offset = 0; offset < count; offset++) lines.add(start + offset);
  }
  return [...lines].sort((a, b) => a - b);
}
/** Rango de puntos semiabierto: fin en columna 0 excluye esa línea.
 * El padre explícito desempata rangos iguales; luego puntos e id, sin filtrar kind/export.
 * @param {SymbolRow[]} symbols @param {number[]} lines */
export function assignLines(symbols, lines) {
  const gold = new Set();
  const unassigned = [];
  for (const line of lines) {
    const row = line - 1;
    const containing = symbols.filter(
      (s) => row >= s.range.start.line && (row < s.range.end.line || (row === s.range.end.line && s.range.end.col > 0)),
    );
    const inner = containing.filter((s) => !containing.some((other) => other.parent === s.id));
    inner.sort(
      (a, b) =>
        b.range.start.line - a.range.start.line ||
        b.range.start.col - a.range.start.col ||
        a.range.end.line - b.range.end.line ||
        a.range.end.col - b.range.end.col ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
    if (inner[0]) gold.add(inner[0].id);
    else unassigned.push(line);
  }
  return { gold_symbols: [...gold].sort(), unassigned_lines: [...new Set(unassigned)].sort((a, b) => a - b) };
}
/** @param {string} path */
export function isSource(path) {
  return (
    /^(packages\/|benchmarks\/src\/)/.test(path) &&
    /\.(ts|tsx|mts|cts)$/.test(path) &&
    !/\.test\.ts$|\.d\.ts$|(^|\/)(generated|dist)\//.test(path)
  );
}
/** @param {string} dir */
export async function parentMap(dir) {
  const engine = await openEngine(dir);
  await engine.refresh();
  return JSON.parse(await engine.exportMapJson());
}
/** @param {string[]} values */
function counts(values) {
  /** @type {Record<string,number>} */
  const result = {};
  for (const value of values) result[value] = (result[value] ?? 0) + 1;
  return result;
}
/** @param {string} name @param {{id:string}[]} rows */
function writeRows(name, rows) {
  rows.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (new Set(rows.map((r) => r.id)).size !== rows.length) throw new Error('Colisión de ids');
  writeFileSync(
    join(output, `${name}.jsonl`),
    rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : ''),
  );
}
/** @param {string} head */
export async function generate(head = 'd03fd5e') {
  const cases = [];
  /** @type {{id:string, source_commit:string, commit:string|null, reason:string}[]} */
  const discarded = [];
  const commits = (await git(['log', '--no-merges', '--format=%H%x00%P%x00%s', head])).toString().trim().split('\n');
  for (const entry of commits) {
    const [source_commit, parents, subject] = entry.split('\0');
    const prefix = /^(feat|fix|refactor|perf)(?:\([^\r\n()]+\))?!?: /.exec(subject);
    if (!prefix) continue;
    const commit = parents.split(' ')[0];
    const id = `fs-${source_commit.slice(0, 8)}`;
    const reject = (/** @type {string} */ reason) =>
      discarded.push({ id, source_commit, commit: commit || null, reason });
    if (!commit) {
      reject('sin_padre');
      continue;
    }
    const changes = (await git(['diff', '--no-renames', '--name-status', '-z', commit, source_commit]))
      .toString()
      .split('\0');
    const gold_modified = [];
    for (let i = 0; i < changes.length - 1; i += 2) {
      if (['M', 'D', 'T'].includes(changes[i]) && isSource(changes[i + 1])) gold_modified.push(changes[i + 1]);
    }
    gold_modified.sort();
    if (gold_modified.length < 1 || gold_modified.length > 3) {
      reject('numero_archivos');
      continue;
    }
    /** @type {Record<string, number>} */
    const file_lines = {};
    for (const path of gold_modified) {
      const text = (await git(['show', `${commit}:${path}`])).toString();
      file_lines[path] = text ? text.split('\n').length - Number(text.endsWith('\n')) : 0;
    }
    if (!Object.values(file_lines).some((n) => n >= 300)) {
      reject('sin_archivo_300_lineas');
      continue;
    }
    const dir = mkdtempSync(join(tmpdir(), 'foker-self-'));
    try {
      await materialize(commit, dir);
      const map = await parentMap(dir);
      const gold = new Set();
      /** @type {Record<string, number[]>} */
      const unassigned_lines = {};
      for (const path of gold_modified) {
        const diff = (
          await git([
            'diff',
            '--no-ext-diff',
            '--no-textconv',
            '--no-renames',
            '-U0',
            commit,
            source_commit,
            '--',
            path,
          ])
        ).toString();
        const assigned = assignLines(
          map.symbols.filter((/** @type {SymbolRow} */ s) => s.id.startsWith(`${path}#`)),
          oldLines(diff),
        );
        for (const symbol of assigned.gold_symbols) gold.add(symbol);
        unassigned_lines[path] = assigned.unassigned_lines;
      }
      if (!gold.size) {
        reject('gold_symbols_vacio');
        continue;
      }
      cases.push({
        id,
        fixture: 'foker-self',
        commit,
        source_commit,
        task: subject.slice(prefix[0].length),
        gold_modified,
        gold_symbols: [...gold].sort(),
        unassigned_lines,
        file_lines,
        split: splitFor(id),
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  writeRows('cases', cases);
  writeRows('discarded', discarded);
  console.log(
    JSON.stringify({
      cases: cases.length,
      splits: counts(cases.map((c) => c.split)),
      discarded: counts(discarded.map((c) => c.reason)),
    }),
  );
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--head')) throw new Error('Uso: generate.mjs [--head d03fd5e]');
  await generate(args[1]);
}
