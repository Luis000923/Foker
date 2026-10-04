// REQ-DOC-001: referencia derivada del esquema y los resolutores reales, sin addon ni red.
import { readFileSync, writeFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { stringify } from 'yaml';

const root = new URL('../../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const schema = JSON.parse(read('packages/schemas/schemas/foker-config.schema.json'));
const common = JSON.parse(read('packages/schemas/schemas/common.schema.json'));

// Ejecutar solo la resolución pura. Las operaciones de disco, validación y hash no se usan.
// No se importa engine desde schemas: este script de desarrollo queda fuera del grafo de paquetes.
function pureSource(path) {
  return stripTypeScriptTypes(read(path))
    .replace(/^import\s[\s\S]*?;\s*$/gm, '')
    .replace(/^export /gm, '');
}
const defaults = vm.runInNewContext(
  `${pureSource('packages/policy/src/policy.ts')}\n${pureSource('packages/engine/src/config.ts')}\nresolveConfig({version: 1}).config`,
  { hashCanonicalJson: () => '', URL },
);

// loadConfig deja los defaults de map en Rust; extraer sus literales en vez de duplicarlos.
const rust = read('crates/foker-map/src/config.rs');
const list = (name) => {
  const block = rust.match(new RegExp(`${name}: vec!\\[([\\s\\S]*?)\\]`))?.[1];
  if (block === undefined) throw new Error(`Default Rust ausente: ${name}`);
  return [...block.matchAll(/"([^"]*)"/g)].map((match) => match[1]);
};
defaults.map = {
  include: list('include'),
  exclude: list('exclude'),
  tsconfig: list('tsconfig'),
  max_file_bytes: Number(
    rust
      .match(/DEFAULT_MAX_FILE_BYTES: u64 = (\d+) \* (\d+)/)
      ?.slice(1)
      .reduce((a, b) => a * Number(b), 1),
  ),
  max_files: Number(rust.match(/DEFAULT_MAX_FILES: usize = ([\d_]+)/)?.[1].replaceAll('_', '')),
  kinds: Object.fromEntries(['test', 'declaration', 'config', 'generated'].map((key) => [key, list(key)])),
};
function deref(node) {
  if (!node.$ref) return node;
  const [file, fragment] = node.$ref.split('#');
  const document = file ? common : schema;
  const target = fragment
    .split('/')
    .slice(1)
    .reduce((value, key) => value[key], document);
  return { ...deref(target), ...Object.fromEntries(Object.entries(node).filter(([key]) => key !== '$ref')) };
}
const cell = (value) => String(value).replaceAll('|', '&#124;').replaceAll('\n', ' ');
const descriptions = {
  'project.name': 'Nombre del proyecto.',
  'project.description': 'Descripción del proyecto.',
  'map.include': 'Globs de inclusión; vacío incluye todo el árbol descubierto.',
  'map.exclude': 'Globs excluidos después de include; se respetan gitignore y exclusiones duras.',
  'map.tsconfig': 'Globs de tsconfig para resolver imports.',
  'map.max_file_bytes': 'Archivos mayores se registran como skipped.',
  'map.max_files': 'Límite de archivos fuente; excederlo falla con FKR-MAP-003.',
  'context.default_budget_tokens': 'Presupuesto de contexto cuando la petición no especifica otro.',
  'validation.profiles': 'Perfiles nombrados; no se crean perfiles implícitos.',
  'validation.profiles.<nombre>.checks': 'Nombres de checks que debe ejecutar el perfil.',
  'validation.checks': 'Checks nombrados; run y builtin son alternativas.',
  'policy.secret_globs': 'Rutas de secretos excluidas antes de leer archivos para el mapa.',
  'policy.protected_paths': 'Cambios en estas rutas bloquean la tarea.',
  'policy.approval_required.paths': 'Cambios que requieren aprobación humana.',
  'policy.approval_required.dependency_changes': 'Solicita aprobación para cambios de dependencias o lockfiles.',
  'policy.approval_required.file_deletions_outside_scope': 'Solicita aprobación para borrados fuera de alcance.',
  'policy.env_allowlist': 'Únicas variables heredadas por checks; la lista del proyecto reemplaza el default.',
  'policy.tasks.max_attempts_default': 'Máximo de intentos al crear una tarea.',
  'policy.tasks.max_active': 'Máximo de tareas activas simultáneas.',
  'policy.overrides[].remove_secret_globs': 'Elimina globs literales de secretos.',
  'policy.overrides[].remove_protected_paths': 'Elimina rutas protegidas literales.',
  'policy.overrides[].remove_approval_paths': 'Elimina rutas de aprobación literales.',
  'policy.overrides[].justification': 'Motivo explícito de la relajación.',
  'integrations.targets': 'Anfitriones para generar integraciones mediante sync.',
};
function rows(raw, path, value, required = false) {
  const node = deref(raw);
  if (node.oneOf || node.anyOf) {
    return (node.oneOf ?? node.anyOf).flatMap((variant, i) =>
      rows(variant, `${path} (variante ${i + 1})`, value, required),
    );
  }
  const type =
    node.type ??
    (node.const !== undefined
      ? `const ${JSON.stringify(node.const)}`
      : node.enum
        ? node.enum.map(JSON.stringify).join(' / ')
        : 'valor');
  const fallback = value !== undefined ? value : node.default;
  const description = [
    node.description ?? descriptions[path],
    required ? 'Obligatoria si existe el objeto padre.' : 'Opcional.',
    node.minimum !== undefined ? `Mínimo: ${node.minimum}.` : '',
    node.maximum !== undefined ? `Máximo: ${node.maximum}.` : '',
    node.pattern ? `Patrón: ${node.pattern}.` : '',
    node.minLength !== undefined ? `Longitud mínima: ${node.minLength}.` : '',
    node.maxLength !== undefined ? `Longitud máxima: ${node.maxLength}.` : '',
    node.enum ? `Valores: ${JSON.stringify(node.enum)}.` : '',
  ]
    .filter(Boolean)
    .join(' ');
  const result = [
    `| ${cell(path)} | ${cell(type)} | ${fallback === undefined ? 'Sin default' : cell(JSON.stringify(fallback))} | ${cell(description)} |`,
  ];
  for (const [key, property] of Object.entries(node.properties ?? {})) {
    result.push(...rows(property, `${path}.${key}`, value?.[key], node.required?.includes(key)));
  }
  if (node.additionalProperties && typeof node.additionalProperties === 'object') {
    // Defaults por check son añadidos por resolveConfig, también para builtin.
    const sample =
      path === 'validation.checks'
        ? vm.runInNewContext(
            `${pureSource('packages/policy/src/policy.ts')}\n${pureSource('packages/engine/src/config.ts')}\n(() => { const {run, ...defaults} = resolveConfig({version:1,validation:{checks:{example:{run:['pnpm','test']}}}}).config.validation.checks.example; return defaults; })()`,
            { hashCanonicalJson: () => '' },
          )
        : undefined;
    result.push(...rows(node.additionalProperties, `${path}.<nombre>`, sample));
  }
  for (const [index, item] of (node.prefixItems ?? []).entries()) {
    result.push(...rows(item, `${path}[${index}]`, undefined, true));
  }
  if (node.items && typeof node.items === 'object') result.push(...rows(node.items, `${path}[]`, undefined));
  return result;
}
const example = {
  ...defaults,
  project: { name: 'mi-proyecto', description: 'Proyecto TypeScript gestionado por Foker' },
  template: { name: 'nextjs-turbo', version: '0.1.0', options: { dark_mode: true } },
  validation: {
    profiles: {
      quick: { checks: ['typecheck'] },
      default: { checks: ['typecheck', 'lint', 'test', 'secrets'] },
      security: { checks: ['secrets', 'audit'] },
    },
    checks: {
      typecheck: { run: ['pnpm', 'typecheck'], timeout_s: 300, network: false, parser: 'tsc', cwd: '.' },
      lint: { run: ['pnpm', 'lint'], timeout_s: 300, network: false, parser: 'eslint', cwd: '.' },
      test: { run: ['pnpm', 'test'], timeout_s: 600, network: false, parser: 'vitest', cwd: '.' },
      secrets: { builtin: 'secret-scan', timeout_s: 300 },
      audit: {
        run: ['pnpm', 'audit', '--prod', '--audit-level', 'high'],
        timeout_s: 120,
        network: true,
        parser: 'generic',
        cwd: '.',
      },
    },
  },
  policy: { ...defaults.policy, overrides: [] },
  integrations: { targets: ['claude-code', 'opencode', 'antigravity'] },
};
const markdown =
  '# Configuración de Foker\n\n' +
  'Generado por `packages/schemas/scripts/gen-config-docs.mjs` (REQ-DOC-001). No editar a mano. Regenerar con `node packages/schemas/scripts/gen-config-docs.mjs` o `UPDATE_SNAPSHOTS=1 ./node_modules/.bin/vitest run packages/schemas/src/docs.test.ts`.\n\n' +
  'Fuente: `packages/schemas/schemas/foker-config.schema.json`, `@foker/engine` (`loadConfig` → `resolveConfig`), `DEFAULT_POLICY` y defaults del mapa en `crates/foker-map/src/config.rs`. Claves desconocidas: `FKR-CFG-001`. Sin el archivo predeterminado se resuelve `{version: 1}`; un `--config` explícito ausente falla. Los flags de map/context prevalecen sobre su configuración; el entorno no sobrescribe política.\n\n' +
  'Los defaults de objetos resumen la configuración efectiva sin archivo. `<nombre>` identifica entradas dinámicas; `[]`, elementos de arrays. Un default de check solo se aplica cuando ese check está declarado: no hay perfiles ni comandos de validación implícitos. `cwd` omitido usa el root. `builtin` recibe también `timeout_s: 300`; no recibe network ni parser. Las variantes son alternativas, no claves literales.\n\n' +
  Object.entries(schema.properties)
    .map(
      ([key, node]) =>
        `## ${key}\n\n| Clave | Tipo | Default | Descripción |\n|---|---|---|---|\n${rows(node, key, defaults[key], schema.required.includes(key)).join('\n')}\n`,
    )
    .join('\n') +
  '\n## Fusión de política (REQ-POL-001)\n\n' +
  '`secret_globs`, `protected_paths` y `approval_required.paths` se unen sin duplicados: una lista vacía no elimina protecciones. Los booleanos de aprobación se fusionan con OR. `env_allowlist` del proyecto reemplaza la lista por defecto; `tasks` se fusiona por clave. `policy.overrides` elimina coincidencias literales de las tres listas mediante `remove_secret_globs`, `remove_protected_paths` y `remove_approval_paths`; requiere justificación (10–1000 caracteres, al menos 10 tras trim). `doctor` muestra las relajaciones realmente aplicadas. Los overrides no permiten apagar los booleanos de aprobación.\n\n' +
  '## Ejemplo completo\n\nEjemplo ilustrativo, no defaults ni comandos universales: adapta los scripts al proyecto. `template` registra el origen; no activa una plantilla al cargar configuración. Una relajación opcional tendría la forma `{remove_secret_globs: ["**/.npmrc"], justification: "Contiene solo configuración pública"}`; aquí no se relaja ninguna protección.\n\n```yaml\n' +
  stringify(example, { lineWidth: 0 }) +
  '```\n';
const target = new URL('docs/configuration.md', root);
if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(target, 'utf8');
  } catch {}
  if (current !== markdown) {
    console.error('docs/configuration.md desactualizado; ejecuta node packages/schemas/scripts/gen-config-docs.mjs');
    process.exitCode = 1;
  }
} else writeFileSync(target, markdown);
