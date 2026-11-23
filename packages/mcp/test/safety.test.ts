import { describe, expect, it } from 'vitest';
import { sanitize } from '../src/safety.js';

describe('sanitize', () => {
  it('conserva Date y RegExp', () => {
    const date = new Date('2026-01-02T03:04:05.000Z');
    const out = sanitize({ when: date, pattern: /ab+c/gi });
    expect(out.when).toBeInstanceOf(Date);
    expect(out.when.toISOString()).toBe('2026-01-02T03:04:05.000Z');
    expect(out.pattern).toBeInstanceOf(RegExp);
    expect(out.pattern.source).toBe('ab+c');
    expect(out.pattern.flags).toBe('gi');
  });

  it('conserva Map, Set, Error y Uint8Array', () => {
    const out = sanitize({
      map: new Map([['k', 'v']]),
      set: new Set([1, 2]),
      error: new TypeError('fallo'),
      bytes: new Uint8Array([1, 2, 3]),
    });
    expect(out.map).toBeInstanceOf(Map);
    expect(out.map.get('k')).toBe('v');
    expect(out.set).toBeInstanceOf(Set);
    expect([...out.set]).toEqual([1, 2]);
    expect(out.error).toBeInstanceOf(Error);
    expect(out.error.message).toBe('fallo');
    expect(out.error.name).toBe('TypeError');
    expect(out.bytes).toBeInstanceOf(Uint8Array);
    expect([...out.bytes]).toEqual([1, 2, 3]);
  });

  it('no desborda la pila con objetos cíclicos', () => {
    const node: Record<string, unknown> = { name: 'a' };
    node['self'] = node;
    const list: unknown[] = [];
    list.push(list);
    let out: Record<string, unknown> | undefined;
    expect(() => {
      out = sanitize(node);
    }).not.toThrow();
    expect(out?.['self']).toBe('[Circular]');
    expect(sanitize(list)).toEqual(['[Circular]']);
  });

  it('copia referencias compartidas no cíclicas', () => {
    const shared = { x: 1 };
    expect(sanitize({ a: shared, b: shared })).toEqual({ a: { x: 1 }, b: { x: 1 } });
  });

  it('sigue redactando secretos en claves y valores', () => {
    const secret = `ghp_${'a1B2'.repeat(9)}`;
    const out = JSON.stringify(sanitize({ token: secret, nested: [secret] }));
    expect(out).not.toContain(secret);
  });
});
