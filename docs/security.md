# Seguridad

FOKER-SPEC §11 define la seguridad de Foker; §22 trata la aplicación generada. No son una
certificación ni una garantía de que código aprobado sea seguro. Política de reporte: [SECURITY.md](../SECURITY.md).

## Capas y límites

| Capa | Implementación | Límite |
|---|---|---|
| C1 permisos del anfitrión | `packages/integrations/src/` genera deny/ask; Claude Code añade hooks de `packages/cli/src/commands/policy.ts`. | Depende del anfitrión; un subproceso puede abrir archivos. Antigravity tiene soporte básico, sin permisos verificados. |
| C2 herramientas Foker | `packages/mcp/src/index.ts`: herramientas enumeradas, esquemas de entrada/salida, sin API para escribir código ni aprobar/confiar. | No controla las herramientas nativas ni lo que ejecutan los checks confiados. |
| C3 gates | `packages/engine/src/tasks/gates.ts`: alcance, política, mapa, checks y skill sobre diff/baseline. | Detecta antes de COMPLETED; no revierte daño ni exfiltración ya ocurrida. |
| C4 aislamiento del SO | Sandbox del anfitrión o contenedor, administrado fuera de Foker. Doctor avisa en `packages/cli/src/commands/doctor.ts`. | Foker no crea ni certifica ese aislamiento. |

**REQ-SEC-001 en CI**: [ADR-026](adr/ADR-026-aislamiento-ci-multiplataforma.md)
aplica el requisito en GitHub Actions: Linux usa `rust:1.98.0-bookworm`, imagen
con versión exacta compatible con `rust-toolchain.toml`; macOS/Windows usan VM
alojadas efímeras de GitHub, descartadas tras el job, como aislamiento equivalente.
La allowlist es macos-15, macos-15-intel, windows-2025 y windows-11-arm; se prohíben
runners self-hosted. Las matrices mixtas seleccionan el contenedor solo para Ubuntu.
Una actualización exige cambiar la versión de imagen y el validador juntos.
Los jobs de código no reciben secrets ni github.token, no montan volúmenes adicionales
ni Docker del anfitrión, no permiten options/credentials de contenedor; checkout
descarta credenciales y los permisos son `contents: read`. El job de notificación
nightly solo ejecuta `gh issue create`, sin checkout ni código del repo, y dispone
de `issues: write` y del token efímero de GitHub.

Riesgo residual: el código en macOS/Windows accede al entorno y red de la VM durante
el job, sin una segunda frontera de contenedor. El descarte limita persistencia,
pero no evita exfiltración de datos accesibles ni abuso de recursos. Linux comparte
kernel con el runner y el contenedor no restringe por sí solo la red. Se confía en
la infraestructura alojada de GitHub y las acciones de terceros fijadas por SHA.

`scripts/check-ci-sandbox.mjs` comprueba todos los workflows y se ejecuta en lint y Vitest.
Valida el formato de bloques usado aquí, rechaza aliases YAML y exige aislamiento en todos
los jobs salvo la notificación descrita. Comprueba cada checkout y rechaza permisos globales
adicionales y el acceso al contexto completo de secretos. No sustituye actionlint ni audita acciones de terceros. Los checks
invocados por `foker check`/`task submit` y `@foker/policy runCheck` heredan el contenedor Linux o la VM efímera
del job; el ejecutor local no crea uno. C4 local sigue siendo recomendación fuerte.
La ejecución real de estos workflows está pendiente; esta validación estática no demuestra
el aislamiento de una ejecución en GitHub. El benchmark tiene su arnés separado.

## Amenazas T1–T18

Rutas relativas al repo de Foker; cada fila identifica controles existentes y límites o pendientes.

