import { FokerError } from '@foker/core';
import { formatIssues, type RequirementsAnswers, validate } from '@foker/schemas';
import { looksLikeInstruction, normalizeText } from './sanitize.js';

export type ProductType = NonNullable<NonNullable<RequirementsAnswers['product']>['type']>;
export type DesignStyle = NonNullable<NonNullable<RequirementsAnswers['design']>['style']>;
export type AuthMethod = NonNullable<NonNullable<NonNullable<RequirementsAnswers['architecture']>['auth']>['method']>;

export const PRODUCT_TYPES: readonly ProductType[] = [
  'landing',
  'saas',
  'ecommerce',
  'dashboard',
  'blog',
  'portfolio',
  'other',
];
export const DESIGN_STYLES: readonly DesignStyle[] = ['minimal', 'corporate', 'editorial', 'creative', 'playful'];
export const AUTH_METHODS: readonly AuthMethod[] = ['none', 'email-password', 'magic-link', 'oauth', 'sso'];

export interface Route {
  path: string;
  purpose: string;
  auth: boolean;
}
export interface Entity {
  name: string;
  fields: string[];
}
export interface Palette {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  surface: string;
  foreground: string;
}
export interface Typography {
  heading: string;
  body: string;
  mono: string;
}

/** Respuestas completas: cada campo tiene valor (del usuario o default determinista). */
export interface ResolvedRequirements {
  idea: string;
  product: { type: ProductType; audience: string; features: string[]; outOfScope: string[] };
  architecture: {
    routes: Route[];
    entities: Entity[];
    auth: { method: AuthMethod; roles: string[] };
    integrations: string[];
  };
  design: {
    style: DesignStyle;
    theme: 'light' | 'dark' | 'both';
    density: 'compact' | 'comfortable' | 'spacious';
    palette: Palette;
    typography: Typography;
  };
  constraints: {
    template: 'nextjs-turbo' | 'none';
    language: string;
    seo: boolean;
    accessibility: 'wcag-aa' | 'wcag-aaa';
    performance: { lcpMs: number; jsKb: number };
    security: string[];
  };
  /** Rutas JSON (`/product/features/0`) de valores con patrones de inyección de instrucciones. */
  flagged: string[];
}

interface ProductDefaults {
  audience: string;
  features: string[];
  outOfScope: string[];
  routes: Route[];
  entities: Entity[];
  auth: AuthMethod;
  roles: string[];
  integrations: string[];
}

const PUBLIC = false;
const PRIVATE = true;
const r = (path: string, purpose: string, auth = PUBLIC): Route => ({ path, purpose, auth });
const user: Entity = { name: 'User', fields: ['id', 'email', 'name', 'role', 'created_at'] };

