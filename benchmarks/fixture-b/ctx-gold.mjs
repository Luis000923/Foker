import { execFile, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { assignLines, oldLines, parentMap, splitFor } from '../ctx-gold/foker-self/generate.mjs';
import { diffEntries, isOwnSource } from './mine.mjs';

const exec = promisify(execFile);
const ENV = { ...process.env, GIT_NO_REPLACE_OBJECTS: '1', GIT_OPTIONAL_LOCKS: '0' };

/** @typedef {{id:string, repo:string, base:string, commit:string, statement:string, tests_changed:string[]}} Task */
/** @typedef {{id:string, parent:string|null, range:{start:{line:number,col:number},end:{line:number,col:number}}}} SymbolRow */

/** Solo lectura del clon: rev-parse, diff y archive; nunca checkout ni HEAD.
 * @param {string} path @param {string[]} args */
async function git(path, args) {
  return (await exec('git', ['-C', path, ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, env: ENV }))
    .stdout;
}

/** Valida una línea de tareas sin aceptar ids que escapen del directorio de árboles.
 * @param {string} line @param {number} index @returns {Task} */
export function parseTask(line, index) {
  /** @type {Task} */
  let task;
  try {
    task = JSON.parse(line);
  } catch {
    throw new Error(`JSON inválido en la línea ${index + 1}`);
  }
  const sha = /^[0-9a-f]{40}$/;
  if (
    !task ||
    typeof task.id !== 'string' ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(task.id) ||
    typeof task.repo !== 'string' ||
    !/^[a-z][a-z0-9_-]*$/.test(task.repo) ||
    !sha.test(task.base) ||
    !sha.test(task.commit) ||
    typeof task.statement !== 'string' ||
    !task.statement.trim() ||
    !Array.isArray(task.tests_changed)
  ) {
    throw new Error(`Tarea inválida en la línea ${index + 1}`);
  }
  return task;
}

/** Materializa el árbol versionado de B con `git archive | tar`; reemplaza un árbol previo.
 * @param {string} clone @param {string} sha @param {string} dir */
export async function materializeTree(clone, sha, dir) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  await new Promise((done, fail) => {
    const archive = spawn('git', ['-C', clone, 'archive', '--format=tar', sha], {
      env: ENV,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const tar = spawn('tar', ['-x', '-C', dir], { stdio: ['pipe', 'ignore', 'pipe'] });
    /** @type {Buffer[]} */
    const errors = [];
    archive.stderr.on('data', (chunk) => errors.push(chunk));
    tar.stderr.on('data', (chunk) => errors.push(chunk));
    archive.stdout.pipe(tar.stdin);
    let pending = 2;
    let failed = false;
    const finish = (/** @type {string} */ name) => (/** @type {number|null} */ code) => {
      if (code !== 0 && !failed) {
        failed = true;
        fail(new Error(`${name} terminó con ${code}: ${Buffer.concat(errors).toString()}`));
      } else if (--pending === 0 && !failed) done(undefined);
    };
    archive.on('error', fail);
    tar.on('error', fail);
    archive.on('close', finish('git archive'));
    tar.on('close', finish('tar'));
  });
}

/** gold_modified = archivos TS propios con estado M en B→C (misma regla que src_modified de mine.mjs).
 * @param {string} clone @param {string} base @param {string} commit */
export async function goldModified(clone, base, commit) {
  return (await diffEntries(clone, base, commit))
    .filter((f) => f.status === 'M' && isOwnSource(f.path))
    .map((f) => f.path)
    .sort();
}

/** Construye un caso: árbol de B, mapa de B y asignación al símbolo más interno (método FKR-095).
 * @param {Task} task @param {string} repos @param {string} trees */
export async function buildCase(task, repos, trees) {
  const clone = join(repos, task.repo);
  const parent = (await git(clone, ['rev-parse', '--verify', `${task.commit}^1`])).trim();
  if (parent !== task.base) throw new Error(`${task.id}: base no es el padre de commit (${parent})`);
  const gold_modified = await goldModified(clone, task.base, task.commit);
  if (!gold_modified.length) throw new Error(`${task.id}: gold_modified vacío`);
  const dir = join(trees, task.id);
  await materializeTree(clone, task.base, dir);
  // El motor persiste su caché en .foker; el árbol de B no la trae y se elimina tras exportar.
  const hadFoker = existsSync(join(dir, '.foker'));
  const map = await parentMap(dir);
  if (!hadFoker) rmSync(join(dir, '.foker'), { recursive: true, force: true });
  const gold = new Set();
  let unassigned = 0;
  for (const path of gold_modified) {
    const diff = await git(clone, [
      'diff',
      '--no-ext-diff',
      '--no-textconv',
      '--no-renames',
      '-U0',
      task.base,
      task.commit,
      '--',
      path,
    ]);
    const assigned = assignLines(
      map.symbols.filter((/** @type {SymbolRow} */ s) => s.id.startsWith(`${path}#`)),
      oldLines(diff),
    );
    for (const symbol of assigned.gold_symbols) gold.add(symbol);
    unassigned += assigned.unassigned_lines.length;
  }
  return {
    row: {
      id: task.id,
      fixture: 'fixture-b',
      repo: task.repo,
      base: task.base,
      task: task.statement,
      gold_modified,
      gold_symbols: [...gold].sort(),
      split: splitFor(task.id),
    },
    unassigned,
  };
}

/** @param {string} tasksFile @param {string} repos @param {string} trees */
export async function buildCases(tasksFile, repos, trees) {
  const source = readFileSync(tasksFile, 'utf8').trim();
  if (!source) throw new Error('Sin tareas');
  const tasks = source.split('\n').map(parseTask);
  const ids = new Set(tasks.map((t) => t.id));
  if (ids.size !== tasks.length) throw new Error('Ids de tarea duplicados');
  tasks.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  mkdirSync(trees, { recursive: true });
  const rows = [];
  let unassigned = 0;
  for (const task of tasks) {
    const result = await buildCase(task, resolve(repos), resolve(trees));
    rows.push(result.row);
    unassigned += result.unassigned;
  }
  return { rows, unassigned };
}

/** @param {{id:string}[]} rows */
export function serialize(rows) {
  return rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : '');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length !== 6 || args[0] !== '--tasks' || args[2] !== '--repos' || args[4] !== '--trees') {
    throw new Error('Uso: node benchmarks/fixture-b/ctx-gold.mjs --tasks <tasks.jsonl> --repos <clones> --trees <dir>');
  }
  const { rows, unassigned } = await buildCases(args[1] ?? '', args[3] ?? '', args[5] ?? '');
  const output = fileURLToPath(new URL('./ctx-gold/', import.meta.url));
  mkdirSync(output, { recursive: true });
  writeFileSync(join(output, 'cases.jsonl'), serialize(rows));
  /** @type {Record<string, number>} */
  const splits = {};
  for (const row of rows) splits[row.split] = (splits[row.split] ?? 0) + 1;
  const empty = rows.filter((row) => !row.gold_symbols.length).map((row) => row.id);
  console.log(JSON.stringify({ cases: rows.length, splits, unassigned_lines: unassigned, gold_symbols_vacio: empty }));
}
