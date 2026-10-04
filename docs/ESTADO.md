# Estado de Foker

Última actualización: 2026-10-03 · Rama actual: main · Último commit: (ver git log) chore: inicializar repositorio con estado

## Hito actual

M0 · Fundaciones — criterio de salida (spec/ROADMAP-BACKLOG.md §2)

## Issues

| ID | Título | Estado | Rama | Notas |
|---|---|---|---|---|
| FKR-001 | (leer en spec/ROADMAP-BACKLOG.md §4, E0) | pendiente | — | |
| FKR-002 | (pendiente de leer en spec/) | pendiente | — | |
| FKR-003 | (pendiente de leer en spec/) | pendiente | — | |
| FKR-004 | (pendiente de leer en spec/) | pendiente | — | |
| FKR-005 | (pendiente de leer en spec/) | pendiente | — | |
| FKR-006 | (pendiente de leer en spec/) | pendiente | — | |
| FKR-007 | (pendiente de leer en spec/) | pendiente | — | |

## Verificado localmente

Sesión 2026-10-03:

- git --version → 2.56.0 (OK)
- rustc --version → 1.98.0 (OK)
- cargo --version → 1.98.0 (OK)
- node --version → v22.23.2 (OK, ≥ 22.14)
- pnpm --version → 11.23.0 (OK, ≥ 10)
- cargo nextest --version → no instalado (FALLO)
- cargo deny --version → no instalado (FALLO)
- actionlint --version → no instalado (FALLO)

## Pendiente de verificar fuera de local

- Nada todavía.

## PENDIENTES y preguntas para el usuario

- **spec/ es una RECONSTRUCCIÓN, no la original** (ver spec/RECONSTRUCCION.md). Faltan
  `api/foker-core.d.ts` y `schemas/*.json`; FKR-004 (contratos/schemas) y FKR-005
  (versionInfo/addon) dependen de ellos. Pedir la copia original antes de esos issues.
- Herramientas que faltan (instalar cuando un issue las necesite):
  `cargo install cargo-nextest --locked`, `cargo install cargo-deny --locked`,
  `sudo pacman -S actionlint`.
- Decidido: solo local, sin remoto ni push. `foker-vault/` y los `.txt` de la raíz
  quedan fuera del repo vía `.gitignore`.

## Siguiente paso

Leer spec/ en el orden del prompt maestro y planificar FKR-001 en `feat/FKR-001-monorepo`.
