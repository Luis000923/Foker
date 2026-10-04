# Foker · Roadmap y backlog

## 1. Justificación de componentes

Para cada componente nuevo o mantenido: qué problema resuelve, por qué Foker lo necesita, por qué esta tecnología, qué se descartó, coste de mantenimiento y si es necesario para el MVP.

| Componente | Problema que resuelve | Por qué esta tecnología | Alternativa descartada | Coste de mantenimiento | ¿MVP? |
|---|---|---|---|---|---|
| `foker-map` (Rust, tree-sitter) | Saber qué existe y qué depende de qué sin LLM | Parser tolerante a errores, multi-lenguaje futuro | `oxc_parser` (reserva), TS Compiler API | Medio (queries por gramática) | Sí |
| `oxc_resolver` | Resolver imports en monorepos reales | Implementa el algoritmo de Node + tsconfig paths | Resolución propia | Bajo | Sí |
| `foker-context` (PPR + BM25) | Contexto mínimo suficiente y reproducible | Determinista, pocas perillas, explicable | Vector DB, fórmula aditiva | Medio (calibración) | Sí |
| napi-rs v3 | Usar Rust desde Node sin toolchain del usuario | Estándar de facto, tipos generados, errores con `code` | Proceso hijo JSON-RPC, WASM | Medio (matriz de builds) | Sí |
| `@foker/mcp` (SDK oficial v2) | Que cualquier agente use Foker | Protocolo estándar soportado por los 3 anfitriones | API HTTP propia | Bajo-medio (evolución del protocolo) | Sí |
| `@foker/policy` + workspace trust | Que un repo ajeno no ejecute comandos; rutas protegidas | Lógica simple en TS + normalización de rutas en Rust | Sandbox propio | Medio | Sí |
| Ledger + FSM + gates (`@foker/engine`) | Que "hecho" signifique verificado | Archivos JSON/JSONL locales, sin servicio | Base de datos, servicio externo | Medio | Sí |
| Skills (Agent Skills + `foker.skill.yaml`) | Conocimiento procedimental portable | Estándar abierto implementado por los 3 anfitriones | Formato propio | Bajo | Sí |
| `@foker/integrations` (`sync`) | Configurar cada anfitrión sin deriva | Generadores deterministas con bloques gestionados | Configuración manual | Medio-alto (anfitriones cambian) | Sí |
| Plantilla `nextjs-turbo` | Proyecto nuevo seguro por defecto + fixture del benchmark | Next.js + pnpm + Turborepo (decisión original) | Sin plantilla | Medio (actualizar versiones) | Sí (mínima) |
| Arnés de benchmark | Demostrar o refutar H1 | Anfitrión headless real + contenedores | Métricas sintéticas | Medio + coste de API | Sí |
| Runner propio + adaptadores de proveedor | Control de prompt y caching | — | — | Alto | **No (V0.2)** |
| Watcher (`notify`) | Mapa siempre caliente sin consultas | — | Refresco bajo demanda (MVP) | Bajo | No (V0.2) |
| SQLite para el mapa | Repos muy grandes | — | JSON (MVP) | Medio | No (condicionado) |
| Embeddings / vector DB | Sinónimos, búsqueda semántica | — | BM25 (MVP) | Alto | No (Future, condicionado) |
| Turborepo en el repo de Foker | Caché de CI | — | pnpm -r | Bajo | No |
| Despliegue, DAST, Kubernetes, UI gráfica, observabilidad distribuida | — | — | — | Alto | No (Future) |

## 2. Hitos

| Hito | Objetivo | Criterios de salida |
|---|---|---|
| **M0 · Fundaciones y riesgo de distribución** | Repo, CI, contratos y addon "hola mundo" publicado en las 6 plataformas | CI verde en 3 SO; `versionInfo()` funciona instalando un tarball prerelease en los 6 runners; `@foker/schemas` valida los ejemplos de la especificación; ADRs en `docs/adr/` |
| **M1 · Línea base del benchmark** | Medir el control **antes** de construir el motor | Arnés ejecuta la suite `smoke` (3 tareas) y ≥ 10 tareas del Fixture A en el brazo control, 3 repeticiones, resultados válidos contra `benchmark-result.schema.json`; primeros 30 casos de `ctx-gold` |
| **M2 · Project Map** | `foker map` completo | REQ-MAP-001…004, REQ-XPLAT-001…004 en CI; `content_hash` idéntico en 3 SO; TARGET de rendimiento medido y publicado (cumpla o no) |
| **M3 · Context Engine** | `foker context` completo | REQ-CTX-001…002 en CI; recall@pack sobre `ctx-gold` medido y publicado (REQ-CTX-003 como TARGET; < 0,6 bloquea el hito) |
| **M4 · MCP, política, tareas, skills** | Flujo `begin → context → submit` | 8 herramientas + 4 recursos con E2E en clientes 2026-07-28 y 2025-11-25; REQ-TSK-001, REQ-POL-001…002, REQ-SKL-001…002; suite `tests/security` verde |
| **M5 · Integraciones, plantilla y release** | 0.1.0 publicado y H1 evaluada | REQ-PRJ-001…003, REQ-INT-001…002; checklist manual de los 3 anfitriones completada; `foker` 0.1.0 publicado con procedencia; benchmark completo ejecutado e informe publicado (H1 confirmada o no) |

