# Estado de Foker

Última actualización: 2026-10-04 · Rama actual: main · Desarrollo con Claude Code + Codex (encargos en worktrees y revisión independiente)

## Hito actual

M0, M2, M3, M4 y E6 completos en local; M1 con todo lo que no gasta API (manifiesto, Fixture A, ctx-gold, evaluador, arnés en contenedor, análisis). Bloqueado por decisiones humanas: ejecución del benchmark (autenticación por suscripción pendiente), Fixture B (PREGUNTA-6), publicación (PREGUNTA-3) y verificación manual de anfitriones (FKR-070).

## Issues

| ID | Título | Estado | Rama | Notas |
|---|---|---|---|---|
| FKR-001 | Inicializar monorepo | hecho | feat/FKR-001-monorepo | pnpm 11 + cargo; 7 paquetes TS y 3 crates; TS 7, Biome 2.5, Vitest 5, nextest |
| FKR-002 | CI base | hecho (local) | feat/FKR-002-ci-base | `ci.yml` validado con actionlint; pasos ejecutados en local. Falta verlo en GitHub |
| FKR-003 | Regla de dependencias | hecho | feat/FKR-003-regla-dependencias | `scripts/check-deps.mjs` + tests negativos TS y Rust |
| FKR-004 | `@foker/schemas` | hecho | feat/FKR-004-schemas | Esquemas reconstruidos desde la spec (ADR-019), Ajv 2020, tipos generados |
| FKR-005 | Addon napi + `versionInfo` | hecho | feat/FKR-005-addon-version | `FKR-INT-002`/`FKR-INT-003` probados. `VersionInfo` según §7.5, sin contrastar con el `.d.ts` original |
| FKR-006 | Release dry-run 6 targets | hecho (local parcial) | feat/FKR-006-release-dry-run | Smoke linux-x64 y cross-build linux-arm64 (glibc 2.17) en local. Resto de targets solo en GitHub |
| FKR-007 | ADRs y docs base | hecho | feat/FKR-007-docs-base | `docs/adr/`, README, CONTRIBUTING, architecture, development, roadmap |
| FKR-020 | Descubrimiento de archivos | hecho | feat/FKR-020-descubrimiento | `.gitignore`, secretos nunca leídos, límites, symlinks |
| FKR-021 | `normalizePath` | hecho | feat/FKR-021-normalize-path | Corpus de 41 casos POSIX/Windows + proptest |
| FKR-022 | Extracción de símbolos | hecho | feat/FKR-022-simbolos | Recorrido del árbol (ADR-020); snapshots |
| FKR-023 | Resolución con oxc_resolver | hecho | feat/FKR-023-resolucion | Dorado `resolution-cases` (REQ-MAP-004) |
| FKR-024 | Grafo y PageRank | hecho | feat/FKR-024-grafo | Corrige no determinismo por caché compartida |
| FKR-025 | JSON canónico y `content_hash` | hecho | feat/FKR-024-grafo | Dorado de `monorepo-pnpm` (REQ-MAP-002 en CI 3 SO pendiente) |
| FKR-026 | Persistencia, lock, corrupción | hecho | feat/FKR-026-persistencia | |
| FKR-027 | Refresco incremental | hecho | feat/FKR-027-incremental | REQ-MAP-001 proptest; 24 ms sin cambios en 10k archivos |
| FKR-028 | `foker map` | hecho | feat/FKR-060-cli | Codex; `--check`/`--dry-run` en solo lectura |
| FKR-029 | Consultas + `FokerEngine` | hecho | feat/FKR-029-consultas | Contrato: mapa valida contra el esquema; ADR-021 |
| FKR-030…035 | Context Engine | hecho | feat/FKR-030-context-engine | REQ-CTX-001 (50 ejecuciones), REQ-CTX-004 p95 221 ms en 10k |
| FKR-036 | `foker context` + buildContext | hecho | feat/FKR-036-context-cli | Pack valida contra el esquema |
| FKR-037 | Calibración con ctx-gold | hecho (resultado negativo) | feat/FKR-037-calibracion | ADR-024 Rechazada: recall validación 0,63 < TARGET 0,80; propuestas de algoritmo |
| FKR-010/012/013/017 | Manifiesto, evaluador, Fixture A, ctx-gold | hecho | feat/FKR-010-benchmark-base | 20 tareas verificadas con install real; ctx-gold 30 casos (AC final ≥ 60) |
| FKR-011/016 | Arnés headless y análisis | hecho (sin ejecución real) | feat/FKR-011-arnes | Imagen foker-bench construida y probada; falta PREGUNTA-2 |
| FKR-014/015/018 | Fixture B, línea base, benchmark completo | bloqueado | — | PREGUNTA-6 y PREGUNTA-2 |
| FKR-093 | Criterios reproducibles y candidatos para Fixture B | hecho (documentación) | feat/FKR-093-fixture-b-criterios | [Criterios](bench/fixture-b-criterios.md), [8 candidatos](bench/fixture-b-candidatos.md) y propuesta compatible de manifiesto; SHAs/tamaños/offline pendientes, selección humana PREGUNTA-6 |
| FKR-095 | Dataset ctx-gold de símbolos del historial foker-self | hecho | feat/FKR-095-ctx-gold-simbolos | [Metodología y resultados](../benchmarks/ctx-gold/foker-self/README.md): 8 casos (2 calibration / 6 validation), 43 descartes; generación reproducible, base 0 verificada; Biome, tsc y 49 tests benchmarks pasan; sin commits |
| FKR-080 | Publicación npm | bloqueado | — | PREGUNTA-3 |
| FKR-040…042 | Config, trust, ejecutor seguro | hecho | feat/FKR-040-config-trust-exec | ADR-022 (shims .cmd en Windows) |
| FKR-043/044 | Parsers de hallazgos, escáner de secretos | hecho | feat/FKR-043-parsers-secretos | 24 reglas |
| FKR-045/046 | Ledger + FSM, baseline | hecho | feat/FKR-045-ledger-baseline | Evidencia inmutable, baseline autenticada |
| FKR-047/048 | Gates G1–G5, `foker task`/`validate` | hecho | feat/FKR-047-gates-cli | REQ-TSK-001 E2E con agente simulado |
| FKR-050…055 | Servidor MCP | hecho | feat/FKR-050-mcp | SDK v2 2.3.0; E2E 2026-07-28 y 2025-11-25 |
| FKR-061/062 | Skills y 6 skills incluidas | hecho | feat/FKR-061-skills | ADR-023 |
| FKR-063…066 | Adaptadores y `foker sync` | hecho | feat/FKR-063-sync | REQ-PRJ-001…003, REQ-INT-001 (esquema OpenCode) |
| FKR-067 | `foker init` | hecho | feat/FKR-067-init | |
| FKR-068 | Plantilla `nextjs-turbo` | hecho | feat/FKR-068-plantilla | Probada con install, validate y build reales |
| FKR-069 | `foker doctor` | hecho | feat/FKR-069-doctor | |
| FKR-070 | Verificación manual de anfitriones | pendiente (humano) | — | Checklist en docs/integrations/verification.md |
| FKR-081/082 | Nightly, SECURITY.md | hecho | feat/FKR-081-082-nightly-security | |
| FKR-091 | Recall en el flujo `foker_task_begin` | hecho | feat/FKR-091-recall | ADR-032: recall del flujo 0,3319 → 0,7611 (pack 0,7444 sin cambios); plegado flexivo medido y desactivado; revisión Codex 3/3 válidos corregidos |
| FKR-094 | Fase 3 · vista focal por símbolo | hecho | feat/FKR-094-contexto-simbolo | ADR-033: anclas grandes que no caben se entregan con cuerpos focales en lugar de L2; foker-self validation recall de símbolos 0,289 → 0,442 sin regresiones; Fixture A idéntico; revisiones Codex + Claude 11/11 válidos corregidos |
| FKR-096 | Contenido completo de L2 pequeños | hecho | feat/FKR-096-cuerpo-pequeno | ADR-034: Δ ≤ 64 tokens (a priori); sin barrels; gold_full 0,167 → 0,436, recall igual, +11,5 % tokens; revisiones Codex ×2 + Claude |
| FKR-060 | Esqueleto de CLI | hecho | feat/FKR-060-cli | Codex; `docs/cli.md` generado (REQ-DOC-001) |
| FKR-092 | Medir y clasificar overhead fijo del anfitrión | hecho (local) | feat/FKR-092-overhead-anfitrion | Análisis determinista y 24 runs smoke-3…6; primer turno control ~15,7k, Foker ~17k; Δ smoke-6 1.316 tokens; internos no observables marcados INFERIDOS. Biome/tsc verdes, 40 tests benchmark verdes con addon externo de solo lectura |

