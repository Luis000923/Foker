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
| T11 dependencias del proyecto | Gate de dependencies/lockfiles: `packages/engine/src/tasks/gates.ts`; plantilla pnpm en `templates/nextjs-turbo/`. | Aprobación no implica análisis del paquete. |
| T12 supply chain Foker | Lockfiles, `deny.toml`, `pnpm-workspace.yaml`, Actions por SHA en `.github/workflows/`. | Trusted publishing/procedencia es PENDIENTE FKR-080; release es dry-run. |
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

Dependencias, lockfiles y rutas de aprobación llevan a AWAITING_APPROVAL si los demás gates pasan.
Approve/reject/unblock son acciones CLI humanas con confirmación; admiten la excepción de CI explícito
(`--ci` y `CI=true`). No son autenticación fuerte: el actor `cli:<usuario>` identifica al usuario
local. Cambios protegidos y secretos bloquean, no se solucionan con approve. Revisa evidencia y
usa `foker task verify <id>` para reejecutar sobre el árbol actual; approve no reejecuta checks.

REQ-POL-001 y las relajaciones justificadas están en [configuration.md](configuration.md).

## Secretos y redacción

`packages/policy/src/secrets/index.ts` implementa 24 reglas con tests positivos/negativos.
Las asignaciones genéricas requieren longitud ≥12 y entropía ≥3,5; generan warning, que el gate
actual trata como detección y bloquea. Los mensajes omiten valores; la redacción produce
`[REDACTED:<regla>]`. Checks eliminan valores del entorno no permitido y aplican el escáner;
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