## 3. Fases posteriores al MVP

**V0.2**
- Runner `foker run` con adaptador Anthropic y prompt caching explícito (ADR-016); segundo adaptador para validar la abstracción.
- Roles Planner (tareas `PENDING` con revisión humana) y Architect (desde `foker.md`).
- Grafo de llamadas (`calls`, heurístico) y aristas a nivel de símbolo en el PageRank.
- Watcher opcional; extensión MCP *Tasks* para `task_submit` largos; prompts MCP para skills.
- Targets musl; OpenCode como segundo anfitrión del benchmark; plugin de OpenCode para hooks si aporta.
- Plantilla: BD + ORM (decisión PREGUNTA-4), autenticación, rate limiting, `secure-fetch`.
- `foker skill add` con hash fijado; adaptador gitleaks; `scripts/fetch-prebuilt.mjs`.

Anterior: Fase MVP 0.1 · Siguiente: Fase V1.0 · Resumen: Alcance MVP y roadmap

**V1.0**
- Formatos v1 congelados con política de deprecación; API MCP estable.
- Benchmark reproducible por terceros con resultados publicados.
- Auditoría de seguridad externa; documentación completa; aprobaciones vía revisión de PR.

Anterior: Fase V0.2 · Siguiente: Fase Future · Resumen: Alcance MVP y roadmap

**Future**
- Recuperación híbrida con embeddings; otros lenguajes; UI; despliegue; DAST; Kubernetes/cloud; observabilidad distribuida; multi-proveedor gestionado; agente de documentación; registro público de skills; fallback WASM.

Anterior: Fase V1.0 · Resumen: Alcance MVP y roadmap

## 4. Backlog

Formato: **ID · Título** — Épica · Depende de · Criterios de aceptación. Todos los issues heredan la *Definition of Done*: código + tests + docs del área actualizados + CI verde en 3 SO.

### Épica E0 · Fundaciones (M0)

- **FKR-001 · Inicializar monorepo** — Depende: — · AC: `pnpm-workspace.yaml`, workspace cargo con 3 crates vacíos, `rust-toolchain.toml`, Biome, TS strict; `pnpm test` y `cargo nextest` verdes.
- **FKR-002 · CI base** — Depende: FKR-001 · AC: `ci.yml` con lint (fmt, clippy -D warnings, deny, biome, tsc) y test en `ubuntu-24.04`, `macos-15`, `windows-2025`; Actions fijadas por SHA; permisos mínimos.
- **FKR-003 · Regla de dependencias entre módulos** — Depende: FKR-001 · AC: un import prohibido según FOKER-SPEC §4.2 hace fallar CI (test con caso negativo).
- **FKR-004 · `@foker/schemas`** — Depende: FKR-001 · AC: incluye los 8 esquemas de `schemas/`; genera tipos TS; valida los ejemplos de la especificación; test de que un config con `${HOME}` en `run` es rechazado.
- **FKR-005 · Addon napi "hola mundo" + `versionInfo`** — Depende: FKR-001 · AC: `@foker/core` carga el addon y comprueba versión exacta (REQ-NAPI-003, test con versión falsa → `FKR-INT-002`).
- **FKR-006 · Release dry-run en 6 targets** — Depende: FKR-005 · AC: `release.yml` en modo dry-run construye los 6 binarios (linux con `--use-napi-cross`) y el smoke test en runner nativo ejecuta `versionInfo()`.
- **FKR-007 · Importar ADRs y docs base** — Depende: FKR-001 · AC: `docs/adr/` con ADR-001…018; README, CONTRIBUTING, docs/architecture.md, docs/development.md.

