# Instrucciones para agentes que desarrollan Foker

Este repositorio contiene Foker, no un proyecto gestionado por Foker.

## Fuentes de verdad

1. `spec/FOKER-SPEC.md`: especificación normativa (v0.2.0). Manda sobre los `.txt` de la raíz.
2. `spec/ROADMAP-BACKLOG.md`: hitos, backlog `FKR-NNN` y criterios de aceptación.
3. `spec/adr/`: decisiones. Cambiar una decisión exige un ADR nuevo.
4. `docs/ESTADO.md`: estado actual, issues en curso y pendientes. Actualízalo al terminar cada issue.

`spec/` es una reconstrucción: faltan `api/foker-core.d.ts` y `schemas/*.json`. Lo que dependa
de ellos es PENDIENTE (ver `spec/RECONSTRUCCION.md`). No inventes su contenido.

## Flujo de trabajo

- Una rama por issue: `feat/FKR-NNN-<slug>`. Commits Conventional Commits en español.
- Definition of Done: código + tests + docs del área + `pnpm verify` en verde.
- Los módulos respetan el grafo de FOKER-SPEC §4.2. Un paquete nunca importa a otro situado a su derecha.
- `foker-napi` no contiene lógica de dominio (REQ-NAPI-001).
- No modifiques contratos (API nativa, esquemas JSON, formatos versionados) sin ADR.

## Comandos

| Tarea | Comando |
|---|---|
| Instalar dependencias | `pnpm install` |
| Lint y formato (TS, JSON) | `pnpm lint` / `pnpm format` |
| Tipos | `pnpm typecheck` |
| Build TS | `pnpm build` |
| Lint Rust | `cargo fmt --check && cargo clippy --workspace --all-targets -- -D warnings` |
