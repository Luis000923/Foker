/** FKR-DEP-012: SBOM CycloneDX 1.5 JSON determinista (sin timestamps ni UUID aleatorios). */
import { createHash } from 'node:crypto';
import type { LockPackage } from './parsers.js';

export function purl(name: string, version: string): string {
  const encoded = name.startsWith('@')
    ? `${encodeURIComponent(name.slice(0, name.indexOf('/')))}/${encodeURIComponent(name.slice(name.indexOf('/') + 1))}`
    : encodeURIComponent(name);
  return `pkg:npm/${encoded}@${encodeURIComponent(version)}`;
}

function hashes(integrity: string | undefined): { alg: string; content: string }[] {
  if (!integrity) return [];
  const m = /^(sha512|sha384|sha256|sha1)-([A-Za-z0-9+/=]+)$/.exec(integrity.split(/\s+/)[0] ?? '');
  if (!m) return [];
  const alg = { sha512: 'SHA-512', sha384: 'SHA-384', sha256: 'SHA-256', sha1: 'SHA-1' }[m[1] as 'sha512'];
  return [{ alg, content: Buffer.from(m[2] as string, 'base64').toString('hex') }];
}

export interface SbomComponentInput {
  name: string;
  version?: string;
}

export function generateSbom(root: SbomComponentInput, packages: readonly LockPackage[]): Record<string, unknown> {
  const components = packages
    .filter((p) => p.source !== 'link' && p.source !== 'file')
    .map((p) => {
      const ref = purl(p.name, p.version);
      const h = hashes(p.integrity);
      return {
        type: 'library',
        'bom-ref': ref,
        name: p.name,
        version: p.version,
        purl: ref,
        ...(h.length ? { hashes: h } : {}),
        ...(p.license ? { licenses: [{ expression: p.license }] } : {}),
        ...(p.resolved && /^https:\/\//.test(p.resolved)
          ? { externalReferences: [{ type: 'distribution', url: p.resolved }] }
          : {}),
      };
    })
    .sort((a, b) => (a.purl < b.purl ? -1 : a.purl > b.purl ? 1 : 0));
  const digest = createHash('sha256')
    .update(JSON.stringify([root, components]))
    .digest('hex');
  // UUID v5-like derivado del contenido: el mismo inventario produce el mismo serialNumber.
  const uuid = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
  return {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    serialNumber: `urn:uuid:${uuid}`,
    version: 1,
    metadata: {
      tools: { components: [{ type: 'application', name: 'foker', group: '@foker' }] },
      component: {
        type: 'application',
        'bom-ref': `root:${root.name}`,
        name: root.name,
        ...(root.version ? { version: root.version } : {}),
      },
    },
    components,
  };
}
