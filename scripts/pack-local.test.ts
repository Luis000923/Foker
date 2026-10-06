import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { root, run } from './native-pack.mjs';
import { hostPlatform } from './pack-local.mjs';

const packages = ['cli', 'core', 'engine', 'integrations', 'mcp', 'policy', 'schemas'];
const originals = packages.map((dir) => join(root, 'packages', dir, 'package.json'));
originals.push(
  ...readdirSync(join(root, 'packages', 'cli', 'templates'), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name === 'package.json')
    .map((entry) => join(entry.parentPath, entry.name)),
);
const before = originals.map((file) => readFileSync(file, 'utf8'));
const versions = Object.fromEntries(
  before.slice(0, packages.length).map((source) => {
    const pkg = JSON.parse(source);
    return [pkg.name, pkg.version];
  }),
);
const work = mkdtempSync(join(tmpdir(), 'foker-pack-test-'));
// Incluye espacios para comprobar que las rutas se pasan como argumentos.
const out = join(work, 'lote local');
let tarballs: string[];
let overrides: Record<string, string>;
let foker: string;
const manifests = new Map<string, { name: string; version: string; [key: string]: unknown }>();

beforeAll(() => {
  run(process.execPath, ['scripts/pack-local.mjs', '--out', out], root);
  tarballs = readdirSync(out).filter((file) => file.endsWith('.tgz'));
  ({ foker, overrides } = JSON.parse(readFileSync(join(out, 'install-local.json'), 'utf8')));
  for (const tarball of tarballs) {
    manifests.set(tarball, JSON.parse(run('tar', ['-xOf', join(out, tarball), 'package/package.json'], root)));
  }
}, 60_000);

afterAll(() => rmSync(work, { recursive: true, force: true }));

describe('FKR-100: empaquetado local real', () => {
  it('genera exactamente los ocho paquetes esperados', () => {
    expect(tarballs).toHaveLength(8);
    expect([...manifests.values()].map((pkg) => pkg.name).sort()).toEqual(
      [...Object.keys(versions), `@foker/core-${hostPlatform()}`].sort(),
    );
    expect(readdirSync(out).sort()).toEqual([...tarballs, 'README.md', 'install-local.json'].sort());
  });

  it('FKR-102: distribuye todos los archivos de nextjs-turbo con gitignore empaquetable', () => {
    const source = join(root, 'templates', 'nextjs-turbo');
    const expected = readdirSync(source, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) =>
        join(entry.parentPath, entry.name)
          .slice(source.length + 1)
          .split('/')
          .map((part) => (part === '.gitignore' ? '_gitignore' : part))
          .join('/'),
      )
      .sort();
    const prefix = 'package/templates/nextjs-turbo/';
    const actual = run('tar', ['-tzf', foker], root)
      .trim()
      .split('\n')
      .filter((entry) => entry.startsWith(prefix) && !entry.endsWith('/'))
      .map((entry) => entry.slice(prefix.length))
      .sort();
    expect(actual).toHaveLength(expected.length);
    expect(actual).toEqual(expected);
    expect(run('tar', ['-xOf', foker, `${prefix}_gitignore`], root)).toBe(
      readFileSync(join(source, '.gitignore'), 'utf8'),
    );
  });

  it('elimina workspace: de todos los manifiestos y fija las versiones internas', () => {
    for (const [tarball, pkg] of manifests) {
      const entries = run('tar', ['-tzf', join(out, tarball)], root)
        .trim()
        .split('\n');
      for (const entry of entries.filter((file) => file.endsWith('/package.json'))) {
        expect(run('tar', ['-xOf', join(out, tarball), entry], root)).not.toContain('workspace:');
      }
      for (const section of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
        for (const [name, version] of Object.entries((pkg[section] ?? {}) as Record<string, string>)) {
          if (versions[name]) expect(version).toBe(versions[name]);
        }
      }
    }
  });

  it('incluye el addon compilado en el tarball de plataforma', () => {
    const nativeName = `@foker/core-${hostPlatform()}`;
    const tarball = [...manifests].find(([, pkg]) => pkg.name === nativeName)?.[0];
    if (!tarball) throw new Error('falta el paquete nativo');
    const extracted = join(work, 'native');
    mkdirSync(extracted);
    run('tar', ['-xzf', join(out, tarball), '-C', extracted], root);
    const binary = `foker-core.${hostPlatform()}.node`;
    const digest = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');
    expect(digest(join(extracted, 'package', binary))).toBe(digest(join(root, 'packages', 'core', binary)));
    const core = [...manifests.values()].find((pkg) => pkg.name === '@foker/core');
    expect(core?.['optionalDependencies']).toEqual({ [nativeName]: core?.version });
  });

  it('separa el tarball de Foker de los siete overrides absolutos e incluye los pasos de instalación', () => {
    expect(Object.keys(overrides)).toHaveLength(7);
    expect(overrides).not.toHaveProperty('foker');
    expect(isAbsolute(foker)).toBe(true);
    for (const [tarball, pkg] of manifests) {
      if (pkg.name === 'foker') {
        expect(foker).toBe(join(out, tarball));
        continue;
      }
      expect(overrides[pkg.name]).toBe(`file:${join(out, tarball)}`);
      expect(isAbsolute(String(overrides[pkg.name]).slice(5))).toBe(true);
    }
    const readme = readFileSync(join(out, 'README.md'), 'utf8');
    for (const command of ['npm init -y', 'overrides', 'npm install', 'npx foker --version', 'npx foker doctor']) {
      expect(readme).toContain(command);
    }
    expect(readme).toContain(`npm install "${foker}"`);
  });

  it('preserva los manifiestos originales byte a byte', () => {
    expect(originals.map((file) => readFileSync(file, 'utf8'))).toEqual(before);
  });
});
