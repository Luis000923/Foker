/** Contraste WCAG 2.x (sRGB relativo). Deterministas y sin dependencias. */

export const AA_TEXT = 4.5;
export const AA_UI = 3;
const BLACKISH = '#111111';
const WHITE = '#ffffff';

type Rgb = [number, number, number];

function rgb(hex: string): Rgb {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) throw new Error(`Color inválido: ${hex}`);
  return [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)) as Rgb;
}

function hex([r, g, b]: Rgb): string {
  return `#${[r, g, b]
    .map((c) =>
      Math.round(Math.min(255, Math.max(0, c)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

/** Luminancia relativa (WCAG 2.2, §1.4.3). */
export function luminance(color: string): number {
  const [r, g, b] = rgb(color).map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Ratio de contraste redondeado a 2 decimales, entre 1 y 21. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

/** Mezcla lineal en sRGB: `amount` 0 = `from`, 1 = `to`. */
export function mix(from: string, to: string, amount: number): string {
  const a = rgb(from);
  const b = rgb(to);
  return hex(a.map((c, i) => c + ((b[i] as number) - c) * amount) as Rgb);
}

/** Texto legible sobre `background`: blanco o casi negro, el de mayor contraste. */
export function readableOn(background: string): string {
  return contrastRatio(WHITE, background) >= contrastRatio(BLACKISH, background) ? WHITE : BLACKISH;
}

/**
 * Ajusta `color` hacia blanco o negro (el que aleja de `against`) en pasos de 5 % hasta alcanzar `min`.
 * Devuelve el primer color que cumple; el color original si ya cumple.
 */
export function ensureContrast(color: string, against: string, min: number): string {
  if (contrastRatio(color, against) >= min) return color;
  const target = luminance(against) > 0.5 ? '#000000' : WHITE;
  for (let step = 1; step <= 20; step++) {
    const candidate = mix(color, target, step / 20);
    if (contrastRatio(candidate, against) >= min) return candidate;
  }
  return target;
}
