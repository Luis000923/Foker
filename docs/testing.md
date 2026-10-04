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
macOS arm64/x64, Windows x64/arm64; Linux x64 añade Node 22/24/26. El job de rendimiento usa
large-10k determinista compartido, compara con `benchmarks/perf-baseline.json` mediante
`scripts/perf-check.mjs` y abre issue ante fallo del job programado (umbral de regresión >20 %).
Las mediciones y targets de mapa/contexto están en [project-map.md](project-map.md) y
[context-engine.md](context-engine.md); no prueban H1/H2 del benchmark con agentes.

CI normal comprueba lint, tipos, dependencias, generados y tests en cuatro runners. Su ejecución
en GitHub y las plataformas no verificadas localmente siguen pendientes de evidencia externa
(FKR-002/006/081). REQ-SEC-001 de checks en contenedor es PENDIENTE FKR-002/011/012:
los workflows actuales corren directamente en el runner. No hay informe de cobertura que
acredite el objetivo ≥80 % de §19.2. `ctx-gold` y calibración son PENDIENTE FKR-017/037.
