import { existsSync } from 'node:fs';
import { lstat, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  AUTH_METHODS,
  DESIGN_STYLES,
  FokerError,
  PRODUCT_DEFAULTS,
  PRODUCT_TYPES,
  type ProductType,
  planRequirements,
  REQUIREMENTS_FILE,
  type RequirementsFile,
  type RequirementsPlan,
  STYLE_PALETTES,
  STYLE_TYPOGRAPHY,
  writeFileAtomic,
} from '@foker/engine';
import type { RequirementsAnswers } from '@foker/schemas';
import { parse } from 'yaml';
import { type Command, type Context, flag, type Message } from '../types.js';

const MAX_ANSWERS_BYTES = 256 * 1024;

/** Lee `--answers` (JSON o YAML). Es un dato no confiable: tamaño acotado, solo archivos regulares. */
export async function readAnswersFile(cwd: string, path: string): Promise<unknown> {
  const absolute = resolve(cwd, path);
  const info = await lstat(absolute).catch(() => {
    throw new FokerError('FKR-INP-001', `No se puede leer ${path}`);
  });
  if (!info.isFile()) throw new FokerError('FKR-INP-001', `${path} no es un archivo regular`);
  if (info.size > MAX_ANSWERS_BYTES) throw new FokerError('FKR-INP-001', `${path} supera ${MAX_ANSWERS_BYTES} bytes`);
  try {
    // YAML 1.2 es superconjunto de JSON; sin etiquetas personalizadas ni alias ilimitados.
    return parse(await readFile(absolute, 'utf8'), { maxAliasCount: 0, customTags: [] });
  } catch (error) {
    throw new FokerError('FKR-INP-001', `${path}: ${(error as Error).message}`);
  }
}

type Ask = (message: string) => Promise<string>;
const list = (value: string) =>
  value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

/** Pregunta con default visible: Enter lo acepta. Reintenta 3 veces si `check` rechaza la respuesta. */
async function question<T>(
  ask: Ask,
  display: (text: string) => void,
  label: string,
  fallback: string,
  check: (answer: string) => T | undefined,
): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const raw = (await ask(`${label}${fallback ? ` [${fallback}]` : ''}: `)).trim();
    const value = check(raw || fallback);
    if (value !== undefined) return value;
    display(`  Valor no válido: ${raw || '(vacío)'}\n`);
  }
  const value = check(fallback);
  if (value === undefined) throw new FokerError('FKR-INP-001', `Sin respuesta válida para «${label}»`);
  return value;
}
const oneOf =
  <T extends string>(options: readonly T[]) =>
  (answer: string) =>
    (options as readonly string[]).includes(answer) ? (answer as T) : undefined;