| ID y amenaza | Control actual y ubicación | Límite / pendiente |
|---|---|---|
| T1 foker.md malicioso | Frontmatter validado; init solo lee metadatos, `packages/cli/src/commands/init.ts`. | El anfitrión puede leer y obedecer el cuerpo. |
| T2 config maliciosa | Trust antes de checks: `packages/policy/src/trust.ts`, `packages/engine/src/tasks/gates.ts`. | Confiar argv hostiles autoriza su ejecución, incluso `sh -c`. |
| T3 prompt injection en código | Delimitadores/escape: `crates/foker-context/src/render.rs`; gates. | Delimitar datos mitiga, no neutraliza instrucciones para el LLM. |
| T4 skill maliciosa | Validación, avisos e intersección de permisos: `packages/engine/src/skills/index.ts`. | El anfitrión podría ejecutar scripts; importación externa con hash es PENDIENTE V0.2, sin FKR asignado. |
| T5 MCP tercero malicioso | Prefijo foker_, doctor lista servidores: `packages/mcp/src/index.ts`, `packages/cli/src/commands/doctor.ts`. | No controla otros MCP; strict-mcp-config del benchmark es PENDIENTE FKR-011. |
| T6 inyección de comandos | argv y expansión validada: `packages/policy/src/exec.ts`. | En Windows shims cmd/bat usan ComSpec restringido (ADR-022); trust sigue siendo necesario. |
| T7 traversal y symlinks | `crates/foker-map/src/path.rs`, normalización en consumidores TS. | No sustituye aislamiento de procesos ni evita todas las carreras del filesystem. |
| T8 escritura arbitraria MCP | API sin edición de código; estado en .foker: `packages/mcp/src/index.ts`, tests E2E. | El anfitrión conserva herramientas de escritura. |
| T9 secretos en contexto | Exclusión antes de lectura: `crates/foker-map/src/discover.rs`; redacción: `packages/mcp/src/safety.ts`. | Formatos desconocidos o secretos fragmentados pueden escapar. |
| T10 entorno de checks | Allowlist y redacción: `packages/policy/src/exec.ts`. | Un proceso confiado aún puede leer secretos del disco. |
| T11 dependencias del proyecto | `dependency-security` (FKR-DEP-001..012): `packages/policy/src/dependencies/`, gate en `packages/engine/src/tasks/gates.ts`, `foker check-deps`, `foker_check_deps`. Hallazgos ≥ `fail_on` sin waiver rechazan la tarea; el resto llega a AWAITING_APPROVAL con diff por paquete. | Heurístico y estático: no ejecuta ni descompila paquetes; CVEs, cooldown y deprecated del registro solo en modo `hybrid`. Un paquete nuevo sin avisos públicos puede ser malicioso. |
| T12 supply chain Foker | Lockfiles, `deny.toml` (`cargo deny`), `pnpm audit --audit-level high` y `foker check-deps --offline` en CI, `pnpm-workspace.yaml` (`minimumReleaseAge`, `allowBuilds: {}`), Actions por SHA en `.github/workflows/`. | Trusted publishing/procedencia es PENDIENTE FKR-080; release es dry-run. |
| T13 escalada editando política | `DEFAULT_POLICY` en `packages/policy/src/policy.ts`, gate y hash de comandos en `packages/engine/src/config.ts`. | La protección cubre las rutas enumeradas, no todo foker/ indiscriminadamente; sin C4 hay riesgo de manipulación local. |
| T14 git destructivo | Git de lectura: `packages/engine/src/git.ts`; deny/hook en `packages/integrations/src/` y CLI policy. | La detección de comandos conocidos no es un sandbox de shell. |
| T15 abuso de red | network documenta intención de checks: schema/config/`packages/policy/src/exec.ts`. | `network: false` NO bloquea conexiones. Solo C4 puede imponerlo. |
| T16 código inseguro | Checks configurables y gates: `packages/engine/src/tasks/gates.ts`; lint/headers en plantilla. | Depende de la cobertura de checks y revisión; contenedores declarados en CI; ejecución externa pendiente. |
| T17 evidencia manipulada | Cadena de eventos, hashes de baseline/evidencia: `packages/engine/src/tasks/{index,storage,baseline}.ts`; verify en gates.ts. | Hashes sin firma; editar coordinadamente artefactos sigue siendo posible. Verificar el árbol actual es necesario. |
| T18 denegación de servicio | Límites de mapa en `crates/foker-map/src/config.rs`, timeouts/salida en policy exec, bucket/límite en MCP safety, maxActive en tasks. | No es cuota global de CPU/disco; max_active default 5 es configurable hasta 20. |

## Confianza y aprobación

Trust está fuera del repo: `$XDG_CONFIG_HOME/foker/trust.json` o `~/.config/foker/trust.json`;
en Windows usa APPDATA. Une realpath del root y hash BLAKE3 canónico de validation + env_allowlist.
Cambiar checks, perfiles, network o allowlist invalida esa entrada. `foker trust` muestra argv y
exige confirmación en TTY; `--yes` exige `--ci` explícito y `CI=true`. MCP nunca concede trust.

Dependencias, lockfiles y rutas de aprobación llevan a AWAITING_APPROVAL si los demás gates pasan;
los cambios de dependencias pasan antes por `dependency-security` (ver abajo).
Approve/reject/unblock son acciones CLI humanas con confirmación; admiten la excepción de CI explícito
(`--ci` y `CI=true`). No son autenticación fuerte: el actor `cli:<usuario>` identifica al usuario
local. Cambios protegidos y secretos bloquean, no se solucionan con approve. Revisa evidencia y
usa `foker task verify <id>` para reejecutar sobre el árbol actual; approve no reejecuta checks.