## Trabajo 2026-10-05

- **FKR-014 · Parte A completada (rama feat/FKR-014-fixture-b)**: minado determinista con las
  reglas congeladas de ADR-035 y regex literales de `tools/eligibility.py`. Vite: 112 candidatos,
  500 rechazos; Query: 69/863; Zod: 169/267. Primer motivo registrado y orden por semilla;
  seis JSONL idénticos byte a byte en dos ejecuciones. Detalle de motivos e interpretaciones
  en [README de Fixture B](../benchmarks/fixture-b/README.md). Biome benchmarks, tsc global
  (tras generar el dist local de core) y Vitest Fixture B verdes, 2 tests con repo sintético.
  Sin red ni commits. FKR-014 completo sigue pendiente de F2P/P2P y curación posterior.

## Trabajo 2026-10-04

- **FKR-014 · Fixture B (en curso, rama feat/FKR-014-fixture-b)**. PREGUNTA-6: Vite, TanStack
  Query y Zod, pendientes de validar E1–E8. ADR-035 congela SHAs, ventana y reglas de minado antes
  de enumerar candidatos. Expediente fuera del repo en `~/Documentos/foker-fixture-b`
  (clones, `tools/eligibility.py`, `tools/env_check.sh`, `eligibility/*.json`, `env/*/run*`).
  E1/E2/E3: los tres son MIT con TS ≥ 94 %; Vite tiene tamaño «mixto», Query es medium y
  monorepo, Zod tiene 162 archivos y 31k LOC. E4/E8: Query superó la 1.ª preparación
  (install 105 s, evaluación offline 43 s). Vite necesita Node 24.16 (el corepack de Node 22.14
  no activa pnpm 12) y Zod necesita `nub` 0.8.3 (instalador curl fijado), ambos relanzados.
  Pendiente: 2.ª y 3.ª preparaciones, verificación F2P/P2P, enunciados,
  ctx-gold B, evaluación offline y entorno del arnés por repo. **Benchmark pagado sin autorizar.**

