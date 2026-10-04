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
| `pnpm test` | `cargo nextest run` + `vitest run` |
| `pnpm test:rust` / `pnpm test:ts` | Cada mitad por separado |
| `pnpm clean` | Borra `dist/` y `target/` |

## Organización del código TS

- Cada paquete compila `src/` a `dist/` con `tsc` y publica solo `dist/`.
- Los tests (`*.test.ts`) viven junto al código en `src/` o en `test/`, y no se compilan a `dist/`.
- Los tests y `pnpm typecheck` consumen el código fuente de otros paquetes del workspace sin
  compilar: Vitest usa un alias y `tsc` la condición de exportación `@foker/source`.

## Tests

| Nivel | Herramienta |
|---|---|
| Unit Rust | `cargo nextest` |
| Unit TS | `vitest` |
| Property-based | `proptest`, `fast-check` |
| Snapshot | `insta`, snapshots de `vitest` |
| Contract | `vitest` + `ajv` |
| E2E | `vitest` + `execa` sobre el paquete empaquetado |

Fixtures deterministas en `fixtures/` con salidas doradas en `expected/`. `UPDATE_SNAPSHOTS=1 pnpm test`
las regenera; un cambio en doradas exige revisión explícita. Los fixtures no dependen de red ni de la hora.

## Addon nativo

`pnpm build:native` (FKR-005) compila `foker-napi` para la plataforma local. Las demás plataformas
se compilan en CI (`release.yml`).