### Épica E1 · Benchmark (M1, M5)

- **FKR-010 · Esquema y manifiesto del benchmark** — Depende: FKR-004 · AC: `benchmarks/manifest.yaml` validado; resultados JSONL validados contra `benchmark-result.schema.json`.
- **FKR-011 · Arnés headless con Claude Code** — Depende: FKR-010 · AC: ejecuta una tarea en contenedor aislado con `--strict-mcp-config`, límites de turnos/tiempo/coste, y extrae usage (incluidos tokens de caché) del JSON del anfitrión.
- **FKR-012 · Evaluador de Task Success** — Depende: FKR-011 · AC: aplica los 5 criterios de FOKER-SPEC §20.4 en contenedor limpio; tests con soluciones correctas, incorrectas y que tocan archivos protegidos.
- **FKR-013 · Fixture A (sintético)** — Depende: FKR-001 · AC: script con semilla genera ~300 archivos / 6 paquetes; ≥ 20 tareas con gold patch y tests ocultos.
- **FKR-014 · Selección de repos reales (Fixture B)** — Depende: PREGUNTA-6 · AC: 2–3 repos fijados por commit con tests offline; ≥ 15 tareas por repo.
- **FKR-015 · Ejecución de línea base (control)** — Depende: FKR-012, FKR-013 · AC: resultados del brazo control para ≥ 10 tareas × 3 repeticiones.
- **FKR-016 · Análisis estadístico e informe** — Depende: FKR-015 · AC: script reproducible (semilla) produce IC bootstrap, Wilcoxon y tablas por tipo de tarea; informe generado, no editado a mano.
- **FKR-017 · Suite `ctx-gold`** — Depende: FKR-013 · AC: ≥ 60 casos (30 en M1) con archivos modificados por el gold patch; evaluador de recall/precisión del pack.
- **FKR-018 · Benchmark completo y publicación** — Depende: FKR-016, M4 · AC: ≥ 40 tareas × 2 brazos × 3; H1/H2 evaluadas; informe en `docs/benchmark-results/0.1.0.md`.

### Épica E2 · Project Map (M2)

- **FKR-020 · Descubrimiento de archivos** — Depende: FKR-005 · AC: respeta `.gitignore`, include/exclude, globs de secretos (nunca leídos, test con `.env`), límites de tamaño/número; no sigue symlinks fuera del root.
- **FKR-021 · `normalizePath` y corpus de rutas** — Depende: FKR-005 · AC: REQ-XPLAT-001…003 con corpus POSIX y Windows; property test (nunca escapa del root, idempotente).
- **FKR-022 · Extracción de símbolos (queries tree-sitter)** — Depende: FKR-020 · AC: snapshots de símbolos (kind, exported, signature, doc, range) para `monorepo-pnpm` y `edge-cases`; `parse_status` correcto con errores de sintaxis.
- **FKR-023 · Resolución de imports con oxc_resolver** — Depende: FKR-022 · AC: REQ-MAP-004 con `resolution-cases`; no resueltos como diagnóstico `FKR-MAP-104`.
- **FKR-024 · Grafo, aristas tipadas y PageRank global** — Depende: FKR-023 · AC: aristas según FOKER-SPEC §8.2; PageRank suma 1 (±1e-9); orden determinista.
- **FKR-025 · Serialización canónica y `content_hash`** — Depende: FKR-024 · AC: REQ-MAP-002 (mismo hash en 3 SO); validación contra el esquema.
- **FKR-026 · Persistencia atómica, lock y corrupción** — Depende: FKR-025 · AC: test que corrompe el archivo → reconstrucción y copia en `cache/corrupt-*`; dos procesos concurrentes no corrompen.
- **FKR-027 · Refresco incremental** — Depende: FKR-026 · AC: REQ-MAP-001 (property test) y REQ-MAP-003 (tiempo medido en `large-10k`).
- **FKR-028 · CLI `foker map`** — Depende: FKR-027, FKR-060 · AC: flags `--full --stats --export --check`; exit codes; salida `--json` válida.
- **FKR-029 · `search`, `fileInfo`, `symbolInfo`, `impact`** — Depende: FKR-024 · AC: snapshots; `impact` respeta dirección y profundidad.

### Épica E3 · Context Engine (M3)