- **FKR-096 · Contenido completo de L2 pequeños (ADR-034)**. Umbral fijado antes de implementar:
  Δ = completo − firmas ≤ 64 tokens, nunca en barrels. ctx-gold: recall igual, `gold_full`
  0,167 → 0,436 (flujo 0,394), +11,5 % de tokens del pack. Límite del anfitrión declarado: Claude
  Code exige `Read` antes de editar, así que solo son evitables los `Read` de archivos no editados.
  **smoke-8**: 0 `Read` evitados (el de `skuMatches.ts` era obligatorio porque se editó;
  `baseline.test.ts` viajaba en L1). Éxito 2/3 por brazo, igual que en smoke-7; pack +9–19 %;
  tokens Foker a-01 −17 %, a-15 +1 %, a-09 −2 %, dentro del ruido. No se declara mejora; el
  umbral no se ajusta. Fin de la optimización sobre Fixture A: siguiente evidencia, Fixture B.

- **FKR-094 · Fase 3, vista focal por símbolo (ADR-033)**. Un ancla grande que no cabe
  completa ya no se degrada a L2 sin cuerpos. Se entrega como L3 focal: cuerpos completos del
  foco (anclas de símbolo, identificadores citados y BM25 dentro del archivo), firmas de lo que
  usa, nombres del resto y marcas de omisión dentro de `rendered`. Medida con el ctx-gold de
  símbolos `foker-self` (FKR-095, Codex): validation 0,289 → 0,442 sin regresiones, +15 % de
  tokens de ancla, mismo total de pack. La política A (sustituir también L3 que caben) se
  rechazó por una regresión. Fixture A, byte a byte idéntico. n = 8: indicativo, revalidar con
  Fixture B.
