# Contribuir a Foker

Las mismas reglas aplican a personas y a agentes de IA. Los agentes leen además [`AGENTS.md`](AGENTS.md).

## Requisitos

- Node.js ≥ 22.14 y pnpm (versión fijada en `package.json` → `packageManager`).
- Rust estable fijado en `rust-toolchain.toml` (rustup lo instala solo).
- `cargo install cargo-nextest cargo-deny --locked`.

Guía de entorno y comandos: [`docs/development.md`](docs/development.md).

## Flujo

1. Elige un issue `FKR-NNN` de [`spec/ROADMAP-BACKLOG.md`](spec/ROADMAP-BACKLOG.md) cuyas
   dependencias estén cerradas.
2. Crea la rama `feat/FKR-NNN-<slug>` (o `fix/…`, `docs/…`).
3. Implementa con tests. Commits en formato Conventional Commits.
4. Abre un PR. CI debe estar verde en Linux, macOS y Windows.

## Definition of Done

- Código + tests + documentación del área actualizada.
- `pnpm lint`, `pnpm typecheck`, `pnpm check:deps` y `pnpm test` en verde.
- `cargo fmt --check`, `cargo clippy --workspace --all-targets -- -D warnings` y `cargo deny check` en verde.
- Criterios de aceptación del issue cumplidos y verificados.

## Reglas de arquitectura

- **Grafo de módulos** (FOKER-SPEC §4.2, REQ-REPO-001): ningún módulo depende de otro situado a su
  derecha. `pnpm check:deps` lo verifica en CI.

  ```text
  Rust:   foker-map ──► foker-context ──► foker-napi
  TS:     @foker/schemas ◄── @foker/policy ◄── @foker/engine ◄── @foker/mcp ◄── foker (cli)
          @foker/core ◄── @foker/engine
          @foker/schemas ◄── @foker/integrations ◄── foker (cli)
  ```

- `foker-napi` no contiene lógica de dominio (REQ-NAPI-001).
- Los contratos (API nativa, JSON Schemas, formatos versionados, herramientas MCP) no cambian sin ADR.
- TypeScript `strict`, sin `any` explícito. Biome es la única herramienta de lint y formato para TS/JSON.
- Rust sin `unsafe`, `clippy -D warnings`.

## Calidad (FOKER-SPEC §19.2)

Cobertura orientativa ≥ 80 % de líneas en `foker-map`, `foker-context`, `@foker/policy` y `@foker/engine`.
Cada bug corregido añade un caso de regresión.

## CI

| Workflow | Disparador | Qué hace |
|---|---|---|
| `ci.yml` | PR y push a `main` | `lint` (fmt, clippy, deny, biome, tsc, regla de dependencias) → `test` en 4 runners |

`nightly.yml`, `release.yml` y `benchmark.yml` llegan con sus issues (FOKER-SPEC §21.2). Todas las
Actions se fijan por SHA y cada job tiene permisos mínimos.