const hex = (answer: string) => (/^#[0-9a-fA-F]{6}$/.test(answer) ? answer.toLowerCase() : undefined);
const yesNo = (answer: string) =>
  /^(s|si|sí|y|yes)$/i.test(answer) ? true : /^(n|no)$/i.test(answer) ? false : undefined;
const ROUTE =
  /^\/(?:(?:[a-z0-9]+(?:-[a-z0-9]+)*|\[[a-z][a-z0-9-]*\])(?:\/(?:[a-z0-9]+(?:-[a-z0-9]+)*|\[[a-z][a-z0-9-]*\]))*)?$/;
const FONT = /^[A-Za-z0-9 ,'"-]{1,200}$/;

/**
 * Entrevista corta en 4 bloques con defaults inteligentes. No escribe nada: devuelve respuestas
 * que el esquema valida después. Un Ctrl+C rechaza la promesa sin efectos.
 */
/** Forma de `requirements-answers`; el esquema la valida después (los tipos generados usan tuplas por maxItems). */
export type InterviewAnswers = Pick<RequirementsAnswers, 'schema_version' | 'idea'> & Record<string, unknown>;

export async function interview(ask: Ask, display: (text: string) => void): Promise<InterviewAnswers> {
  const q = <T>(label: string, fallback: string, check: (a: string) => T | undefined) =>
    question(ask, display, label, fallback, check);
  display('\nAsistente de requisitos de Foker. Enter acepta el valor entre corchetes; Ctrl+C cancela sin escribir.\n');
  display('\n1/4 Propósito y alcance\n');
  const idea = await q('Idea principal en 1–2 frases', '', (a) => (a.length >= 3 && a.length <= 500 ? a : undefined));
  const type = await q<ProductType>(`Tipo (${PRODUCT_TYPES.join('/')})`, 'other', oneOf(PRODUCT_TYPES));
  const d = PRODUCT_DEFAULTS[type];
  const audience = await q('Público objetivo', d.audience, (a) => a.slice(0, 200));
  const features = await q('Funcionalidades MVP (separadas por comas)', d.features.join(', '), (a) =>
    list(a).slice(0, 20),
  );
  const outOfScope = await q('Fuera de alcance (comas, «-» para ninguno)', d.outOfScope.join(', ') || '-', (a) =>
    a === '-' ? [] : list(a).slice(0, 20),
  );

  display('\n2/4 Arquitectura funcional\n');
  const paths = await q(
    'Rutas (comas; prefijo «*» = requiere sesión)',
    d.routes.map((r) => `${r.auth ? '*' : ''}${r.path}`).join(', '),
    (a) => {
      const items = list(a).map((p) => ({ path: p.replace(/^\*/, ''), auth: p.startsWith('*') }));
      return items.length && items.length <= 30 && items.every((i) => ROUTE.test(i.path)) ? items : undefined;
    },
  );
  const routes = paths.map((r) => ({
    ...r,
    purpose: d.routes.find((x) => x.path === r.path)?.purpose ?? 'Por definir',
  }));
  const method = await q(
    `Autenticación (${AUTH_METHODS.join('/')})`,
    paths.some((r) => r.auth) && d.auth === 'none' ? 'email-password' : d.auth,
    oneOf(AUTH_METHODS),
  );
  const roles =
    method === 'none'
      ? []
      : await q('Roles (comas)', (d.roles.length ? d.roles : ['user']).join(', '), (a) => {
          const items = list(a);
          return items.length <= 10 && items.every((r) => /^[a-z][a-z0-9-]{0,31}$/.test(r)) ? items : undefined;
        });
  const integrations = await q(
    'Integraciones externas (comas, «-» para ninguna)',
    d.integrations.join(', ') || '-',
    (a) => (a === '-' ? [] : list(a).slice(0, 20)),
  );

  display('\n3/4 Identidad visual\n');
  const style = await q(`Estilo (${DESIGN_STYLES.join('/')})`, 'minimal', oneOf(DESIGN_STYLES));
  const p = STYLE_PALETTES[style];
  const t = STYLE_TYPOGRAPHY[style];
  const theme = await q('Tema (light/dark/both)', 'both', oneOf(['light', 'dark', 'both'] as const));
  const primary = await q('Color primario (#rrggbb)', p.primary, hex);
  const secondary = await q('Color secundario', p.secondary, hex);
  const accent = await q('Color de acento', p.accent, hex);
  const background = await q('Fondo', p.background, hex);
  const surface = await q('Superficie', p.surface, hex);
  const heading = await q('Tipografía de encabezados', t.heading, (a) => (FONT.test(a) ? a : undefined));
  const body = await q('Tipografía de cuerpo', t.body, (a) => (FONT.test(a) ? a : undefined));
  const density = await q(
    'Densidad (compact/comfortable/spacious)',
    'comfortable',
    oneOf(['compact', 'comfortable', 'spacious'] as const),
  );

  display('\n4/4 Restricciones técnicas\n');
  const language = await q('Idioma de la interfaz (es, en, pt-BR…)', 'es', (a) =>
    /^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(a) ? a : undefined,
  );
  const seo = await q('¿SEO técnico? (s/n)', type === 'dashboard' ? 'n' : 's', yesNo);

  return {
    schema_version: 1,
    idea,
    product: { type, audience, features, out_of_scope: outOfScope },
    architecture: { routes, auth: { method, roles }, integrations },
    design: {
      style,
      theme,
      density,
      palette: { primary, secondary, accent, background, surface },
      typography: { heading, body, mono: t.mono },
    },
    constraints: { language, seo },
  };
}

export interface SpecTarget {
  name: string;
  appDir: string;
  cssPath: string;
  template: 'nextjs-turbo' | 'none';
}
export interface SpecOutcome {
  plan?: RequirementsPlan;
  /** Archivos a escribir (sin los conflictos rechazados). */
  files: RequirementsFile[];
  warnings: Message[];
  skipped?: string;
}

/** Destino por defecto: la app de la plantilla si existe; si no, tokens CSS dentro de foker/ (no toca código ajeno). */
export function specTarget(root: string, name: string, template: boolean): SpecTarget {
  if (template || existsSync(join(root, 'apps/web/app')))
    return { name, appDir: 'apps/web', cssPath: 'apps/web/app/tokens.css', template: 'nextjs-turbo' };
  return { name, appDir: '.', cssPath: 'foker/tokens.css', template: 'none' };
}

/**
 * Obtiene respuestas (archivo, entrevista o nada) y calcula el plan. Nunca se cuelga sin TTY:
 * sin `--answers` en modo no interactivo se omite con un aviso.
 */
export async function collectSpec(ctx: Context, root: string, target: SpecTarget): Promise<SpecOutcome> {
  const warnings: Message[] = [];
  const answersFlag = String(ctx.flags['answers'] ?? '');
  let answers: unknown;
  if (answersFlag) answers = await readAnswersFile(ctx.cwd, answersFlag);
  else if (ctx.nonInteractive || !ctx.prompt) {
    const skipped =
      'Asistente de requisitos omitido: terminal no interactiva. Usa --answers <archivo> o ejecuta foker spec en un TTY.';
    return {
      files: [],
      warnings: [{ code: 'FKR-INP-001', message: skipped, hint: 'foker spec --answers answers.json' }],
      skipped,
    };
  } else answers = await interview(ctx.prompt, ctx.display);
  // La plantilla elegida en init manda sobre la de las respuestas.
  if (answers && typeof answers === 'object' && !Array.isArray(answers)) {
    const record = answers as Record<string, unknown>;
    const constraints = (record['constraints'] ?? {}) as Record<string, unknown>;
    if (typeof constraints === 'object' && constraints && !Array.isArray(constraints))
      record['constraints'] = { ...constraints, template: target.template };
  }
  const plan = await planRequirements(root, answers, target);
  for (const pointer of plan.resolved.flagged)
    warnings.push({
      code: 'FKR-INP-001',
      message: `${pointer}: texto con forma de instrucción; se guarda como dato y se marca para revisión.`,
    });
  for (const a of plan.build.adjustments)
    warnings.push({ code: 'FKR-INP-001', message: `Contraste WCAG AA: ${a.mode} ${a.token} ${a.from} → ${a.to}` });

  const force = Boolean(ctx.flags['force']);
  const files: RequirementsFile[] = [];
  for (const file of plan.files) {
    if (!file.conflict || force) files.push(file);
    else if (
      !ctx.nonInteractive &&
      ctx.confirm &&
      (await ctx.confirm(`${file.path} ya existe y cambiaría. ¿Sobrescribir? [s/N] `))
    )
      files.push(file);
    else
      throw new FokerError(
        'FKR-INP-001',
        `${file.path} ya existe con otro contenido; usa --force para sobrescribir (se guarda copia en .foker/backups/).`,
      );
  }
  return { plan, files, warnings };
}

/** Escribe con respaldo previo de cada archivo que cambia. Todo atómico: Ctrl+C no deja archivos a medias. */
export async function writeSpec(root: string, files: RequirementsFile[], stamp = new Date()): Promise<string[]> {
  const backupDir = `.foker/backups/${stamp.toISOString().replace(/[:.]/g, '-')}`;
  for (const file of files.filter((f) => f.conflict)) {
    const previous = await readFile(join(root, file.path), 'utf8');
    await writeFileAtomic(root, `${backupDir}/${file.path}`, previous);
  }
  const written: string[] = [];
  for (const file of files) {
    await writeFileAtomic(root, file.path, file.content);
    written.push(file.path);
  }
  return written;
}

export const specFlags = [
  flag('answers', 'string', 'Respuestas del asistente de requisitos (JSON o YAML); evita preguntas'),
];

export const specCommand: Command = {
  name: 'spec',
  description: 'Asistente de requisitos: genera REQUIREMENTS.md y Design Tokens desde una entrevista o --answers',
  maxArgs: 1,
  flags: [
    ...specFlags,
    flag('force', 'boolean', 'Sobrescribe REQUIREMENTS.md y tokens existentes (con copia en .foker/backups/)'),
  ],
  async run(ctx) {
    const root = resolve(ctx.cwd, ctx.args[0] ?? '.');
    if (!existsSync(root)) throw new FokerError('FKR-CFG-002', `No existe el directorio ${root}`);
    const pkg = await readFile(join(root, 'package.json'), 'utf8')
      .then((t) => JSON.parse(t) as { name?: unknown })
      .catch(() => ({}) as { name?: unknown });
    const name = typeof pkg.name === 'string' ? pkg.name : root.split(/[\\/]/).pop() || 'app';
    const outcome = await collectSpec(ctx, root, specTarget(root, name, false));
    if (outcome.skipped)
      return {
        data: { skipped: true, files: [] },
        warnings: outcome.warnings,
        human: `${outcome.skipped}\n`,
        exitCode: 0,
      };
    const dryRun = Boolean(ctx.flags['dry-run']);
    const files = dryRun ? outcome.files.map((f) => f.path) : await writeSpec(root, outcome.files);
    const readme = existsSync(join(root, 'README.md'))
      ? (await readFile(join(root, 'README.md'), 'utf8')).includes(REQUIREMENTS_FILE)
      : true;
    const warnings = [...outcome.warnings];
    if (!readme)
      warnings.push({
        code: 'FKR-INP-001',
        message: 'README.md no enlaza REQUIREMENTS.md; añade el enlace (Foker no modifica un README existente).',
      });
    return {
      data: { root, files, dryRun },
      warnings,
      human: `${dryRun ? 'Se escribirían' : 'Requisitos generados'}:\n${files.map((f) => `  ${f}`).join('\n')}\n\nSiguiente: revisa REQUIREMENTS.md y lanza la primera tarea del backlog con foker task begin.\n`,
      exitCode: 0,
    };
  },
};
