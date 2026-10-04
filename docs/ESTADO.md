# Estado de Foker

Última actualización: 2026-10-03 · Rama actual: main

## Hito actual

M0 · Fundaciones — criterio de salida (spec/ROADMAP-BACKLOG.md §2)

## Issues

| ID | Título | Estado | Rama | Notas |
|---|---|---|---|---|
| FKR-001 | Inicializar monorepo | hecho | feat/FKR-001-monorepo | pnpm 11 + cargo; 7 paquetes TS y 3 crates; TS 7, Biome 2.5, Vitest 5, nextest |
| FKR-002 | CI base | hecho (local) | feat/FKR-002-ci-base | `ci.yml` validado con actionlint; pasos ejecutados en local. Falta verlo en GitHub |
| FKR-003 | Regla de dependencias | hecho | feat/FKR-003-regla-dependencias | `scripts/check-deps.mjs` + tests negativos TS y Rust |
| FKR-004 | `@foker/schemas` | bloqueado | — | Faltan los 8 `schemas/*.json` originales (ver PENDIENTES) |
| FKR-005 | Addon napi + `versionInfo` | hecho | feat/FKR-005-addon-version | `FKR-INT-002`/`FKR-INT-003` probados. `VersionInfo` según §7.5, sin contrastar con el `.d.ts` original |
| FKR-006 | Release dry-run 6 targets | hecho (local parcial) | feat/FKR-006-release-dry-run | Smoke linux-x64 y cross-build linux-arm64 (glibc 2.17) en local. Resto de targets solo en GitHub |
| FKR-007 | ADRs y docs base | hecho | feat/FKR-007-docs-base | `docs/adr/`, README, CONTRIBUTING, architecture, development, roadmap |

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

- **spec/ es una RECONSTRUCCIÓN** (spec/RECONSTRUCCION.md). Faltan `api/foker-core.d.ts` y
  `schemas/*.json`. Bloquean FKR-004 y el contrato exacto de FKR-005.
- Decidido: solo local, sin remoto ni push. `foker-vault/` y los `.txt` de la raíz quedan fuera del repo.

## Siguiente paso

Resolver FKR-004 (esquemas) y cerrar M0. Después: E2 Project Map (FKR-020…029) y E1 benchmark.