- **smoke-7** (mismo manifiesto que smoke-6, imagen reconstruida desde main): a-09 Foker
  169k → 125k tokens, 8 → 6 llamadas, sin Bash ni `foker_search` (el pack ya trae
  `skuMatches.ts`); Foker/control en a-09 1,20x → 0,88x. Éxito igual (2/3 por brazo; a-09 falla
  en ambos por el consumidor `ui/`). a-01 1,43x y a-15 1,53x; variabilidad de ±25 % con n = 1.
  Detalle en ADR-032.

- **FKR-091 · Recall en el flujo begin (ADR-032)**. Causa de a-09 en smoke-6: el pack
  **definitivo** de `foker_task_begin` (con `taskScope` derivado) perdía `skuMatches.ts`,
  aunque el preliminar lo tenía. Las anclas inexistentes del modelo no influían. `TASK_SCOPE`
  daba 0,5 a cada uno de ~50 archivos y anulaba la señal léxica en el PPR. ctx-gold no lo
  veía porque nunca pasaba `taskScope`. Nuevo modo `flow` en ctx-gold: recall del flujo
  **0,3319 → 0,7611** (val. 0,7833); cobertura de alcance 0,8028 → 0,8319; rechazos de
  begin 2 → 0. Correcciones: masa fija 1/n del alcance; el alcance derivado antepone la
  señal directa; un archivo de la raíz se acota a sí mismo (`**` siempre era rechazado). El
  plegado flexivo es/en sube el recall de calibration a 0,806, pero regresa a-49: queda
  desactivado. El recall del pack (REQ-CTX-003) sigue en 0,7444: el TARGET 0,80 está
  pendiente y los fallos restantes son de vocabulario o sinonimia y de archivos nuevos.
- **FKR-092 · Overhead del anfitrión**: script `host-overhead` deduplica por `message.id`
  y separa entrada/caché/salida, base inicial y crecimiento. [Informe](bench/overhead-anfitrion.md)
  de 24 ejecuciones: smoke-6 control 15.703–15.718 tokens iniciales, Foker 17.019–17.034,
  diferencial pareado 1.316; ~11.914 es un bloque cacheado, no toda la entrada inicial.
  Lectura cacheada 96,54 % control / 91,44 % Foker; escritura TTL 1h explica la diferencia
  entre coste reportado y manifiesto (1,5 USD/M escritos). a-09: 8 llamadas por brazo.
  Archivos generados medidos en bytes; system/tools internos sin desglose observable.
  Biome y tipos verdes; 40 tests benchmark pasan tras build TS y preload temporal de addon
  existente de solo lectura (faltaba en el worktree); sin cambios de Rust/anfitrión/dataset.
  Implementado por Codex en worktree; commit, revisión y `pnpm verify` tras el merge por Claude.

- **ADR-031 fases 1b/1c/2/2b**: pack sin pérdida (rangos de hermanos, L2 compartido, firma inline;
  diccionario de macros rechazado por riesgo de calidad). ctx-gold: mediana rendered 5552 → 903
  (−83,7 %; o200k 664) con recall idéntico. MCP: código del pack en `structuredContent` (Claude Code
  no entrega `content[0]`), `foker_task_begin` con `context`, flujo obligatorio 4 → 2 llamadas;
  2b: alcance inexistente rechazado antes de crear tarea, `scope` derivable del pack.
- **Smoke real `bench-smoke-5`** (antes de 2b): éxito 2/3 por brazo, igual que smoke-4. Archivos
  expuestos 56 → 1 (a-01). Tokens de entrada Foker: a-01 219k → 201k, a-09 222k → 141k,
  a-15 151k → 174k (control ~64–67k; a-09 control 165k, falla). En a-01 y a-15 el modelo adivinó
  `scope: src/**`, abrió una segunda tarea y cerró la huérfana: +3 llamadas. Corregido en 2b;
  falta medirlo con un smoke nuevo.
