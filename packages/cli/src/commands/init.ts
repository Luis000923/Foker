import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { FokerError, normalizePath, resolveConfig } from '@foker/engine';
import { detectHosts, HOST_IDS } from '@foker/integrations';
import { type FokerConfig, type FokerMdFrontmatter, formatIssues, validate } from '@foker/schemas';
import { parse, stringify } from 'yaml';
import { type Command, flag } from '../types.js';
import { runSync } from './sync.js';

/** Plantillas disponibles (FOKER-SPEC §5.3). */
export const TEMPLATES = ['nextjs-turbo'] as const;

/** Lee y valida el frontmatter de `foker.md` (FOKER-SPEC §15.1). El cuerpo no se interpreta (T1). */
export async function readSpec(root: string, path: string): Promise<FokerMdFrontmatter> {
  const text = await readFile(join(root, normalizePath(root, path)), 'utf8').catch(() => {
    throw new FokerError('FKR-CFG-001', `No se puede leer ${path}`);
  });
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (!match) throw new FokerError('FKR-CFG-001', `${path} no tiene frontmatter YAML`);
  let data: unknown;
  try {
    data = parse(match[1] ?? '');
  } catch (error) {
    throw new FokerError('FKR-CFG-001', `${path}: YAML inválido: ${(error as Error).message}`);
  }
  const result = validate<FokerMdFrontmatter>('foker-md', data);
  if (!result.ok) throw new FokerError('FKR-CFG-001', `${path}: ${formatIssues(result.issues)}`);
  return result.value;
}