- **FKR-030 · Normalización e intención** — Depende: FKR-024 · AC: tests de tokenización (camel/snake/kebab, rutas), stopwords es/en versionadas, tabla de intención con desempate fijo.
- **FKR-031 · BM25 de símbolos y rutas** — Depende: FKR-030 · AC: puntuaciones deterministas; tests con consultas conocidas.
- **FKR-032 · Semillas y PageRank personalizado** — Depende: FKR-031 · AC: vector `p` según FOKER-SPEC §9.5; factor inverso por intención; fallback sin semillas con `FKR-CTX-101`.
- **FKR-033 · Selección por niveles y presupuesto** — Depende: FKR-032 · AC: algoritmo §9.7; obligatorio que no cabe → `FKR-CTX-001` con desglose; nunca excede el presupuesto (property test).
- **FKR-034 · Renderizado y delimitación** — Depende: FKR-033 · AC: REQ-CTX-002; orden estable→dinámico; secciones `static` sin timestamps (test).
- **FKR-035 · Determinismo del pack** — Depende: FKR-034 · AC: REQ-CTX-001 (50 ejecuciones, distintos hilos, 3 SO).
- **FKR-036 · CLI `foker context`** — Depende: FKR-035, FKR-060 · AC: flags de §16.1; `--explain` muestra razones y descartados.
- **FKR-037 · Calibración con `ctx-gold`** — Depende: FKR-035, FKR-017 · AC: informe de recall/precisión/tokens por configuración; defaults actualizados por ADR si cambian.

### Épica E4 · Política, tareas y validación (M4)

- **FKR-040 · Carga y validación de `foker.config.yaml`** — Depende: FKR-004 · AC: claves desconocidas → `FKR-CFG-001`; defaults; fusión de política (REQ-POL-001).
- **FKR-041 · Workspace trust** — Depende: FKR-040 · AC: `foker trust`; cambio en comandos → no confiado; MCP no puede confiar; `--yes` exige `--ci` y `CI=true`.
- **FKR-042 · Ejecutor seguro de checks** — Depende: FKR-041 · AC: sin shell; env por allowlist; timeout con kill del árbol de procesos (Windows incluido); `${affected_packages}` validado; salida redactada.
- **FKR-043 · Parsers de hallazgos** — Depende: FKR-042 · AC: findings estructurados para tsc, eslint, vitest; `generic` como fallback.
- **FKR-044 · Escáner de secretos integrado** — Depende: FKR-004 · AC: ≥ 20 reglas de alta confianza con tests positivos/negativos; redacción en salidas MCP.
- **FKR-045 · Ledger y FSM de tareas** — Depende: FKR-040 · AC: transiciones de §12.3; transición inválida → `FKR-TSK-002`; cadena de hashes verificable; lease de 4 h.
- **FKR-046 · Baseline y diff** — Depende: FKR-045 · AC: con y sin git; detecta añadidos/modificados/borrados respecto al baseline, incluidos archivos ya sucios al empezar.
- **FKR-047 · Gates G1–G5 y evidencia** — Depende: FKR-042, FKR-044, FKR-046 · AC: REQ-TSK-001 con los cinco escenarios del agente simulado.
- **FKR-048 · CLI `foker task` y `foker validate`** — Depende: FKR-047 · AC: subcomandos de §16.1; `approve` sin TTY → exit 6 (REQ-POL-002); `verify` revalida.

### Épica E5 · MCP (M4)

- **FKR-050 · Servidor MCP stdio con SDK v2** — Depende: FKR-004 · AC: `server/discover` y handshake legado; `tools/list` alfabético; logs a stderr; sin Roots/Sampling/Logging.
- **FKR-051 · Herramientas de lectura** — Depende: FKR-050, FKR-029, FKR-035 · AC: `foker_status`, `foker_search`, `foker_context`, `foker_impact` validan entrada y salida contra `schemas/mcp-tools.json`.
- **FKR-052 · Herramientas de tareas y checks** — Depende: FKR-051, FKR-048 · AC: `foker_check`, `foker_task_begin` (idempotencia por `client_token`), `foker_task_submit`, `foker_task_get`.
- **FKR-053 · Recursos MCP** — Depende: FKR-050 · AC: 4 recursos con `ttlMs` y `cacheScope`.
- **FKR-054 · Límites, rate limit y auditoría** — Depende: FKR-050 · AC: truncado a 80.000 caracteres con aviso; `FKR-MCP-002`; auditoría JSONL con cadena de hashes y sin contenidos.
- **FKR-055 · E2E MCP con clientes 2026-07-28 y 2025-11-25** — Depende: FKR-052 · AC: flujo completo `begin → context → submit` con ambos clientes.

### Épica E6 · CLI, Skills, integraciones, plantilla (M4, M5)