- **Smoke real `bench-smoke-6`** (tras 2b): tokens Foker/control a-01 1,83x, a-15 1,21x (4 llamadas,
  igual que control), a-09 1,20x (falla en ambos). Sobrecoste Foker en éxitos −63 % y −85 % frente a
  smoke-4. Sin tareas huérfanas. Pendiente: recall (a-09 omite `skuMatches.ts`) y fase 3.
- **ADR-031 fase 1 · Pack compacto v2**: implementada y medida sin red ni git de escritura.
  Recall idéntico por caso en los 60 ctx-gold (total 0,7444; calibration 0,7389;
  validation 0,7500). Mediana rendered 5552 → 1049 (−81,11 %); no alcanza −85 %.
  Parámetros elegidos solo con calibration, rejilla de 72 configuraciones en el ADR.
  Motor, confianza, esquema compatible v1/v2, métricas y snapshots actualizados.
  Fases 2/3 pendientes. `pnpm verify` verde (125 Rust, 545 TS); `contextSchema` = 2.

- **Sin claves API (ADR-027)**: requisito del usuario. Foker no llama a LLMs; con una sola
  suscripción (Claude Code, Codex/ChatGPT o Antigravity) se usan las mismas reglas, contexto,
  skills, roles y gates. Nuevo target `codex` (`AGENTS.md`, `.agents/skills/`, MCP y roles en
  `.codex/config.toml`); test de paridad entre los 4 targets (catálogo MCP real, hash normativo,
  skills, roles, ningún `*_API_KEY`); doctor comprueba CLI y sesión sin leer credenciales.
  Codex 0.159.3 carga reglas y skills del proyecto (`codex debug prompt-input`); MCP y roles con
  sesión real: PENDIENTE FKR-070.
- **REQ-SEC-001 (ADR-026)**: jobs Linux en `rust:1.98.0-bookworm` (contenedor condicional en
  matrices mixtas); macOS/Windows en runner alojado efímero sin secretos, `contents: read`,
  `persist-credentials: false`, sin self-hosted. Matrices completas de FKR-002/006/081 intactas.
  `scripts/check-ci-sandbox.mjs` lo impone (18 tests). Pendiente ejecución real en GitHub.
- **Cobertura ≥ 80 % (§19.2)**: foker-map 91,04 %, foker-context 95,59 %, @foker/policy 91,67 %,
  @foker/engine 95,89 %; umbrales V8, `pnpm coverage:rs` / `coverage:ts`, job nightly.
- **ctx-gold 60 casos** con split estratificado 30/30; calibrate usa solo `calibration`.
  Recall (presupuesto 8000): calibration 0,622 · validation 0,600 · total 0,611 (TARGET 0,80).
- **Recall (ADR-028)**: expansión léxica es↔en v1 (80 grupos de vocabulario general) y corte
  relativo del ranking (1 %), calibrado solo con `calibration`. Recall validation 0,600 → 0,750,
  calibration 0,622 → 0,739; tokens medios del pack 6.650 → 5.243. TARGET 0,80 aún pendiente.
- **Benchmark por suscripción (ADR-029)**: Claude Code con `CLAUDE_CODE_OAUTH_TOKEN`
  (`claude setup-token`) o `ANTHROPIC_API_KEY`; anfitrión `codex` con `--codex-auth-dir`
  explícito montado en solo lectura; `billing` subscription/api y coste como equivalente API.
  Imagen Docker con Codex pendiente de reconstruir; smoke real pendiente de permiso (consume cuota).
- **Smoke real del benchmark** (`bench-smoke-3`, claude-sonnet-5-5 por suscripción, 3 tareas × 2 brazos):
  arnés validado de punta a punta tras corregir root MCP (`--root .`), salida truncada a 64 KiB,
  pnpm sin bit de ejecución, `/tmp` noexec, verifyDepsBeforeRun de pnpm 11 y permiso de tools MCP en `-p`.
  Éxito 2/3 en ambos brazos (a-09 falla en ambos: no adaptan el consumidor `ui/referenceSearch`).
  Foker gasta ~4,5x tokens de entrada (298k vs 66k por tarea exitosa; 0,16 vs 0,02 USD equivalentes).
  Causa medida: `foker_task_begin` devuelve ~9.100 tokens (`dirty_files` con 409 rutas de node_modules) y
  `foker_task_submit` ~2.000–4.400 (`output_tail` de checks que pasan, con ANSI). Corrección implementada en MCP y prepare (ADR-030); medición posterior pendiente.
  El control no puede ejecutar tests por Bash en `-p`: revisar equidad antes de la línea base.
