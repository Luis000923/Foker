# Configuración de Foker

Generado por `packages/schemas/scripts/gen-config-docs.mjs` (REQ-DOC-001). No editar a mano. Regenerar con `node packages/schemas/scripts/gen-config-docs.mjs` o `UPDATE_SNAPSHOTS=1 ./node_modules/.bin/vitest run packages/schemas/src/docs.test.ts`.

Fuente: `packages/schemas/schemas/foker-config.schema.json`, `@foker/engine` (`loadConfig` → `resolveConfig`), `DEFAULT_POLICY` y defaults del mapa en `crates/foker-map/src/config.rs`. Claves desconocidas: `FKR-CFG-001`. Sin el archivo predeterminado se resuelve `{version: 1}`; un `--config` explícito ausente falla. Los flags de map/context prevalecen sobre su configuración; el entorno no sobrescribe política.

Los defaults de objetos resumen la configuración efectiva sin archivo. `<nombre>` identifica entradas dinámicas; `[]`, elementos de arrays. Un default de check solo se aplica cuando ese check está declarado: no hay perfiles ni comandos de validación implícitos. `cwd` omitido usa el root. `builtin` recibe también `timeout_s: 300`; no recibe network ni parser. Las variantes son alternativas, no claves literales.

## version

| Clave | Tipo | Default | Descripción |
|---|---|---|---|
| version | const 1 | 1 | Obligatoria si existe el objeto padre. |

## project

| Clave | Tipo | Default | Descripción |
|---|---|---|---|
| project | object | Sin default | Opcional. |
| project.name | string | Sin default | Nombre del proyecto. Opcional. Longitud mínima: 1. Longitud máxima: 214. |
| project.description | string | Sin default | Descripción del proyecto. Opcional. Longitud máxima: 1024. |

## template