/** Defaults por tipo de producto: un MVP mínimo y coherente que el usuario acepta con Enter. */
export const PRODUCT_DEFAULTS: Readonly<Record<ProductType, ProductDefaults>> = {
  landing: {
    audience: 'Visitantes que descubren el producto',
    features: ['Hero con propuesta de valor y CTA', 'Sección de beneficios', 'Formulario de contacto'],
    outOfScope: ['Cuentas de usuario', 'Pagos'],
    routes: [
      r('/', 'Propuesta de valor y CTA'),
      r('/contacto', 'Formulario de contacto'),
      r('/privacidad', 'Política de privacidad'),
    ],
    entities: [{ name: 'ContactRequest', fields: ['id', 'name', 'email', 'message', 'created_at'] }],
    auth: 'none',
    roles: [],
    integrations: [],
  },
  saas: {
    audience: 'Equipos que pagan una suscripción',
    features: ['Registro e inicio de sesión', 'Panel principal', 'Ajustes de cuenta'],
    outOfScope: ['Facturación', 'App móvil nativa'],
    routes: [
      r('/', 'Página pública con CTA de registro'),
      r('/login', 'Inicio de sesión'),
      r('/app', 'Panel principal', PRIVATE),
      r('/app/ajustes', 'Ajustes de cuenta', PRIVATE),
    ],
    entities: [user, { name: 'Workspace', fields: ['id', 'name', 'owner_id', 'created_at'] }],
    auth: 'email-password',
    roles: ['admin', 'member'],
    integrations: [],
  },
  ecommerce: {
    audience: 'Compradores en línea',
    features: ['Catálogo de productos', 'Carrito', 'Checkout'],
    outOfScope: ['Marketplace multivendedor', 'Programa de fidelización'],
    routes: [
      r('/', 'Escaparate'),
      r('/productos', 'Catálogo'),
      r('/productos/[slug]', 'Detalle de producto'),
      r('/carrito', 'Carrito'),
      r('/checkout', 'Pago', PRIVATE),
    ],
    entities: [
      { name: 'Product', fields: ['id', 'slug', 'name', 'price_cents', 'stock'] },
      { name: 'Order', fields: ['id', 'user_id', 'total_cents', 'status', 'created_at'] },
      { name: 'CartItem', fields: ['product_id', 'quantity'] },
      user,
    ],
    auth: 'email-password',
    roles: ['customer', 'admin'],
    integrations: ['Pasarela de pago'],
  },
  dashboard: {
    audience: 'Usuarios internos que consultan métricas',
    features: ['Inicio de sesión', 'Vista de KPIs', 'Filtros por fecha'],
    outOfScope: ['Edición de datos de origen', 'Exportación a PDF'],
    routes: [
      r('/login', 'Inicio de sesión'),
      r('/', 'KPIs principales', PRIVATE),
      r('/reportes', 'Reportes filtrables', PRIVATE),
      r('/ajustes', 'Ajustes', PRIVATE),
    ],
    entities: [user, { name: 'Metric', fields: ['id', 'name', 'value', 'recorded_at'] }],
    auth: 'email-password',
    roles: ['admin', 'viewer'],
    integrations: [],
  },
  blog: {
    audience: 'Lectores del contenido',
    features: ['Listado de artículos', 'Artículo individual', 'Etiquetas'],
    outOfScope: ['Comentarios', 'Editor en línea'],
    routes: [
      r('/', 'Últimos artículos'),
      r('/posts/[slug]', 'Artículo'),
      r('/etiquetas/[tag]', 'Artículos por etiqueta'),
    ],
    entities: [
      { name: 'Post', fields: ['id', 'slug', 'title', 'body', 'published_at'] },
      { name: 'Tag', fields: ['id', 'name'] },
    ],
    auth: 'none',
    roles: [],
    integrations: [],
  },
  portfolio: {
    audience: 'Clientes y reclutadores',
    features: ['Presentación personal', 'Galería de proyectos', 'Contacto'],
    outOfScope: ['Blog', 'Tienda'],
    routes: [
      r('/', 'Presentación'),
      r('/proyectos', 'Proyectos'),
      r('/proyectos/[slug]', 'Detalle de proyecto'),
      r('/contacto', 'Contacto'),
    ],
    entities: [{ name: 'Project', fields: ['id', 'slug', 'title', 'summary', 'url'] }],
    auth: 'none',
    roles: [],
    integrations: [],
  },
  other: {
    audience: 'Usuarios de la aplicación',
    features: ['Página principal'],
    outOfScope: [],
    routes: [r('/', 'Página principal')],
    entities: [],
    auth: 'none',
    roles: [],
    integrations: [],
  },
};

/** Paletas claras por estilo; todas cumplen WCAG AA (texto 4,5:1) sin ajustes. */
export const STYLE_PALETTES: Readonly<Record<DesignStyle, Palette>> = {
  minimal: {
    primary: '#2563eb',
    secondary: '#475569',
    accent: '#0d9488',
    background: '#ffffff',
    surface: '#f8fafc',
    foreground: '#0f172a',
  },
  corporate: {
    primary: '#1d4ed8',
    secondary: '#334155',
    accent: '#b45309',
    background: '#ffffff',
    surface: '#f1f5f9',
    foreground: '#0f172a',
  },
  editorial: {
    primary: '#9f1239',
    secondary: '#44403c',
    accent: '#1e40af',
    background: '#fffdf8',
    surface: '#f5f5f4',
    foreground: '#1c1917',
  },
  creative: {
    primary: '#7c3aed',
    secondary: '#be185d',
    accent: '#0e7490',
    background: '#ffffff',
    surface: '#faf5ff',
    foreground: '#18181b',
  },
  playful: {
    primary: '#c2410c',
    secondary: '#7e22ce',
    accent: '#047857',
    background: '#fffbeb',
    surface: '#fef3c7',
    foreground: '#1c1917',
  },
};

const SANS = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';
/** Pares tipográficos recomendados por estilo, siempre con pila de respaldo del sistema. */
export const STYLE_TYPOGRAPHY: Readonly<Record<DesignStyle, Typography>> = {
  minimal: { heading: `Inter, ${SANS}`, body: `Inter, ${SANS}`, mono: MONO },
  corporate: { heading: `IBM Plex Sans, ${SANS}`, body: `IBM Plex Sans, ${SANS}`, mono: `IBM Plex Mono, ${MONO}` },
  editorial: { heading: 'Source Serif 4, Georgia, Times New Roman, serif', body: `Source Sans 3, ${SANS}`, mono: MONO },
  creative: { heading: `Space Grotesk, ${SANS}`, body: `Inter, ${SANS}`, mono: `JetBrains Mono, ${MONO}` },
  playful: { heading: `Nunito, ${SANS}`, body: `Nunito, ${SANS}`, mono: MONO },
};