- **FKR-060 · Esqueleto de CLI** — Depende: FKR-004 · AC: flags globales de §16.2, sobre JSON de §16.3, exit codes de §16.4, modo `--ci`/`--non-interactive`; `docs/cli.md` generado (REQ-DOC-001).
- **FKR-061 · `foker skill`** — Depende: FKR-060 · AC: `list/show/validate/new`; REQ-SKL-001…002; avisos de patrones sospechosos.
- **FKR-062 · Skills incluidas** — Depende: FKR-061 · AC: 6 skills de §13.2 validadas; `foker-workflow` probada en el benchmark smoke.
- **FKR-063 · Adaptador Claude Code** — Depende: FKR-060 · AC: genera instrucciones, `.mcp.json`, skills, agentes, permisos y hooks de §14.2; snapshots; hook `PreToolUse` bloquea edición de `.foker/**` en test.
- **FKR-064 · Adaptador OpenCode** — Depende: FKR-060 · AC: `opencode.json` válido contra su esquema público; agentes y skills; verificación de duplicados de skills (R-10) documentada.
- **FKR-065 · Adaptador Antigravity** — Depende: FKR-060 · AC: `.agents/mcp_config.json`, `.agents/rules/foker.md` (≤ 24 KB), skills; nivel "básico" documentado.
- **FKR-066 · `foker sync`** — Depende: FKR-063…065 · AC: REQ-PRJ-001…003; preserva contenido del usuario fuera de bloques; `FKR-SYN-001` ante edición manual del bloque.
- **FKR-067 · `foker init`** — Depende: FKR-066, FKR-040 · AC: en repo existente crea config, `foker/`, `.gitignore`, y ejecuta `sync`; `--dry-run`; `--from-spec` valida frontmatter de `foker.md`.
- **FKR-068 · Plantilla `nextjs-turbo`** — Depende: FKR-067 · AC: proyecto generado pasa `foker validate --profile default`; cabeceras de seguridad verificadas por test E2E; pnpm con `minimumReleaseAge` y `allowBuilds`; matriz ASVS inicial.
- **FKR-069 · `foker doctor`** — Depende: FKR-060 · AC: detecta addon, Node, git, trust, sandbox (aviso), otros servidores MCP, tamaño de `rules.md`, deriva de `sync`.
- **FKR-070 · Verificación manual de anfitriones** — Depende: FKR-066 · AC: checklist REQ-INT-002 completada para Claude Code, OpenCode y Antigravity.

### Épica E7 · Release (M5)

- **FKR-080 · Publicación con trusted publishing** — Depende: FKR-006 · AC: `foker` y `@foker/*` publicados con procedencia desde `release.yml`; `id-token: write` solo en el job de publicación; requiere PREGUNTA-3 resuelta.
- **FKR-081 · Nightly completo** — Depende: FKR-002 · AC: `windows-11-arm`, `macos-15-intel`, Node 22/24/26, property tests ampliados, rendimiento con alerta de regresión > 20 %.
- **FKR-082 · SECURITY.md y política de divulgación** — Depende: — · AC: canal de reporte, alcance, tiempos de respuesta.

## 5. Trazabilidad requisitos → issues

| Requisito | Issue(s) |
|---|---|
| REQ-REPO-001 | FKR-003 |
| REQ-PRJ-001…003 | FKR-066 |
| REQ-NAPI-001…002 | FKR-005, FKR-029 (revisión de código + tests en crates) |
| REQ-NAPI-003 | FKR-005 |
| REQ-XPLAT-001…004 | FKR-021, FKR-025 |
| REQ-MAP-001 | FKR-027 |
| REQ-MAP-002 | FKR-025 |
| REQ-MAP-003 | FKR-027 |
| REQ-MAP-004 | FKR-023 |
| REQ-CTX-001 | FKR-035 |
| REQ-CTX-002 | FKR-034 |
| REQ-CTX-003 | FKR-037 |
| REQ-CTX-004 | FKR-037, FKR-081 |
| REQ-SEC-001 | FKR-011, FKR-012, FKR-002 (checks de CI en contenedor) |
| REQ-POL-001 | FKR-040 |
| REQ-POL-002 | FKR-048 |
| REQ-TSK-001 | FKR-047 |
| REQ-SKL-001…002 | FKR-061 |
| REQ-INT-001 | FKR-063, FKR-064, FKR-065 |
| REQ-INT-002 | FKR-070 |
| REQ-DOC-001 | FKR-060 |
