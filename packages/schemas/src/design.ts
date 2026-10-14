import { readdirSync, readFileSync } from 'node:fs';
import type { DesignTokens } from './generated/types.js';
import { validate } from './validate.js';

const PRESETS_DIR = new URL('../data/design-presets/', import.meta.url);

/** Nombres de los presets de Design Tokens incluidos, en orden alfabético. */
export function designPresetNames(): string[] {
  return readdirSync(PRESETS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.slice(0, -5))
    .sort();
}

/** Devuelve un preset validado, o `undefined` si no existe. Lanza si el preset incluido es inválido. */
export function designPreset(name: string): DesignTokens | undefined {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name) || !designPresetNames().includes(name)) return undefined;
  const result = validate<DesignTokens>(
    'design-tokens',
    JSON.parse(readFileSync(new URL(`${name}.json`, PRESETS_DIR), 'utf8')),
  );
  if (!result.ok) throw new Error(`Preset de diseño inválido: ${name}`);
  return result.value;
}