REQ-POL-001 y las relajaciones justificadas están en [configuration.md](configuration.md).

## Secretos y redacción

`packages/policy/src/secrets/index.ts` implementa 24 reglas con tests positivos/negativos.
Las asignaciones genéricas requieren longitud ≥12 y entropía ≥3,5; generan warning, que el gate
actual trata como detección y bloquea. Los mensajes omiten valores; la redacción produce
`[REDACTED:<regla>]`. Checks eliminan valores del entorno no permitido y aplican el escáner (un valor de menos de 8 caracteres solo se redacta como palabra completa; los literales booleanos y las variables de sesión, editor y locale no se tratan como secretos);
MCP sanea strings y claves antes de devolverlos. La captura de checks se limita a 1 MiB y el tail
a 50 líneas; MCP limita su salida a 80.000 caracteres.

G2 escanea líneas añadidas cuando puede obtener un diff git fiable. Para archivos nuevos,
inicialmente sucios o sin baseline git utilizable escanea todo el contenido: puede detectar
secretos preexistentes. No detecta todos los formatos posibles. Más detalle: [findings-secrets.md](findings-secrets.md).

## Proyecto generado (§22)

`templates/nextjs-turbo/` incluye CSP básica (con inline para Next), HSTS/nosniff/Referrer-Policy,
helper same-origin, entorno Zod, reglas ESLint de seguridad, secret-scan y audit en perfil security.
El test Playwright de cabeceras se ejecuta aparte; no lo ejecuta CI de Foker. La matriz ASVS inicial
en el proyecto registra controles automatizados/manuales y pendientes: no afirma cumplimiento.
BD, AuthN/AuthZ, rate limiting y secure-fetch son **PENDIENTE V0.2** (§22; sin FKR específico en
el backlog). HTTPS/proxy y endurecimiento CSP necesitan revisión de producción.
La validación de una tarea no reemplaza CI, revisión ni seguridad operacional de la aplicación.
Consulta [templates.md](templates.md).

## Perfil `security` y alias `check-security` (ADR-041)

Quince reglas estáticas `FKR-SEC-001…015` en `@foker/policy`, mapeadas a capítulos de OWASP ASVS 5.0:
SQL crudo, webhooks sin HMAC o con comparación no constante, handlers sin autorización, acceso a datos
sin filtro de inquilino, CSP/HSTS ausentes, HTML sin escapar, `eval`, shell con datos, TLS desactivado,
criptografía débil, CORS abierto, cookies sin atributos, herramientas MCP sin validación. Ejecuta
`foker validate --profile security`; `foker check-security` delega al mismo perfil. Son heurísticas
léxicas: pueden fallar en ambos sentidos y no equivalen a cumplir ASVS ni sustituyen un SAST (ADR-017).

## Seguridad de dependencias de terceros (FKR-DEP)

Dos capas separadas, con comandos, reglas y evidencia propios:

| Capa | Qué analiza | Reglas | Comando / check / MCP |
|---|---|---|---|
| A. Código propio | Código de la aplicación (heurística léxica) | `FKR-SEC-001..015` | `foker check-security`, `builtin: static-security` |
| B. Dependencias de terceros | `package.json`, lockfiles, `.npmrc`, `node_modules/*/package.json` | `FKR-DEP-001..012` | `foker check-deps`, `builtin: dependency-security`, `foker_check_deps` |

Nada de la capa B instala paquetes ni ejecuta scripts: todo se lee de forma estática y se trata como
entrada no confiable (tamaños acotados, sin seguir enlaces fuera del root, respuestas de red saneadas).
Soporta `pnpm-lock.yaml` (v5–v9), `package-lock.json`/`npm-shrinkwrap.json` (v1–v3) y `yarn.lock`
(v1 y berry). Solo usa APIs de Node.js, sin binarios POSIX.

