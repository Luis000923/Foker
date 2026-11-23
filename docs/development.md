# Desarrollo de Foker

Resumen de FOKER-SPEC §7.7 y §19.

## Entorno

| Herramienta | Versión | Cómo |
|---|---|---|
| Node.js | ≥ 22.14 | Sistema o gestor de versiones |
| pnpm | `packageManager` de `package.json` | `corepack enable` o instalador de pnpm |
| Rust | `rust-toolchain.toml` | rustup instala la versión fijada al primer `cargo` |
| cargo-nextest, cargo-deny | última | `cargo install cargo-nextest cargo-deny --locked` |
| actionlint (opcional) | última | Valida `.github/workflows/` |

## Comandos

| Comando | Qué hace |
|---|---|
| `pnpm install` | Instala dependencias JS |
| `pnpm build` | Compila los paquetes TS (`dist/`) en orden topológico |
| `pnpm typecheck` | `tsc` sobre todo el código TS, tests y scripts incluidos |
| `pnpm lint` / `pnpm format` | Biome |
| `pnpm check:deps` | Regla de dependencias entre módulos (REQ-REPO-001) |
| `pnpm build:native` | Compila el addon `foker-napi` para la plataforma local (`packages/core/*.node`) |
| `pnpm clean` | Borra `dist/` y `target/` |
| `pnpm verify` | Todo lo que exige la Definition of Done: fmt, clippy, Biome, tsc, regla de dependencias, generados y tests |

## Organización del código TS

- Cada paquete compila `src/` a `dist/` con `tsc` y publica solo `dist/`.
- Los tests (`*.test.ts`) viven junto al código en `src/` o en `test/`, y no se compilan a `dist/`.
- Los tests y `pnpm typecheck` consumen el código fuente de otros paquetes del workspace sin
  compilar: Vitest usa un alias y `tsc` la condición de exportación `@foker/source`.

## Esquemas y tipos

`packages/schemas/schemas/*.json` (JSON Schema 2020-12) son la fuente única de los formatos de Foker
(ADR-019). Tras cambiar un esquema o `data/error-codes.json`:

```sh
pnpm --filter @foker/schemas run generate   # src/generated/types.ts y packages/core/src/error-codes.generated.ts
```

CI falla si los generados están desactualizados (`generate:check`). Los ejemplos de `examples/`
reproducen los de FOKER-SPEC y se validan en los tests. `mcpTools()` publica los esquemas de las
herramientas MCP autocontenidos (sin `$ref`), como exigen los clientes.

## Tests

| Nivel | Herramienta |
|---|---|
| Unit e integración Rust | `cargo test --workspace` (`crates/*/tests/`) |
| Unit TS | `node:test` nativo (Node ≥ 22.18 quita los tipos): `packages/*/test/*.test.ts` |
| E2E MCP | `node:test` lanzando `foker mcp` por stdio (`packages/mcp/test/`) |
| Tokens y latencia | `pnpm bench:tokens -- --baseline-ref <ref>` ([informe](benchmarks/tokens.md)) |

`pnpm test` compila los paquetes, ejecuta los tests TS contra `dist/` (los importan por nombre de
paquete; `tsc` los comprueba contra `src/` con la condición `@foker/source`) y después `cargo test`.
Los tests no dependen de red ni de la hora; los fixtures se crean en directorios temporales.

## Addon nativo

`pnpm build:native` ejecuta `napi build --platform --release` en `packages/core`. Genera:

- `foker-core.<plataforma>.node`: el binario (ignorado por git).
- `binding.cjs` y `binding.d.cts`: cargador y tipos generados por napi-rs. Se versionan; regenéralos
  y revisa el diff al cambiar la API nativa.

`@foker/core` carga el binario y exige que `versionInfo().coreVersion` coincida con su propia versión
(REQ-NAPI-003, `FKR-INT-002`). Sin binario para la plataforma lanza `FKR-INT-003`.

Reglas del crate `foker-napi`:

- Solo delega en `foker-map` y `foker-context` (REQ-NAPI-001); sus tests viven en esos crates y en `@foker/core`.
- Cada función exportada envuelve su cuerpo en `guard()`, que convierte un pánico en `FKR-INT-001`.
- Las funciones `#[napi]` escriben `napi::Result<T, FokerCode>` de forma literal; la macro no expande alias.

Las demás plataformas se compilan en CI (`release.yml`): Linux con `--use-napi-cross` (glibc ≥ 2.17),
macOS y Windows (x64 y ARM64) en sus runners. Windows ARM64 se compila y se prueba, pero no se publica en la beta (ADR-014): por eso `PLATFORMS` en `scripts/native-pack.mjs` solo lista las plataformas publicadas y `BUILD_PLATFORMS` añade las que solo se compilan. `node scripts/smoke-native.mjs <target> <dir>` empaqueta `@foker/core`
y su paquete de plataforma con `npm pack`, los instala en un directorio limpio y ejecuta `versionInfo()`.
