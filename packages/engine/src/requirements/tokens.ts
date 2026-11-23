import { type DesignTokens, validate } from '@foker/schemas';
import { AA_TEXT, AA_UI, contrastRatio, ensureContrast, mix, readableOn } from './contrast.js';
import type { Palette, ResolvedRequirements } from './model.js';

type Scheme = DesignTokens['colors']['light'];

export interface ContrastCheck {
  mode: 'light' | 'dark';
  pair: string;
  ratio: number;
  min: number;
  pass: boolean;
}
export interface ColorAdjustment {
  mode: 'light' | 'dark';
  token: string;
  from: string;
  to: string;
}
export interface TokenBuild {
  tokens: DesignTokens;
  checks: ContrastCheck[];
  adjustments: ColorAdjustment[];
}

const DARK_BASE = { background: '#0b0f19', surface: '#111827', foreground: '#f3f4f6' };
const SPACING: Record<ResolvedRequirements['design']['density'], number> = {
  compact: 0.2,
  comfortable: 0.25,
  spacious: 0.3,
};
const RADIUS: Record<ResolvedRequirements['design']['style'], [number, number, number]> = {
  minimal: [0.25, 0.5, 0.75],
  corporate: [0.125, 0.25, 0.5],
  editorial: [0, 0.125, 0.25],
  creative: [0.5, 0.75, 1],
  playful: [0.5, 1, 1.5],
};
const rem = (value: number) => `${Number(value.toFixed(4))}rem`;

/** Pares de contraste que exige WCAG AA: texto 4,5:1 y componentes de interfaz 3:1 (§1.4.11). */
const PAIRS: [fg: keyof Scheme, bg: keyof Scheme, min: number][] = [
  ['foreground', 'background', AA_TEXT],
  ['foreground', 'surface', AA_TEXT],
  ['muted_foreground', 'background', AA_TEXT],
  ['muted_foreground', 'muted', AA_TEXT],
  ['primary_foreground', 'primary', AA_TEXT],
  ['secondary_foreground', 'secondary', AA_TEXT],
  ['accent_foreground', 'accent', AA_TEXT],
  ['primary', 'background', AA_UI],
  ['danger', 'background', AA_TEXT],
];

/**
 * Esquema de color completo y accesible. Los colores del usuario solo cambian si no alcanzan el
 * mínimo; cada cambio queda registrado en `adjustments` (nunca silencioso).
 */
function scheme(mode: 'light' | 'dark', palette: Palette, adjustments: ColorAdjustment[]): Scheme {
  const adjust = (token: string, color: string, against: string, min: number) => {
    const next = ensureContrast(color, against, min);
    if (next !== color) adjustments.push({ mode, token, from: color, to: next });
    return next;
  };
  const background = palette.background;
  const surface = palette.surface;
  const foreground = adjust(
    'foreground',
    adjust('foreground', palette.foreground, background, AA_TEXT),
    surface,
    AA_TEXT,
  );
  const muted = surface;
  const mutedForeground = ensureContrast(
    ensureContrast(mix(foreground, background, 0.35), background, AA_TEXT),
    muted,
    AA_TEXT,
  );
  // Colores de marca usados como fondo de botón: su texto debe ser legible.
  const brand = (token: 'primary' | 'secondary' | 'accent', minAgainstBackground = 0) => {
    let color = palette[token];
    if (minAgainstBackground) color = adjust(token, color, background, minAgainstBackground);
    const text = readableOn(color);
    color = adjust(token, color, text, AA_TEXT);
    return [color, readableOn(color)] as const;
  };
  const [primary, primaryForeground] = brand('primary', AA_UI);
  const [secondary, secondaryForeground] = brand('secondary');
  const [accent, accentForeground] = brand('accent');
  return {
    background,
    foreground,
    surface,
    primary,
    primary_foreground: primaryForeground,
    secondary,
    secondary_foreground: secondaryForeground,
    accent,
    accent_foreground: accentForeground,
    muted,
    muted_foreground: mutedForeground,
    border: mix(background, foreground, mode === 'light' ? 0.15 : 0.25),
    danger: ensureContrast(mode === 'light' ? '#b91c1c' : '#f87171', background, AA_TEXT),
  };
}

/** Paleta oscura derivada: fondos neutros y colores de marca aclarados hasta ser legibles. */
function darkPalette(light: Palette): Palette {
  const lift = (color: string) => ensureContrast(color, DARK_BASE.background, AA_TEXT);
  return {
    ...DARK_BASE,
    primary: lift(light.primary),
    secondary: lift(light.secondary),
    accent: lift(light.accent),
  };
}

function checksFor(mode: 'light' | 'dark', colors: Scheme): ContrastCheck[] {
  return PAIRS.map(([fg, bg, min]) => {
    const ratio = contrastRatio(colors[fg] as string, colors[bg] as string);
    return { mode, pair: `${fg}/${bg}`, ratio, min, pass: ratio >= min };
  });
}

/** Design Tokens v1 (`design-tokens.schema.json`) a partir de las respuestas resueltas. */
export function buildDesignTokens(name: string, req: ResolvedRequirements): TokenBuild {
  const adjustments: ColorAdjustment[] = [];
  const { theme, palette, typography, density, style } = req.design;
  // Un tema único repite el mismo esquema en light y dark. El oscuro derivado solo registra ajustes
  // cuando es el tema elegido: si no, sus colores son de Foker, no del usuario.
  const derived: ColorAdjustment[] = [];
  const darkScheme = scheme('dark', darkPalette(palette), theme === 'dark' ? adjustments : derived);
  const lightScheme = theme === 'dark' ? darkScheme : scheme('light', palette, adjustments);
  const colors = { light: lightScheme, dark: theme === 'light' ? lightScheme : darkScheme };
  const unit = SPACING[density];
  const [sm, md, lg] = RADIUS[style];
  const tokens: DesignTokens = {
    schema_version: 1,
    name,
    typography: {
      font_sans: typography.body,
      font_heading: typography.heading,
      font_mono: typography.mono,
      scale: {
        xs: '0.75rem',
        sm: '0.875rem',
        base: '1rem',
        lg: '1.125rem',
        xl: '1.25rem',
        '2xl': '1.5rem',
        '3xl': '1.875rem',
      },
      line_height: { tight: 1.25, normal: 1.5, relaxed: 1.75 },
    },
    colors,
    spacing: Object.fromEntries(
      ['1', '2', '3', '4', '6', '8'].map((k) => [k, rem(Number(k) * unit)]),
    ) as DesignTokens['spacing'],
    radius: { sm: rem(sm), md: rem(md), lg: rem(lg) },
  };
  const result = validate<DesignTokens>('design-tokens', tokens);
  if (!result.ok)
    throw new Error(`Design Tokens generados inválidos: ${result.issues.map((i) => i.message).join('; ')}`);
  const checks = [
    ...(theme === 'dark' ? [] : checksFor('light', colors.light)),
    ...(theme === 'light' ? [] : checksFor('dark', colors.dark)),
  ];
  return { tokens: result.value, checks, adjustments };
}