/** Valida contra `requirements-answers` y completa con defaults. Lanza FKR-INP-001 si el esquema falla. */
export function resolveRequirements(input: unknown): ResolvedRequirements {
  const result = validate<RequirementsAnswers>('requirements-answers', input);
  if (!result.ok) throw new FokerError('FKR-INP-001', `Respuestas inválidas: ${formatIssues(result.issues)}`);
  const a = result.value;
  const flagged: string[] = [];
  const text = (value: string | undefined, fallback: string, pointer: string, max = 200) => {
    if (value === undefined) return fallback;
    if (looksLikeInstruction(value)) flagged.push(pointer);
    return normalizeText(value, max) || fallback;
  };
  const list = (values: string[] | undefined, fallback: string[], pointer: string) =>
    values === undefined
      ? [...fallback]
      : [...new Set(values.map((v, i) => text(v, '', `${pointer}/${i}`)).filter(Boolean))];

  const type = a.product?.type ?? 'other';
  const defaults = PRODUCT_DEFAULTS[type];
  const style = a.design?.style ?? 'minimal';
  const routes = a.architecture?.routes?.length
    ? a.architecture.routes.map((route, i) => ({
        path: route.path,
        purpose: text(route.purpose, 'Por definir', `/architecture/routes/${i}/purpose`),
        auth: route.auth ?? false,
      }))
    : defaults.routes.map((route) => ({ ...route }));
  const seenRoutes = new Set<string>();
  for (const route of routes) {
    if (seenRoutes.has(route.path)) throw new FokerError('FKR-INP-001', `Ruta duplicada: ${route.path}`);
    seenRoutes.add(route.path);
  }
  const entities = (a.architecture?.entities ?? defaults.entities).map((e) => ({
    name: e.name,
    fields: [...(e.fields?.length ? e.fields : ['id'])],
  }));
  // Rutas privadas sin método explícito: email-password, el default más simple con sesión.
  const method =
    a.architecture?.auth?.method ??
    (defaults.auth === 'none' && routes.some((route) => route.auth) ? 'email-password' : defaults.auth);
  const roles =
    method === 'none' ? [] : [...(a.architecture?.auth?.roles ?? (defaults.roles.length ? defaults.roles : ['user']))];
  if (method === 'none' && routes.some((route) => route.auth))
    throw new FokerError('FKR-INP-001', 'Hay rutas con auth: true pero architecture.auth.method es none.');

  const paletteDefaults = STYLE_PALETTES[style];
  const typographyDefaults = STYLE_TYPOGRAPHY[style];
  const lower = (value: string | undefined, fallback: string) => (value ?? fallback).toLowerCase();
  const palette: Palette = {
    primary: lower(a.design?.palette?.primary, paletteDefaults.primary),
    secondary: lower(a.design?.palette?.secondary, paletteDefaults.secondary),
    accent: lower(a.design?.palette?.accent, paletteDefaults.accent),
    background: lower(a.design?.palette?.background, paletteDefaults.background),
    surface: lower(a.design?.palette?.surface, paletteDefaults.surface),
    foreground: lower(a.design?.palette?.foreground, paletteDefaults.foreground),
  };

  const idea = text(a.idea, '', '/idea', 500);
  if (!idea) throw new FokerError('FKR-INP-001', 'La idea principal no puede estar vacía.');
  return {
    idea,
    product: {
      type,
      audience: text(a.product?.audience, defaults.audience, '/product/audience'),
      features: list(a.product?.features, defaults.features, '/product/features'),
      outOfScope: list(a.product?.out_of_scope, defaults.outOfScope, '/product/out_of_scope'),
    },
    architecture: {
      routes,
      entities,
      auth: { method, roles },
      integrations: list(a.architecture?.integrations, defaults.integrations, '/architecture/integrations'),
    },
    design: {
      style,
      theme: a.design?.theme ?? 'both',
      density: a.design?.density ?? 'comfortable',
      palette,
      typography: {
        heading: a.design?.typography?.heading ?? typographyDefaults.heading,
        body: a.design?.typography?.body ?? typographyDefaults.body,
        mono: a.design?.typography?.mono ?? typographyDefaults.mono,
      },
    },
    constraints: {
      template: a.constraints?.template ?? 'nextjs-turbo',
      language: a.constraints?.language ?? 'es',
      seo: a.constraints?.seo ?? type !== 'dashboard',
      accessibility: a.constraints?.accessibility ?? 'wcag-aa',
      performance: {
        lcpMs: a.constraints?.performance?.lcp_ms ?? 2500,
        jsKb: a.constraints?.performance?.js_kb ?? 200,
      },
      security: list(a.constraints?.security, [], '/constraints/security'),
    },
    flagged,
  };
}
