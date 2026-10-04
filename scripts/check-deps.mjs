// Verifica el grafo de dependencias entre módulos de FOKER-SPEC §4.2 (REQ-REPO-001).
//
// Uso: node scripts/check-deps.mjs [root]
// Sale con código 1 y lista las violaciones si algún módulo depende de otro situado a su derecha.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Aristas directas permitidas (módulo → módulos de los que puede depender).
 * Un módulo puede depender también de las dependencias permitidas de sus dependencias.
 * @type {Record<string, string[]>}
 */
export const TS_GRAPH = {
  '@foker/benchmarks': ['@foker/schemas', '@foker/core', '@foker/engine'],
  '@foker/core': [],
  '@foker/schemas': [],
  '@foker/policy': ['@foker/schemas'],
  '@foker/engine': ['@foker/core', '@foker/policy', '@foker/schemas'],
  '@foker/integrations': ['@foker/schemas'],
  '@foker/mcp': ['@foker/engine'],
  foker: ['@foker/engine', '@foker/integrations', '@foker/mcp'],
};

/** @type {Record<string, string[]>} */
export const RUST_GRAPH = {
  'foker-map': [],
  'foker-context': ['foker-map'],
  'foker-napi': ['foker-context', 'foker-map'],
};

/**
 * Cierre transitivo de un grafo.
 * @param {Record<string, string[]>} graph
 * @returns {Map<string, Set<string>>}
 */
export function closure(graph) {
  /** @type {Map<string, Set<string>>} */
  const result = new Map();
  /** @param {string} node @param {string[]} stack */
  const visit = (node, stack) => {
    const cached = result.get(node);
    if (cached) return cached;
    if (stack.includes(node)) throw new Error(`ciclo en el grafo permitido: ${[...stack, node].join(' → ')}`);
    /** @type {Set<string>} */
    const reach = new Set();
    for (const dep of graph[node] ?? []) {
      reach.add(dep);
      for (const d of visit(dep, [...stack, node])) reach.add(d);
    }
    result.set(node, reach);
    return reach;
  };
  for (const node of Object.keys(graph)) visit(node, []);
  return result;
}

const IMPORT_PATTERNS = [
  /\bfrom\s*['"]([^'"]+)['"]/g,
  /\bimport\s*['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
];

/**
 * Especificadores importados por un archivo fuente (sin comentarios).
 * @param {string} source
 * @returns {string[]}
 */
export function importSpecifiers(source) {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
  /** @type {string[]} */
  const specs = [];
  for (const pattern of IMPORT_PATTERNS) {
    for (const match of code.matchAll(pattern)) if (match[1]) specs.push(match[1]);
  }
  return specs;
}

/**
 * Nombre de módulo del workspace al que apunta un especificador, o `null`.
 * @param {string} spec
 * @param {Set<string>} modules
 */
function workspaceModule(spec, modules) {
  for (const name of modules) if (spec === name || spec.startsWith(`${name}/`)) return name;
  return null;
}

/** @param {string} dir @returns {string[]} */
function sourceFiles(dir) {
  if (!existsSync(dir)) return [];
  /** @type {string[]} */
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (/\.(c|m)?[jt]sx?$/.test(entry)) out.push(path);
  }
  return out.sort();
}

/**
 * Comprueba los paquetes TypeScript bajo `<root>/packages`.
 * @param {string} root
 * @returns {string[]} violaciones
 */