| Regla | Modo | Severidad | Detecta |
|---|---|---|---|
| FKR-DEP-001 | offline | high | Lockfile ausente, inválido, desincronizado con `package.json` o varios lockfiles (medium). |
| FKR-DEP-002 | offline | high | `*`, vacío, `latest`/`next`/dist-tags, `http://`, Git sin commit SHA de 40 caracteres. |
| FKR-DEP-003 | offline | critical | Sin hash `integrity`, origen fuera de `allowed_registries`; sha1 es high. `registry.yarnpkg.com` cuenta como npmjs. |
| FKR-DEP-004 | offline | high / medium / low | Scripts `preinstall`/`install`/`postinstall` (y `prepare` de Git). high si se ejecutarían, medium si están en `allowBuilds`, low si quedan bloqueados. Sin `ignore-scripts=true` ni pnpm ≥10 en modo allowlist: high. |
| FKR-DEP-005 | offline | high / medium | Licencia SPDX en `denied_licenses` (high) o fuera de `allowed_licenses` (medium). Expresiones OR/AND. |
| FKR-DEP-006 | offline | high / medium | Typosquatting/slopsquatting (Levenshtein ≤2 frente a ~130 paquetes populares y nombres internos) y dependency confusion (nombre interno resuelto desde el registro). |
| FKR-DEP-007 | offline | critical | `banned_packages`, waivers expirados o `.foker/dep-waivers.json` inválido. |
| FKR-DEP-008 | offline | medium | `overrides`/`resolutions`/`pnpm.overrides` sin `override_justifications`, mayores duplicadas en `critical_packages`. |
| FKR-DEP-009 | hybrid | según OSV | CVE/GHSA vía `https://api.osv.dev/v1/querybatch` (severidad GHSA o CVSS; sin severidad publicada: high). |
| FKR-DEP-010 | hybrid | high / medium | Publicado hace menos de `min_release_age_hours` (72 h); sin npm provenance si `require_provenance`. |
| FKR-DEP-011 | offline + hybrid | medium / high | `deprecated` (pnpm lo guarda en el lockfile; el registro en hybrid); versión inexistente/retirada: high. |
| FKR-DEP-012 | offline | info | SBOM CycloneDX 1.5 JSON determinista ordenado por `purl` (`--sbom`). |

**Modos.** `offline` (por defecto) no abre conexiones. `hybrid` (`--online` o `mode: hybrid`) consulta OSV
y el registro con timeout de 8 s por petición y caché en `.foker/cache/dep-intel.json` (TTL 6 h).
Con `on_network_error: warn` un fallo de red es un hallazgo low; con `fail-closed` (o `--strict`) es
critical y bloquea. MCP es siempre offline.

**Delta y gate.** Con línea base (la de la tarea, o `--diff-base <ref>` en CLI) las reglas por paquete
solo examinan lo añadido o actualizado, y las de declaración solo los especificadores que cambiaron.
FKR-DEP-001, la política de scripts y los waivers se evalúan siempre. En `foker task submit`, si cambian
manifiestos o lockfiles y `approval_required.dependency_changes` está activo: hallazgos ≥ `fail_on`
sin waiver ponen el gate `policy` en `fail` (REJECTED; FAILED al agotar intentos), nunca en
AWAITING_APPROVAL. Si no, la tarea espera aprobación con un hallazgo `dependency/diff` por paquete
(versión, directa/transitiva, licencia, integridad, scripts, origen) y los avisos no bloqueantes.

**Waivers.** `.foker/dep-waivers.json` es ruta protegida: lo edita una persona.
Cada waiver exige `id`, `ruleId`, `packageName`, `versionRange` (semver o `*`), `reason` (≥10
caracteres), `approvedBy` y `expiresAt` ISO-8601. Un waiver vencido no se aplica y genera FKR-DEP-007.

```json
{ "waivers": [{ "id": "lodash-merge", "ruleId": "FKR-DEP-009", "packageName": "lodash", "versionRange": "<4.17.21",
  "reason": "Ruta vulnerable no alcanzable; migración en FKR-123", "approvedBy": "luis", "expiresAt": "2027-01-31T00:00:00Z" }] }
```

**Política** (`policy.dependency_security` en `foker.config.yaml`; detalle en
[configuration.md](configuration.md)): `enabled`, `mode`, `fail_on` (high), `allowed_registries`,
`allowed_licenses`, `denied_licenses` (AGPL, SSPL-1.0, BUSL-1.1 por defecto), `require_ignore_scripts`,
`require_integrity_hash`, `block_floating_versions`, `require_provenance`, `min_release_age_hours`,
`banned_packages`, `internal_packages`, `critical_packages`, `override_justifications`,
`on_network_error`, `cache_ttl_hours`, `network_timeout_ms`.

**Cadena de suministro de Foker (T12).** CI ejecuta `cargo deny --locked check`, `pnpm audit
--audit-level high` y `foker check-deps --offline` en Linux, macOS y Windows. `.npmrc` no fija
`ignore-scripts=true`: pnpm ≥10 con `allowBuilds: {}` ya impide los scripts de dependencias, y los
binarios de `@napi-rs` son optionalDependencies precompiladas. Hoja de ruta FKR-080: publicar con
npm Trusted Publishing (OIDC de GitHub Actions, sin tokens de larga duración) y `--provenance`,
y verificar attestations con `require_provenance` en proyectos gestionados.
