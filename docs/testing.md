# Tests y verificación

FOKER-SPEC §19.1 define niveles; esta tabla describe lo que existe hoy, no una cobertura certificada.
Los comandos de desarrollo están en [development.md](development.md).

| Nivel | Herramientas y ubicación actual |
|---|---|
| Unit Rust | cargo-nextest/cargo test; módulos de `crates/foker-map/src/`, `crates/foker-context/src/`. foker-napi delega; contratos se prueban en core. |
| Unit TS | Vitest; `packages/*/src/**/*.test.ts`, tests de scripts en `scripts/`. |
| Property | proptest: path.rs, `crates/foker-map/tests/incremental.rs`, `crates/foker-context/tests/context.rs`. No hay uso actual de fast-check aunque §19.1 lo prevé. |
| Snapshot/dorado | insta en context/tests/snapshots y map/tests/snapshots; Vitest en __snapshots__; dorados propios de fixtures. |
| Contratos | Ajv en `packages/schemas/src/schemas.test.ts`; addon y formatos en core/engine contract.test.ts; MCP valida entrada/salida. |
| Integración/E2E | Rust en crates/*/tests; agente simulado en `packages/cli/src/tasks.e2e.test.ts`; MCP en `packages/mcp/src/server.e2e.test.ts` para ambos protocolos. CLI se invoca en proceso con directorios temporales: no es E2E del paquete foker instalado. |
| Empaquetado | `scripts/smoke-native.mjs`, release dry-run: tarballs de core/plataforma instalados en directorio limpio. Publicación PENDIENTE FKR-080. |
| Anfitrión real | PENDIENTE FKR-070, checklist manual en integrations/verification.md. Arnés headless PENDIENTE FKR-011. |

## Fixtures y regeneración

`fixtures/monorepo-pnpm`, `edge-cases` y `resolution-cases` cubren mapas, parseo y resolución;
`crates/foker-map/tests/paths_corpus.rs` contiene el corpus de rutas. Los tests TS también crean repos temporales.
`crates/foker-map/tests/map_build.rs` compara `fixtures/*/expected/` (mapa, hash y resolución).
Revisa siempre el diff del resultado regenerado:

```sh
UPDATE_SNAPSHOTS=1 cargo test -p foker-map --test map_build
INSTA_UPDATE=always cargo test --workspace
./node_modules/.bin/vitest run --update
```

El primero actualiza los dorados propios; el segundo snapshots de insta; el tercero snapshots
Vitest. `UPDATE_SNAPSHOTS=1` por sí solo no actualiza insta ni snapshots Vitest.
Para documentos generados:

```sh
node packages/schemas/scripts/generate.mjs
UPDATE_SNAPSHOTS=1 ./node_modules/.bin/vitest run packages/cli/src/docs.test.ts packages/schemas/src/docs.test.ts
node packages/schemas/scripts/generate.mjs --check
```

REQ-DOC-001: generate:check en CI comprueba configuration.md junto con tipos/códigos; los tests
Vitest comparan configuration.md y cli.md con sus fuentes. `gen-config-docs.mjs` ejecuta la resolución
pura de defaults TS sin cargar el addon y lee los defaults del mapa Rust.

## Propiedades, nightly y rendimiento

`PROPTEST_CASES` aumenta los casos Rust. Incremental usa 24 por defecto y contexto 80; rutas usa
la configuración predeterminada de proptest. Las semillas de regresión de rutas están versionadas
en `crates/foker-map/proptest-regressions/path.txt`.

```sh
PROPTEST_CASES=1000 cargo nextest run --workspace
cargo nextest run --workspace --release --run-ignored only -E 'binary(perf_large)' --no-capture
```

`.github/workflows/nightly.yml` amplía propiedades a 1000 y cubre Linux x64/arm64,
macos-15, macos-15-intel, windows-2025 y windows-11-arm con Rust 1.98.0.
Ubuntu x64 añade Node 24/26 a Node 22.14.0. El job de rendimiento usa
large-10k determinista compartido, compara con `benchmarks/perf-baseline.json` mediante
`scripts/perf-check.mjs` y abre issue ante fallo del job programado (umbral de regresión >20 %).
Las mediciones y targets de mapa/contexto están en [project-map.md](project-map.md) y
[context-engine.md](context-engine.md); no prueban H1/H2 del benchmark con agentes.

CI normal comprueba lint, tipos, dependencias, generados y tests en Linux x64/arm64,
macos-15 y windows-2025. Release construye los seis targets del addon y ejecuta cada
smoke test en runner nativo. Linux usa el contenedor exacto `rust:1.98.0-bookworm`;
macOS/Windows usan VM alojadas efímeras según
[ADR-026](adr/ADR-026-aislamiento-ci-multiplataforma.md), sin secrets, con permisos
`contents: read` y checkout sin credenciales persistentes. Los runners self-hosted
están prohibidos. CI y release usan Node 22.14.0; nightly añade las versiones indicadas.
No hace falta reconstruir una imagen propia.

```sh
node scripts/check-ci-sandbox.mjs
./node_modules/.bin/vitest run scripts/check-ci-sandbox.test.ts
actionlint
```

El test comprueba los workflows reales, contenedor exacto/condicional y allowlist
macOS/Windows. Rechaza Linux sin contenedor, runners desconocidos o self-hosted,
expresiones alteradas, secretos, github.token, montajes, options/credentials, permisos
elevados y credenciales persistentes (REQ-SEC-001). El script valida
el subconjunto YAML de bloques del repo; actionlint valida además la sintaxis de Actions.
La ejecución en GitHub sigue pendiente de evidencia externa (FKR-002/006/081).

La revisión local de ADR-026 pasa actionlint, el validador, sus 18 tests Vitest y
Biome sobre ambos scripts. Incluye jobs que solo invocan acciones, permisos globales
adicionales, varios checkouts y acceso al contexto completo de secretos.

## Cobertura de líneas (FOKER-SPEC §19.2)

Medición local del 2026-10-04; el backlog remite a los criterios de calidad de la spec,
sin issue específico para este TARGET. Los cuatro componentes ya superaban el objetivo
con sus pruebas de integración; se añaden casos de error significativos y umbrales de regresión.

| Componente | Antes | Después |
|---|---:|---:|
| `foker-map` | 90,84 % (3671/4041) | 91,04 % (3679/4041) |
| `foker-context` | 94,93 % (1441/1518) | 95,59 % (1495/1564) |
| `@foker/policy` | 87,50 % (147/168) | 91,67 % (154/168) |
| `@foker/engine` | 95,89 % (676/705) | 95,89 % (676/705) |

Rust: línea base con `cargo llvm-cov -p foker-map -p foker-context --offline --summary-only`,
agrupando líneas por directorio `src` de cada crate. La medición final ejecuta cada crate
por separado; contexto excluye su dependencia `foker-map` del informe y del umbral.
LLVM cuenta también los módulos unitarios compilados dentro de `src`; el aumento del
denominador de contexto corresponde a sus nuevos tests. Las pruebas de rendimiento
ignoradas no se ejecutan. Las diferencias de ejecución entre mediciones pueden variar
ligeramente los resultados; los umbrales se comprueban por componente.

TypeScript: misma selección antes/después (`packages/policy packages/engine packages/cli`),
V8 con todo `src/**/*.ts` de policy y engine incluido, excepto tests. CLI aporta las
pruebas de integración de los gates; su código no entra en el denominador. La línea
base usó `--coverage.reportOnFailure` por un fallo previo del test de stdout: el proceso
Node terminaba sin entregar su escritura asíncrona en este entorno. El test ahora usa
escritura síncrona y conserva las aserciones de salida, argv y filtrado de entorno.
No se cambia código de producción. ULID gana cobertura de ramas de error, aunque sus
líneas ya estaban cubiertas.

```sh
# Equivalentes locales de coverage:rs y coverage:ts, sin red ni resolución de pnpm.
cargo llvm-cov -p foker-map --offline --summary-only --fail-under-lines 80
cargo llvm-cov -p foker-context --offline --summary-only --ignore-filename-regex foker-map/ --fail-under-lines 80
./node_modules/.bin/vitest run packages/policy packages/engine packages/cli --coverage
```

`coverage:rs` exige ≥80 % por crate y `coverage:ts` usa los umbrales independientes
por paquete de `vitest.config.ts`. V8 genera texto, `coverage-summary.json` y LCOV en
`coverage/`. Nightly añade un job en el mismo contenedor Rust/Node que los demás jobs,
instala cargo-llvm-cov 0.9.1 y conserva los informes TS como artefactos durante 30 días.
Su ejecución real en GitHub queda pendiente.

Verificación final: 323 tests Vitest afectados y 115 tests nextest aprobados;
2 tests de rendimiento omitidos. Biome de los archivos TS/JSON modificados, tsc de ambos paquetes y raíz, fmt, clippy offline,
actionlint y el validador de aislamiento pasan. La suite completa final pasa 509 tests y falla en 4 casos ajenos a cobertura: dos tests MCP por cierre del transporte stdio y dos tests
de esquemas/docs por `spawnSync node EPERM` del sandbox. `pnpm verify` no se ejecuta
porque requeriría resolver pnpm por red. `biome check .` falla exclusivamente por el
formato del archivo local sin seguimiento `.mcp.json`, que no se modifica por instrucción
del usuario. No se declara la verificación global en verde.