export function checkTypeScript(root) {
  const allowed = closure(TS_GRAPH);
  const modules = new Set(Object.keys(TS_GRAPH));
  /** @type {string[]} */
  const errors = [];
  const packagesDir = join(root, 'packages');
  const packageDirs = (existsSync(packagesDir) ? readdirSync(packagesDir) : [])
    .sort()
    .map((dir) => join(packagesDir, dir));
  if (existsSync(join(root, 'benchmarks/package.json'))) packageDirs.push(join(root, 'benchmarks'));
  for (const pkgDir of packageDirs) {
    const pkgPath = join(pkgDir, 'package.json');
    if (!existsSync(pkgPath)) continue;
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    const name = pkg.name;
    const where = relative(root, pkgPath).split(sep).join('/');
    if (!modules.has(name)) {
      errors.push(`${where}: paquete "${name}" no figura en el grafo de FOKER-SPEC §4.2`);
      continue;
    }
    const permitted = allowed.get(name) ?? new Set();
    const declared = new Set(
      ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'].flatMap((field) =>
        Object.keys(pkg[field] ?? {}).filter((dep) => modules.has(dep)),
      ),
    );
    for (const dep of declared) {
      if (dep === name || !permitted.has(dep)) errors.push(`${where}: "${name}" no puede depender de "${dep}"`);
    }

    for (const file of sourceFiles(join(pkgDir, 'src'))) {
      const fileId = relative(root, file).split(sep).join('/');
      for (const spec of importSpecifiers(readFileSync(file, 'utf8'))) {
        if (spec.startsWith('.')) {
          const target = resolve(dirname(file), spec);
          if (relative(pkgDir, target).startsWith('..')) {
            errors.push(`${fileId}: import relativo "${spec}" sale del paquete "${name}"`);
          }
          continue;
        }
        const target = workspaceModule(spec, modules);
        if (target === null || target === name) continue;
        if (!permitted.has(target)) errors.push(`${fileId}: "${name}" no puede importar "${spec}"`);
        else if (!declared.has(target)) errors.push(`${fileId}: importa "${spec}" sin declararlo en package.json`);
      }
    }
  }
  return errors;
}

/**
 * Dependencias declaradas en las secciones `[dependencies]` y similares de un Cargo.toml.
 * Basta con un análisis por líneas: los crates de Foker no usan tablas en línea multilínea.
 * @param {string} toml
 * @returns {string[]}
 */
export function cargoDependencies(toml) {
  /** @type {string[]} */
  const deps = [];
  let inDeps = false;
  for (const raw of toml.split('\n')) {
    const line = raw.trim();
    const section = /^\[([^\]]+)\]$/.exec(line);
    if (section?.[1]) {
      const name = section[1];
      inDeps = /(^|\.)(dev-|build-)?dependencies$/.test(name);
      const dotted = /^(?:target\..+\.)?(?:dev-|build-)?dependencies\.([A-Za-z0-9_-]+)$/.exec(name);
      if (dotted?.[1]) deps.push(dotted[1]);
      continue;
    }
    if (!inDeps || line === '' || line.startsWith('#')) continue;
    const key = /^([A-Za-z0-9_-]+)\s*(?:\.|=)/.exec(line);
    if (key?.[1]) deps.push(key[1]);
  }
  return deps;
}

/**
 * Comprueba los crates Rust bajo `<root>/crates`.
 * @param {string} root
 * @returns {string[]} violaciones
 */
export function checkRust(root) {
  const allowed = closure(RUST_GRAPH);
  const crates = new Set(Object.keys(RUST_GRAPH));
  /** @type {string[]} */
  const errors = [];
  const cratesDir = join(root, 'crates');
  if (!existsSync(cratesDir)) return errors;

  for (const dir of readdirSync(cratesDir).sort()) {
    const manifest = join(cratesDir, dir, 'Cargo.toml');
    if (!existsSync(manifest)) continue;
    const where = relative(root, manifest).split(sep).join('/');
    const toml = readFileSync(manifest, 'utf8');
    const name = /^\s*name\s*=\s*"([^"]+)"/m.exec(toml)?.[1] ?? dir;
    if (!crates.has(name)) {
      errors.push(`${where}: crate "${name}" no figura en el grafo de FOKER-SPEC §4.2`);
      continue;
    }
    const permitted = allowed.get(name) ?? new Set();
    for (const dep of cargoDependencies(toml)) {
      if (crates.has(dep) && (dep === name || !permitted.has(dep))) {
        errors.push(`${where}: "${name}" no puede depender de "${dep}"`);
      }
    }
  }
  return errors;
}

/**
 * @param {string} root
 * @returns {string[]} violaciones de TypeScript y Rust
 */
export function checkDependencies(root) {
  return [...checkTypeScript(root), ...checkRust(root)];
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..'));
  const errors = checkDependencies(root);
  if (errors.length > 0) {
    console.error(`REQ-REPO-001: ${errors.length} violación(es) del grafo de dependencias:`);
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }
  console.log('REQ-REPO-001: grafo de dependencias correcto.');
}
