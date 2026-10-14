import type { DesignTokens } from '@foker/schemas';

const vars = (prefix: string, values: Record<string, string>) =>
  Object.entries(values).map(([k, v]) => `  --${prefix}-${k.replaceAll('_', '-')}: ${v};`);

const scheme = (colors: DesignTokens['colors']['light']) => vars('color', colors);

/** CSS determinista: variables claras, modo oscuro por `prefers-color-scheme` y `[data-theme]`. */
export function renderTokensCss(tokens: DesignTokens): string {
  const { typography: t } = tokens;
  const base = [
    `  --font-sans: ${t.font_sans};`,
    `  --font-mono: ${t.font_mono};`,
    ...vars('text', t.scale),
    ...vars('leading', Object.fromEntries(Object.entries(t.line_height).map(([k, v]) => [k, String(v)]))),
    ...vars('space', tokens.spacing),
    ...vars('radius', tokens.radius),
  ];
  const dark = scheme(tokens.colors.dark).map((l) => `  ${l}`);
  return [
    `/* Generado por foker init desde el preset "${tokens.name}". Edita foker/design-tokens.json y regenera. */`,
    ':root {',
    ...base,
    ...scheme(tokens.colors.light),
    '}',
    '@media (prefers-color-scheme: dark) {',
    '  :root:not([data-theme="light"]) {',
    ...dark,
    '  }',
    '}',
    ':root[data-theme="dark"] {',
    ...scheme(tokens.colors.dark),
    '}',
    '',
  ].join('\n');
}