| Clave | Tipo | Default | Descripción |
|---|---|---|---|
| template | object | Sin default | Plantilla con la que se creó el proyecto (la registra foker init --template). Opcional. |
| template.name | string | Sin default | Obligatoria si existe el objeto padre. Patrón: ^[a-z0-9]+(-[a-z0-9]+)*$. |
| template.version | string | Sin default | Obligatoria si existe el objeto padre. Patrón: ^(0&#124;[1-9]\d*)\.(0&#124;[1-9]\d*)\.(0&#124;[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$. |
| template.options | object | Sin default | Opcional. |

## map

| Clave | Tipo | Default | Descripción |
|---|---|---|---|
| map | object | {"include":[],"exclude":[],"tsconfig":["tsconfig.json"],"max_file_bytes":1048576,"max_files":50000,"kinds":{"test":["**/*.test.*","**/*.spec.*","**/__tests__/**","**/test/**","**/tests/**","**/e2e/**"],"declaration":[],"config":["*.config.*","**/.eslintrc.*","**/.prettierrc.*"],"generated":["**/*.generated.*","**/__generated__/**","**/generated/**"]}} | Opcional. |
| map.include | array | [] | Globs de inclusión; vacío incluye todo el árbol descubierto. Opcional. |
| map.include[] | string | Sin default | Glob relativo al root con separador /. Opcional. Patrón: ^(?!/)[^\\\u0000]+$. Longitud mínima: 1. Longitud máxima: 512. |
| map.exclude | array | [] | Globs excluidos después de include; se respetan gitignore y exclusiones duras. Opcional. |
| map.exclude[] | string | Sin default | Glob relativo al root con separador /. Opcional. Patrón: ^(?!/)[^\\\u0000]+$. Longitud mínima: 1. Longitud máxima: 512. |
| map.tsconfig | array | ["tsconfig.json"] | Globs de tsconfig para resolver imports. Opcional. |
| map.tsconfig[] | string | Sin default | Glob relativo al root con separador /. Opcional. Patrón: ^(?!/)[^\\\u0000]+$. Longitud mínima: 1. Longitud máxima: 512. |
| map.max_file_bytes | integer | 1048576 | Archivos mayores se registran como skipped. Opcional. Mínimo: 1024. Máximo: 67108864. |
| map.max_files | integer | 50000 | Límite de archivos fuente; excederlo falla con FKR-MAP-003. Opcional. Mínimo: 1. Máximo: 500000. |
| map.kinds | object | {"test":["**/*.test.*","**/*.spec.*","**/__tests__/**","**/test/**","**/tests/**","**/e2e/**"],"declaration":[],"config":["*.config.*","**/.eslintrc.*","**/.prettierrc.*"],"generated":["**/*.generated.*","**/__generated__/**","**/generated/**"]} | Globs que asignan files[].kind; el resto es source. Opcional. |
| map.kinds.test | array | ["**/*.test.*","**/*.spec.*","**/__tests__/**","**/test/**","**/tests/**","**/e2e/**"] | Opcional. |
| map.kinds.test[] | string | Sin default | Glob relativo al root con separador /. Opcional. Patrón: ^(?!/)[^\\\u0000]+$. Longitud mínima: 1. Longitud máxima: 512. |
| map.kinds.declaration | array | [] | Opcional. |
| map.kinds.declaration[] | string | Sin default | Glob relativo al root con separador /. Opcional. Patrón: ^(?!/)[^\\\u0000]+$. Longitud mínima: 1. Longitud máxima: 512. |
| map.kinds.config | array | ["*.config.*","**/.eslintrc.*","**/.prettierrc.*"] | Opcional. |
| map.kinds.config[] | string | Sin default | Glob relativo al root con separador /. Opcional. Patrón: ^(?!/)[^\\\u0000]+$. Longitud mínima: 1. Longitud máxima: 512. |
| map.kinds.generated | array | ["**/*.generated.*","**/__generated__/**","**/generated/**"] | Opcional. |
| map.kinds.generated[] | string | Sin default | Glob relativo al root con separador /. Opcional. Patrón: ^(?!/)[^\\\u0000]+$. Longitud mínima: 1. Longitud máxima: 512. |

## context

| Clave | Tipo | Default | Descripción |
|---|---|---|---|
| context | object | {"default_budget_tokens":8000,"core_files":15} | Opcional. |
| context.default_budget_tokens | integer | 8000 | Presupuesto de contexto cuando la petición no especifica otro. Opcional. Mínimo: 1000. Máximo: 200000. |
| context.core_files | integer | 15 | N archivos de mayor PageRank global en la sección core. Opcional. Mínimo: 0. Máximo: 100. |

## validation

| Clave | Tipo | Default | Descripción |
|---|---|---|---|
| validation | object | {"profiles":{},"checks":{}} | Opcional. |
| validation.profiles | object | {} | Perfiles nombrados; no se crean perfiles implícitos. Opcional. |
| validation.profiles.<nombre> | object | Sin default | Opcional. |
| validation.profiles.<nombre>.checks | array | Sin default | Nombres de checks que debe ejecutar el perfil. Obligatoria si existe el objeto padre. |
| validation.profiles.<nombre>.checks[] | string | Sin default | Opcional. Patrón: ^[a-z][a-z0-9-]{0,63}$. |
| validation.checks | object | {} | Checks nombrados; run y builtin son alternativas. Opcional. |
| validation.checks.<nombre> (variante 1) | object | {"timeout_s":300,"network":false,"parser":"generic"} | Comando ejecutado sin shell con argv fijo. Opcional. |
| validation.checks.<nombre> (variante 1).run | array | Sin default | Obligatoria si existe el objeto padre. |
| validation.checks.<nombre> (variante 1).run[0] | string | Sin default | Obligatoria si existe el objeto padre. Patrón: ^(?![\s\S]*\$\{). Longitud mínima: 1. |
| validation.checks.<nombre> (variante 1).run[] (variante 1) | const "${affected_packages}" | Sin default | Opcional. |
| validation.checks.<nombre> (variante 1).run[] (variante 2) | string | Sin default | Opcional. Patrón: ^(?![\s\S]*\$\{). Longitud mínima: 1. |
| validation.checks.<nombre> (variante 1).timeout_s | integer | 300 | Opcional. Mínimo: 1. Máximo: 3600. |
| validation.checks.<nombre> (variante 1).network | boolean | false | El check necesita red (p. ej. pnpm audit). Opcional. |
| validation.checks.<nombre> (variante 1).cwd | string | Sin default | Directorio relativo al root. Opcional. Patrón: ^(?!/)[^\\\u0000]+$. Longitud mínima: 1. Longitud máxima: 512. |
| validation.checks.<nombre> (variante 1).parser | "tsc" / "eslint" / "vitest" / "generic" | "generic" | Parser de hallazgos de la salida. Opcional. Valores: ["tsc","eslint","vitest","generic"]. |
| validation.checks.<nombre> (variante 2) | object | {"timeout_s":300,"network":false,"parser":"generic"} | Verificador integrado de Foker. Opcional. |
| validation.checks.<nombre> (variante 2).builtin | "secret-scan" | Sin default | Obligatoria si existe el objeto padre. Valores: ["secret-scan"]. |
| validation.checks.<nombre> (variante 2).timeout_s | integer | 300 | Opcional. Mínimo: 1. Máximo: 3600. |

## policy

| Clave | Tipo | Default | Descripción |
|---|---|---|---|
| policy | object | {"secret_globs":[".env",".env.*","**/*.pem","**/*.key","**/id_rsa*","**/*.p12","**/.npmrc","**/secrets/**"],"protected_paths":[".git/**",".foker/**","foker.config.yaml","foker/rules.md","foker/skills/**","foker/roles/**","foker/sync-manifest.json",".claude/**",".opencode/**",".agents/**","opencode.json",".mcp.json"],"approval_required":{"paths":[".github/workflows/**","**/next.config.*","**/middleware.ts","AGENTS.md","CLAUDE.md"],"dependency_changes":true,"file_deletions_outside_scope":true},"env_allowlist":["PATH","HOME","USERPROFILE","SystemRoot","TEMP","TMP","LANG","LC_ALL","CI","NODE_OPTIONS","NODE_ENV"],"tasks":{"max_attempts_default":3,"max_active":5}} | FOKER-SPEC §11.3. El proyecto solo puede añadir restricciones (REQ-POL-001); relajar exige overrides. Opcional. |
| policy.secret_globs | array | [".env",".env.*","**/*.pem","**/*.key","**/id_rsa*","**/*.p12","**/.npmrc","**/secrets/**"] | Rutas de secretos excluidas antes de leer archivos para el mapa. Opcional. |
| policy.secret_globs[] | string | Sin default | Glob relativo al root con separador /. Opcional. Patrón: ^(?!/)[^\\\u0000]+$. Longitud mínima: 1. Longitud máxima: 512. |
| policy.protected_paths | array | [".git/**",".foker/**","foker.config.yaml","foker/rules.md","foker/skills/**","foker/roles/**","foker/sync-manifest.json",".claude/**",".opencode/**",".agents/**","opencode.json",".mcp.json"] | Cambios en estas rutas bloquean la tarea. Opcional. |
| policy.protected_paths[] | string | Sin default | Glob relativo al root con separador /. Opcional. Patrón: ^(?!/)[^\\\u0000]+$. Longitud mínima: 1. Longitud máxima: 512. |
| policy.approval_required | object | {"paths":[".github/workflows/**","**/next.config.*","**/middleware.ts","AGENTS.md","CLAUDE.md"],"dependency_changes":true,"file_deletions_outside_scope":true} | Opcional. |
| policy.approval_required.paths | array | [".github/workflows/**","**/next.config.*","**/middleware.ts","AGENTS.md","CLAUDE.md"] | Cambios que requieren aprobación humana. Opcional. |
| policy.approval_required.paths[] | string | Sin default | Glob relativo al root con separador /. Opcional. Patrón: ^(?!/)[^\\\u0000]+$. Longitud mínima: 1. Longitud máxima: 512. |
| policy.approval_required.dependency_changes | boolean | true | Solicita aprobación para cambios de dependencias o lockfiles. Opcional. |
| policy.approval_required.file_deletions_outside_scope | boolean | true | Solicita aprobación para borrados fuera de alcance. Opcional. |
| policy.env_allowlist | array | ["PATH","HOME","USERPROFILE","SystemRoot","TEMP","TMP","LANG","LC_ALL","CI","NODE_OPTIONS","NODE_ENV"] | Únicas variables heredadas por checks; la lista del proyecto reemplaza el default. Opcional. |
| policy.env_allowlist[] | string | Sin default | Opcional. Patrón: ^[A-Za-z_][A-Za-z0-9_]*$. |
| policy.tasks | object | {"max_attempts_default":3,"max_active":5} | Opcional. |
| policy.tasks.max_attempts_default | integer | 3 | Máximo de intentos al crear una tarea. Opcional. Mínimo: 1. Máximo: 5. |
| policy.tasks.max_active | integer | 5 | Máximo de tareas activas simultáneas. Opcional. Mínimo: 1. Máximo: 20. |
| policy.overrides | array | Sin default | Relajaciones explícitas de la política por defecto; foker doctor las lista. Opcional. |
| policy.overrides[] | object | Sin default | Opcional. |
| policy.overrides[].remove_secret_globs | array | Sin default | Elimina globs literales de secretos. Opcional. |
| policy.overrides[].remove_secret_globs[] | string | Sin default | Glob relativo al root con separador /. Opcional. Patrón: ^(?!/)[^\\\u0000]+$. Longitud mínima: 1. Longitud máxima: 512. |
| policy.overrides[].remove_protected_paths | array | Sin default | Elimina rutas protegidas literales. Opcional. |
| policy.overrides[].remove_protected_paths[] | string | Sin default | Glob relativo al root con separador /. Opcional. Patrón: ^(?!/)[^\\\u0000]+$. Longitud mínima: 1. Longitud máxima: 512. |
| policy.overrides[].remove_approval_paths | array | Sin default | Elimina rutas de aprobación literales. Opcional. |
| policy.overrides[].remove_approval_paths[] | string | Sin default | Glob relativo al root con separador /. Opcional. Patrón: ^(?!/)[^\\\u0000]+$. Longitud mínima: 1. Longitud máxima: 512. |
| policy.overrides[].justification | string | Sin default | Motivo explícito de la relajación. Obligatoria si existe el objeto padre. Longitud mínima: 10. Longitud máxima: 1000. |

## skills

| Clave | Tipo | Default | Descripción |
|---|---|---|---|
| skills | object | {"disabled":[]} | Opcional. |
| skills.disabled | array | [] | Skills incluidas que no se exportan ni se sugieren. Opcional. |
| skills.disabled[] | string | Sin default | Opcional. Patrón: ^[a-z][a-z0-9-]{0,63}$. |

## integrations

| Clave | Tipo | Default | Descripción |
|---|---|---|---|
| integrations | object | {"targets":[]} | Opcional. |
| integrations.targets | array | [] | Anfitriones para generar integraciones mediante sync. Opcional. |
| integrations.targets[] | "claude-code" / "opencode" / "antigravity" / "codex" | Sin default | Opcional. Valores: ["claude-code","opencode","antigravity","codex"]. |

## Fusión de política (REQ-POL-001)

`secret_globs`, `protected_paths` y `approval_required.paths` se unen sin duplicados: una lista vacía no elimina protecciones. Los booleanos de aprobación se fusionan con OR. `env_allowlist` del proyecto reemplaza la lista por defecto; `tasks` se fusiona por clave. `policy.overrides` elimina coincidencias literales de las tres listas mediante `remove_secret_globs`, `remove_protected_paths` y `remove_approval_paths`; requiere justificación (10–1000 caracteres, al menos 10 tras trim). `doctor` muestra las relajaciones realmente aplicadas. Los overrides no permiten apagar los booleanos de aprobación.

## Ejemplo completo

Ejemplo ilustrativo, no defaults ni comandos universales: adapta los scripts al proyecto. `template` registra el origen; no activa una plantilla al cargar configuración. Una relajación opcional tendría la forma `{remove_secret_globs: ["**/.npmrc"], justification: "Contiene solo configuración pública"}`; aquí no se relaja ninguna protección.

```yaml
version: 1
context:
  default_budget_tokens: 8000
  core_files: 15
validation:
  profiles:
    quick:
      checks:
        - typecheck
    default:
      checks:
        - typecheck
        - lint
        - test
        - secrets
    security:
      checks:
        - secrets
        - audit
  checks:
    typecheck:
      run:
        - pnpm
        - typecheck
      timeout_s: 300
      network: false
      parser: tsc
      cwd: .
    lint:
      run:
        - pnpm
        - lint
      timeout_s: 300
      network: false
      parser: eslint
      cwd: .
    test:
      run:
        - pnpm
        - test
      timeout_s: 600
      network: false
      parser: vitest
      cwd: .
    secrets:
      builtin: secret-scan
      timeout_s: 300
    audit:
      run:
        - pnpm
        - audit
        - --prod
        - --audit-level
        - high
      timeout_s: 120
      network: true
      parser: generic
      cwd: .
policy:
  secret_globs:
    - .env
    - .env.*
    - "**/*.pem"
    - "**/*.key"
    - "**/id_rsa*"
    - "**/*.p12"
    - "**/.npmrc"
    - "**/secrets/**"
  protected_paths:
    - .git/**
    - .foker/**
    - foker.config.yaml
    - foker/rules.md
    - foker/skills/**
    - foker/roles/**
    - foker/sync-manifest.json
    - .claude/**
    - .opencode/**
    - .agents/**
    - opencode.json
    - .mcp.json
  approval_required:
    paths:
      - .github/workflows/**
      - "**/next.config.*"
      - "**/middleware.ts"
      - AGENTS.md
      - CLAUDE.md
    dependency_changes: true
    file_deletions_outside_scope: true
  env_allowlist:
    - PATH
    - HOME
    - USERPROFILE
    - SystemRoot
    - TEMP
    - TMP
    - LANG
    - LC_ALL
    - CI
    - NODE_OPTIONS
    - NODE_ENV
  tasks:
    max_attempts_default: 3
    max_active: 5
  overrides: []
skills:
  disabled: []
integrations:
  targets:
    - claude-code
    - opencode
    - antigravity
    - codex
map:
  include: []
  exclude: []
  tsconfig:
    - tsconfig.json
  max_file_bytes: 1048576
  max_files: 50000
  kinds:
    test:
      - "**/*.test.*"
      - "**/*.spec.*"
      - "**/__tests__/**"
      - "**/test/**"
      - "**/tests/**"
      - "**/e2e/**"
    declaration: []
    config:
      - "*.config.*"
      - "**/.eslintrc.*"
      - "**/.prettierrc.*"
    generated:
      - "**/*.generated.*"
      - "**/__generated__/**"
      - "**/generated/**"
project:
  name: mi-proyecto
  description: Proyecto TypeScript gestionado por Foker
template:
  name: nextjs-turbo
  version: 0.1.0
  options:
    dark_mode: true
```
