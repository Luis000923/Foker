# Estado de Foker

Última actualización: 2026-10-03 · Rama actual: main · Desarrollo con Codex (implementación y `codex review`) + verificación propia

## Hito actual

M0, M2, M3 (salvo FKR-037), M4 y E6 (salvo FKR-070, manual) completos en local. Siguiente: docs generadas (REQ-DOC-001) y partes de M1 sin coste de API (FKR-010, 012, 013, 017). FKR-011/014/015/016/018 y FKR-037 dependen de PREGUNTA-2/6; FKR-080 de PREGUNTA-3.

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
| FKR-037 | Calibración con ctx-gold | bloqueado | — | Requiere FKR-017 (M1) |
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
| FKR-060 | Esqueleto de CLI | hecho | feat/FKR-060-cli | Codex; `docs/cli.md` generado (REQ-DOC-001) |

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

- spec/ es una reconstrucción; contratos reescritos por decisión del usuario (ADR-019).
- PREGUNTA-2 (presupuesto/modelo del benchmark) y PREGUNTA-6 (repos reales) bloquean M1.
- Restos de un test en la raíz del repo (`.claude/agents`, `.claude/skills`, `.claude/settings.json`,
  `.mcp.json`, `foker.config.yaml`, `foker/`): el permiso de borrado me fue denegado; los debe borrar la
  persona. Mientras tanto, los commits añaden rutas explícitas (no `git add -A`).
- Otra sesión trabaja en el worktree `../Foker-agentes` (rama `chore/sistema-agentes`).
- El sandbox de Codex no tiene red: no puede ejecutar `pnpm` (descarga la versión fijada); se le
  pide usar `./node_modules/.bin/*` y yo ejecuto `pnpm verify` antes de cada merge.
- Decidido: solo local, sin remoto ni push. `foker-vault/` y los `.txt` de la raíz quedan fuera del repo.

## Siguiente paso

`docs/configuration.md` generado desde el esquema (REQ-DOC-001) y docs de §23; luego FKR-010/012/013/017.
