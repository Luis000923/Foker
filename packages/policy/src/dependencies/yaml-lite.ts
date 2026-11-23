/**
 * Parser YAML mínimo y determinista para lockfiles (pnpm-lock.yaml, yarn.lock berry) y pnpm-workspace.yaml.
 * Cubre mapas y listas por bloques, mapas/listas en flujo y escalares entrecomillados. No ejecuta etiquetas,
 * anclas ni alias (se tratan como texto): la entrada no es de confianza.
 */

export type YamlValue = string | boolean | null | YamlValue[] | { [key: string]: YamlValue };
type Line = { indent: number; text: string };

const MAX_DEPTH = 64;

function stripComment(text: string): string {
  let quote = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === quote) quote = '';
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '#' && (i === 0 || text[i - 1] === ' ')) return text.slice(0, i).trimEnd();
  }
  return text.trimEnd();
}

function unquote(text: string): string {
  const t = text.trim();
  if (t.length >= 2 && t.startsWith("'") && t.endsWith("'")) return t.slice(1, -1).replace(/''/g, "'");
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) {
    try {
      return JSON.parse(t) as string;
    } catch {
      return t.slice(1, -1);
    }
  }
  return t;
}

function scalar(text: string): YamlValue {
  const t = text.trim();
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (t === '' || t === '~' || t === 'null') return null;
  if (t.startsWith('{') || t.startsWith('[')) return flow(t);
  return unquote(t);
}

/** Índice del `:` que separa clave y valor (fuera de comillas, seguido de espacio o fin). */
function keyColon(text: string): number {
  let quote = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === quote) quote = '';
    } else if ((c === '"' || c === "'") && i === 0) quote = c;
    else if (c === ':' && (i === text.length - 1 || text[i + 1] === ' ')) return i;
  }
  return -1;
}

function flow(text: string): YamlValue {
  let i = 0;
  const ws = () => {
    while (i < text.length && /\s/.test(text[i] as string)) i++;
  };
  const plain = (stops: string) => {
    if (text[i] === '"' || text[i] === "'") {
      const q = text[i] as string;
      const start = i++;
      while (i < text.length && text[i] !== q) i += text[i] === '\\' && q === '"' ? 2 : 1;
      i++;
      return unquote(text.slice(start, i));
    }
    const start = i;
    while (i < text.length && !stops.includes(text[i] as string)) {
      if (stops.includes(':') && text[i] === ':' && /[\s,}]/.test(text[i + 1] ?? ' ')) break;
      i++;
    }
    return text.slice(start, i).trim();
  };
  const value = (depth: number): YamlValue => {
    if (depth > MAX_DEPTH) throw new Error('YAML demasiado anidado');
    ws();
    if (text[i] === '{') {
      i++;
      const out: Record<string, YamlValue> = {};
      for (;;) {
        ws();
        if (text[i] === '}') {
          i++;
          return out;
        }
        const key = plain(':,}');
        ws();
        let v: YamlValue = null;
        if (text[i] === ':') {
          i++;
          v = value(depth + 1);
        }
        out[key] = v;
        ws();
        if (text[i] === ',') i++;
        else if (text[i] === '}') {
          i++;
          return out;
        } else if (i >= text.length) return out;
      }
    }
    if (text[i] === '[') {
      i++;
      const out: YamlValue[] = [];
      for (;;) {
        ws();
        if (text[i] === ']') {
          i++;
          return out;
        }
        out.push(value(depth + 1));
        ws();
        if (text[i] === ',') i++;
        else if (text[i] === ']') {
          i++;
          return out;
        } else if (i >= text.length) return out;
      }
    }
    const raw = plain(',}]');
    return raw.startsWith('"') || raw.startsWith("'") ? raw : scalar(raw);
  };
  return value(0);
}

export function parseYaml(text: string): YamlValue {
  const lines: Line[] = [];
  for (const raw of text.replace(/^﻿/, '').split(/\r?\n/)) {
    if (raw.trimStart().startsWith('#') || !raw.trim() || raw.startsWith('---')) continue;
    const content = stripComment(raw);
    if (!content.trim()) continue;
    lines.push({ indent: raw.length - raw.trimStart().length, text: content.trimStart() });
  }
  let pos = 0;
  const block = (indent: number, depth: number): YamlValue => {
    if (depth > MAX_DEPTH) throw new Error('YAML demasiado anidado');
    const first = lines[pos];
    if (!first || first.indent < indent) return null;
    if (first.text === '-' || first.text.startsWith('- ')) {
      const out: YamlValue[] = [];
      const at = first.indent;
      while (pos < lines.length && (lines[pos] as Line).indent === at) {
        const line = lines[pos] as Line;
        if (!(line.text === '-' || line.text.startsWith('- '))) break;
        const rest = line.text.slice(1).trimStart();
        if (!rest) {
          pos++;
          out.push(block(at + 1, depth + 1));
        } else if (keyColon(rest) > 0 && !rest.startsWith('{') && !rest.startsWith('[')) {
          // `- clave: valor` abre un mapa con la sangría del contenido.
          lines[pos] = { indent: at + 2, text: rest };
          out.push(block(at + 2, depth + 1));
        } else {
          pos++;
          out.push(scalar(rest));
        }
      }
      return out;
    }
    const out: Record<string, YamlValue> = {};
    const at = first.indent;
    while (pos < lines.length && (lines[pos] as Line).indent === at) {
      const line = lines[pos] as Line;
      const colon = keyColon(line.text);
      if (colon < 0) {
        pos++;
        continue;
      }
      const key = unquote(line.text.slice(0, colon));
      const rest = line.text.slice(colon + 1).trim();
      pos++;
      if (rest && rest !== '|' && rest !== '>') out[key] = scalar(rest);
      else if (pos < lines.length && (lines[pos] as Line).indent > at) out[key] = block(at + 1, depth + 1);
      else if (pos < lines.length && (lines[pos] as Line).indent === at && (lines[pos] as Line).text.startsWith('- '))
        out[key] = block(at, depth + 1);
      else out[key] = null;
    }
    return out;
  };
  const result = block(0, 0);
  return result ?? {};
}

export function asMap(value: YamlValue | undefined): Record<string, YamlValue> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
}
