# Contribuir a Foker

Las mismas reglas aplican a personas y a agentes de IA.

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
- `pnpm verify` en verde (fmt, clippy, Biome, tsc, regla de dependencias, generados y tests).
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
| `release.yml` | Manual y PR que toca el addon | `build` del addon en 6 targets → `smoke` de cada artefacto empaquetado en su runner nativo. Todavía no publica (FKR-080) |

`benchmark.yml` llega con su issue (FOKER-SPEC §21.2). Todas las
Actions se fijan por SHA y cada job tiene permisos mínimos.

## Documentación (§23)

| Área | Documentos |
|---|---|
| Entrada | [README](README.md), [primeros pasos](docs/getting-started.md), esta guía |
| Diseño | [Arquitectura](docs/architecture.md), [mapa](docs/project-map.md), [contexto](docs/context-engine.md), [ADRs](docs/adr/README.md) |
| Desarrollo y calidad | [Desarrollo](docs/development.md) |
| Uso | [Agentes](docs/agents.md), [tareas](docs/tasks.md), [skills](docs/skills.md), [MCP](docs/mcp.md), [integraciones](docs/integrations/README.md), [verificación](docs/integrations/verification.md), [plantillas](docs/templates.md) |
| Seguridad | [Divulgación](SECURITY.md), [seguridad](docs/security.md), [trust/checks](docs/config-trust-exec.md), [secretos](docs/findings-secrets.md) |
| Referencias generadas | [CLI](docs/cli.md): test docs.test.ts de CLI; [configuración](docs/configuration.md): `node packages/schemas/scripts/generate.mjs` o test docs.test.ts de schemas con UPDATE_SNAPSHOTS=1 |

REQ-DOC-001: CI comprueba ambas referencias; ten en cuenta
regenerar. Documenta pendientes con su issue; no presentes la especificación como comportamiento
implementado ni edites a mano archivos generados.
