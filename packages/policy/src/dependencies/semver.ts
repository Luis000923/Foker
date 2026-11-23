/** Subconjunto determinista de semver para waivers y versiones mayores (sin dependencias externas). */

export interface SemVer {
  major: number;
  minor: number;
  patch: number;
  pre: string;
}

const VERSION = /^v?(\d+)(?:\.(\d+|[xX*]))?(?:\.(\d+|[xX*]))?(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

export function parseVersion(text: string): SemVer | null {
  const m = VERSION.exec(text.trim());
  if (!m) return null;
  const num = (v: string | undefined) => (v === undefined || /[xX*]/.test(v) ? 0 : Number(v));
  return { major: Number(m[1]), minor: num(m[2]), patch: num(m[3]), pre: m[4] ?? '' };
}

export function compare(a: SemVer, b: SemVer): number {
  for (const key of ['major', 'minor', 'patch'] as const) if (a[key] !== b[key]) return a[key] < b[key] ? -1 : 1;
  if (a.pre === b.pre) return 0;
  if (!a.pre) return 1;
  if (!b.pre) return -1;
  return a.pre < b.pre ? -1 : 1;
}

/** Ordena versiones de menor a mayor; las no semver quedan al final por orden léxico. */
export function sortVersions(versions: Iterable<string>): string[] {
  return [...versions].sort((x, y) => {
    const a = parseVersion(x);
    const b = parseVersion(y);
    if (a && b) return compare(a, b) || (x < y ? -1 : x > y ? 1 : 0);
    if (a) return -1;
    if (b) return 1;
    return x < y ? -1 : x > y ? 1 : 0;
  });
}

export function majorOf(version: string): number | null {
  return parseVersion(version)?.major ?? null;
}

type Comparator = (v: SemVer) => boolean;

function partial(text: string): { v: SemVer; parts: number } | null {
  const m = VERSION.exec(text.trim());
  if (!m) return null;
  const parts = [m[1], m[2], m[3]].filter((p) => p !== undefined && !/[xX*]/.test(p)).length;
  return { v: parseVersion(text) as SemVer, parts };
}

function comparator(token: string): Comparator | null {
  if (token === '*' || token === '' || /^[xX]$/.test(token)) return () => true;
  const m = /^(\^|~|>=|<=|>|<|=)?(.+)$/.exec(token);
  if (!m) return null;
  const op = m[1] ?? '';
  const p = partial(m[2] as string);
  if (!p) return null;
  const { v, parts } = p;
  const ge = (x: SemVer) => compare(x, v) >= 0;
  if (op === '>=') return ge;
  if (op === '>') return (x) => compare(x, v) > 0;
  if (op === '<=') return (x) => compare(x, v) <= 0;
  if (op === '<') return (x) => compare(x, v) < 0;
  const upper = (u: SemVer) => (x: SemVer) => ge(x) && compare(x, u) < 0;
  if (op === '^') {
    if (v.major > 0 || parts === 1) return upper({ major: v.major + 1, minor: 0, patch: 0, pre: '' });
    if (v.minor > 0 || parts === 2) return upper({ major: 0, minor: v.minor + 1, patch: 0, pre: '' });
    return upper({ major: 0, minor: 0, patch: v.patch + 1, pre: '' });
  }
  if (op === '~' || parts < 3) {
    if (parts === 1) return upper({ major: v.major + 1, minor: 0, patch: 0, pre: '' });
    return upper({ major: v.major, minor: v.minor + 1, patch: 0, pre: '' });
  }
  return (x) => compare(x, v) === 0;
}

/** `version` cumple `range` (`*`, exacta, `^`, `~`, comparadores, `||`, guiones `a - b`). Rango inválido: false. */
export function satisfies(version: string, range: string): boolean {
  const v = parseVersion(version);
  if (!v) return range.trim() === version.trim() || range.trim() === '*';
  return range.split('||').some((alternative) => {
    const text = alternative.trim().replace(/^(\S+)\s+-\s+(\S+)$/, '>=$1 <=$2');
    const tokens = text.replace(/(>=|<=|>|<|=|\^|~)\s+/g, '$1').split(/\s+/);
    const comparators = tokens.map(comparator);
    return comparators.every((c) => c !== null) && comparators.every((c) => (c as Comparator)(v));
  });
}

/** El especificador es un rango semver válido (no una dist-tag ni una URL). */
export function isRange(spec: string): boolean {
  return spec.split('||').every((alt) =>
    alt
      .trim()
      .replace(/^(\S+)\s+-\s+(\S+)$/, '>=$1 <=$2')
      .replace(/(>=|<=|>|<|=|\^|~)\s+/g, '$1')
      .split(/\s+/)
      .every((t) => comparator(t) !== null),
  );
}