- ADR-030: respuestas MCP compactas (`dirty_files` ≤ 20 rutas con totales, sin node_modules;
  `output_tail` solo en checks no superados y sin ANSI) y node_modules excluido del git del fixture.
- **Smoke tras ADR-030** (`bench-smoke-4`): task_begin ~9.100 → ~250 tokens, submit ~4.400 → ~220.
  Coste Foker −40–50 % (a-01 0,170 → 0,100; a-15 0,149 → 0,071; a-09 0,198 → 0,105 USD equiv.), mismo
  éxito 2/3 por brazo. Sigue ~2,4–3x el control: el flujo obligatorio suma turnos (9–15 frente a 4) y cada
  turno relee el contexto en caché; en tareas de un archivo el coste fijo de Foker domina.
- Verificación local completa: 120 tests Rust (2 omitidos), 542 TS, clippy, Biome, tsc,
  check:deps, generate:check.

## Verificado localmente

Sesión 2026-10-03 (usuario luis):

- node v26.10.0, pnpm 11.9.0, rustc/cargo 1.98.0 (fijado en `rust-toolchain.toml`).
- cargo-nextest y cargo-deny instalados con `cargo install --locked`; actionlint 1.7.12 con pacman.
- `pnpm test` (build:native + 3 tests Rust + 26 tests TS), `pnpm lint`, `pnpm typecheck`,
  `pnpm check:deps`, `cargo clippy -D warnings`, `cargo fmt --check`, `cargo deny check`: verdes.
- `node scripts/smoke-native.mjs x86_64-unknown-linux-gnu`: OK.

## Pendiente de verificar fuera de local

- `ci.yml` y `release.yml` en GitHub Actions (no hay remoto: decisión del usuario).
- Smoke de darwin x64/arm64, win32 x64/arm64 y linux arm64 en runners nativos.

## PENDIENTES y preguntas para el usuario

- PREGUNTA-6 / FKR-093: decidir repos de Fixture B tras revisar [criterios](bench/fixture-b-criterios.md) y [candidatos](bench/fixture-b-candidatos.md); verificar SHAs, licencias al commit, conteos TS/LOC, ≥ 15 tareas por repo y tiempos/tests offline. Propuestas metodológicas requieren ADR; no se modificó manifiesto ni esquema.

- spec/ es una reconstrucción; contratos reescritos por decisión del usuario (ADR-019).
- PREGUNTA-2: modelo `claude-sonnet-5-5` y 2 USD/ejecución fijados; sin API key, el benchmark pasará a suscripción (ADR-027). PREGUNTA-6 (repos reales) bloquea Fixture B.
- Restos de un test en la raíz del repo (`.claude/agents`, `.claude/skills`, `.claude/settings.json`,
  `.mcp.json`, `foker.config.yaml`, `foker/`): el permiso de borrado me fue denegado; los debe borrar la
  persona. Mientras tanto, los commits añaden rutas explícitas (no `git add -A`).
- Otra sesión trabaja en el worktree `../Foker-agentes` (rama `chore/sistema-agentes`).
- El sandbox de Codex no tiene red: no puede ejecutar `pnpm` (descarga la versión fijada); se le
  pide usar `./node_modules/.bin/*` y yo ejecuto `pnpm verify` antes de cada merge.
- Decidido: solo local, sin remoto ni push. `foker-vault/` y los `.txt` de la raíz quedan fuera del repo.

## Siguiente paso

1. **PREGUNTA-6 · Fixture B (prioridad)**: elegir 2–3 repositorios reales con los criterios y
   candidatos de docs/bench/fixture-b-*.md; después, FKR-014 (fixture), FKR-015 (línea base) y
   un ctx-gold de repositorios reales para revalidar ADR-032/033/034 y el plegado flexivo.
2. No seguir ajustando umbrales sobre Fixture A (ADR-034).
3. FKR-070: verificación manual de los cuatro anfitriones (incluido Codex).