function readJson(path: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

/** Gestor de paquetes según el lockfile. */
function packageManager(root: string): 'pnpm' | 'yarn' | 'npm' {
  if (existsSync(join(root, 'pnpm-lock.yaml')) || existsSync(join(root, 'pnpm-workspace.yaml'))) return 'pnpm';
  if (existsSync(join(root, 'yarn.lock'))) return 'yarn';
  return 'npm';
}

/** `foker.config.yaml` inicial: checks a partir de los scripts del package.json raíz (sin inventar comandos). */
export function initialConfig(root: string, name: string, description: string | undefined) {
  const pkg = readJson(join(root, 'package.json'));
  const scripts = (pkg?.['scripts'] ?? {}) as Record<string, string>;
  const pm = packageManager(root);
  const monorepo = existsSync(join(root, 'pnpm-workspace.yaml')) || Array.isArray(pkg?.['workspaces']);
  const checks: Record<string, unknown> = { secrets: { builtin: 'secret-scan' } };
  for (const script of ['typecheck', 'lint', 'test']) {
    if (scripts[script]) checks[script] = { run: [pm, 'run', script], timeout_s: script === 'test' ? 600 : 300 };
  }
  const available = ['typecheck', 'lint', 'test'].filter((c) => c in checks);
  const config: Record<string, unknown> = {
    version: 1,
    project: description ? { name, description } : { name },
    map: {
      ...(monorepo ? { include: ['apps/**', 'packages/**', 'src/**'] } : {}),
      exclude: ['**/dist/**', '**/.next/**', '**/coverage/**', '**/*.min.js'],
    },
    context: { default_budget_tokens: 8000 },
    validation: {
      profiles: {
        quick: { checks: available.includes('typecheck') ? ['typecheck'] : ['secrets'] },
        default: { checks: [...available, 'secrets'] },
        security: { checks: ['secrets'] },
      },
      checks,
    },
  };
  return config;
}

export const RULES_TEMPLATE = `# Reglas del proyecto

<!-- Las ve el agente en cada Context Pack. Mantenlas por debajo de 1.500 tokens. -->

- TypeScript estricto: sin \`any\` explícito.
- Cada cambio de comportamiento lleva su test.
- No añadas dependencias sin justificarlo en la descripción de la tarea.
`;

export const initCommand: Command = {
  name: 'init',
  description: 'Inicializa Foker en un repositorio (o crea uno desde plantilla) y ejecuta sync',
  maxArgs: 1,
  flags: [
    flag('template', 'string', `Plantilla (${TEMPLATES.join(', ')})`),
    flag('from-spec', 'string', 'Lee nombre, descripción y plantilla del frontmatter de foker.md'),
    flag(
      'targets',
      'string',
      `Anfitriones separados por comas (${HOST_IDS.join(', ')}); por defecto los detectados o todos`,
    ),
    flag('force', 'boolean', 'Sobrescribe foker.config.yaml y foker/rules.md si existen'),
  ],
  async run(ctx) {
    const root = resolve(ctx.cwd, ctx.args[0] ?? '.');
    const dryRun = Boolean(ctx.flags['dry-run']);
    const force = Boolean(ctx.flags['force']);
    const spec = ctx.flags['from-spec'] ? await readSpec(root, String(ctx.flags['from-spec'])) : undefined;
    const template = String(ctx.flags['template'] || spec?.template?.name || '');
    if (template && !(TEMPLATES as readonly string[]).includes(template)) {
      throw new FokerError('FKR-INP-001', `Plantilla desconocida: ${template}`);
    }
    if (template) throw new FokerError('FKR-INP-001', 'La plantilla nextjs-turbo llega con FKR-068.');
    if (!existsSync(root)) throw new FokerError('FKR-CFG-002', `No existe el directorio ${root}`);

    const configPath = join(root, 'foker.config.yaml');
    if (existsSync(configPath) && !force) {
      throw new FokerError(
        'FKR-INP-001',
        'Foker ya está inicializado (foker.config.yaml existe); usa --force para regenerarlo.',
      );
    }
    const pkg = readJson(join(root, 'package.json'));
    const name = spec?.name ?? (typeof pkg?.['name'] === 'string' ? (pkg['name'] as string) : basename(root));
    const targetsFlag = String(ctx.flags['targets'] ?? '');
    const detected = detectHosts((path) => existsSync(join(root, path)));
    const targets = targetsFlag
      ? targetsFlag
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
      : detected.length
        ? detected
        : [...HOST_IDS];
    const unknown = targets.filter((t) => !(HOST_IDS as readonly string[]).includes(t));
    if (unknown.length) throw new FokerError('FKR-INP-001', `Anfitrión desconocido: ${unknown.join(', ')}`);

    const config = {
      ...initialConfig(root, name, spec?.description),
      integrations: { targets: [...new Set(targets)].sort() },
    };
    const result = validate<FokerConfig>('foker-config', config);
    if (!result.ok) throw new FokerError('FKR-CFG-001', formatIssues(result.issues));
    const configText = `# Generado por foker init. Referencia: FOKER-SPEC §15.2.\n${stringify(config)}`;
    const gitignorePath = join(root, '.gitignore');
    const gitignore = existsSync(gitignorePath) ? readFileSync(gitignorePath, 'utf8') : '';
    const needsIgnore = !gitignore
      .split(/\r?\n/)
      .some((l) => ['.foker', '.foker/', '/.foker', '/.foker/'].includes(l.trim()));
    const rulesPath = join(root, 'foker/rules.md');
    const writeRules = force || !existsSync(rulesPath);

    const files = [
      'foker.config.yaml',
      ...(writeRules ? ['foker/rules.md'] : []),
      ...(needsIgnore ? ['.gitignore'] : []),
    ];
    if (!dryRun) {
      await writeFile(configPath, configText, 'utf8');
      if (writeRules) {
        await mkdir(join(root, 'foker'), { recursive: true });
        await writeFile(rulesPath, RULES_TEMPLATE, 'utf8');
      }
      if (needsIgnore)
        await writeFile(gitignorePath, `${gitignore}${gitignore && !gitignore.endsWith('\n') ? '\n' : ''}.foker/\n`);
    }
    const { plan, applied } = await runSync(root, { dryRun, config: resolveConfig(result.value).config });
    if (plan.conflicts.length) {
      return {
        data: { root, files, conflicts: plan.conflicts },
        warnings: [],
        errors: plan.conflicts.map((c) => ({
          code: 'FKR-SYN-001',
          message: `${c.path}: ${c.reason}`,
          hint: 'foker sync --force',
        })),
        exitCode: 1,
      };
    }
    const synced = plan.writes.map((w) => w.path);
    const human = `${dryRun ? 'Se crearían o modificarían' : 'Foker inicializado. Archivos'}:\n${[...files, ...synced]
      .map((f) => `  ${f}`)
      .join('\n')}\n${dryRun ? '' : '\nSiguiente: revisa foker.config.yaml y ejecuta foker trust y foker map.\n'}`;
    return {
      data: { root, targets: [...new Set(targets)].sort(), files, synced, applied },
      warnings: [],
      human,
      exitCode: 0,
    };
  },
};
