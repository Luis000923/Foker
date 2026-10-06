# ADR-037 · Gates y archivos ignorados por git

- **Estado**: Aceptada (2026-10-05). Criterio fijado antes de implementar; diseño corregido tras la revisión cruzada (7 hallazgos válidos, todos con test).
- **Fecha**: 2026-10-05
- **Issue**: FKR-098
- **Modifica**: FOKER-SPEC §12 (G1 Alcance y cálculo de cambios respecto al baseline). Sin cambios
  en esquemas, N-API ni herramientas MCP.

## Contexto (OBSERVACIÓN)

`bench-b-smoke-2`, ejecución 0 (b-vite-02, brazo Foker). El segundo `foker_task_submit` falló en
G1 por `.eslintcache`, `packages/plugin-legacy/dist/` y `dist/` de fixtures de tests. Esos archivos
los crearon **los checks del primer intento** (lint, build, tests), no el agente, y están en el
`.gitignore` de Vite (`git status --ignored` los marca con `!!`).

Causa: `treeSnapshot` (`packages/engine/src/tasks/baseline.ts`) recorre todo el árbol salvo `.git`,
`.foker` y `node_modules`, sin consultar `.gitignore`, y `diffSinceBaseline` compara ese árbol.
En un proyecto `nextjs-turbo`, `.next/`, `.turbo/`, `dist/`, `coverage/` y `*.tsbuildinfo`
romperían G1 en cada intento posterior a un `build`. Además, `.next/` puede acercar el recorrido
al límite de 50.000 archivos (`FKR-MAP-003`).

## Decisión

Con git disponible:

1. Los archivos **ignorados por git** (`git ls-files --others --ignored --exclude-per-directory=.gitignore
   --directory -z` o equivalente, siempre sin shell y con el ejecutor existente) **no forman parte del
   conjunto de cambios** que evalúa G1, **salvo** que casen con `protected_paths` o con los globs de
   secretos. Esos siguen en el conjunto: G2 debe seguir bloqueando una edición de `.env` aunque
   esté ignorado.
2. `treeSnapshot` recorre con `readdir` los directorios ignorados, pero no hashea sus archivos
   ordinarios. Las excepciones se deciden con `matchGlobs` de Foker y la política efectiva
   de los gates (incluido `configPath`), sin traducir globs a pathspecs.
3. Un archivo **versionado** que además case con `.gitignore` (añadido con `git add -f`) **no** se
   considera ignorado: cuenta como hoy.
4. Las exclusiones se calculan en `begin` y en `submit` con la misma función, para que un
   `.gitignore` editado durante la tarea no oculte cambios: todo archivo llamado `.gitignore` se hashea siempre, incluso
   si se ignora a sí mismo, y sus cambios están sujetos a G1.

El baseline autentica también el modo (`git`/`none`) y las exclusiones. Si Git falla en submit,
se reutilizan las exclusiones guardadas. Si begin fue `none`, submit conserva ese modo.
Los baselines antiguos sin modo siguen siendo legibles como `none`, con su hash original.
Los separadores se normalizan únicamente en Windows. Los symlinks se registran con hash
del destino de `readlink`, sin seguirlos.

Sin git, el conjunto de cambios no se reduce (no hay fuente fiable de ignorados).

## Criterio de aceptación (fijado a priori)

- Test E2E: tarea con alcance `src/**`; un check crea `dist/x.js` y `.eslintcache` ignorados;
  el segundo `submit` pasa G1.
- Test negativo: `.env` ignorado y protegido, editado por el agente → G2 falla.
- Test negativo: añadir `secreto.txt` a `.gitignore` y crear `secreto.txt` fuera de alcance →
  G1 falla (por el cambio en `.gitignore`, que está fuera de alcance).
- Test: archivo versionado y forzado (`git add -f`) que casa con `.gitignore` → cuenta.
- REQ-TSK-001 (cinco escenarios del agente simulado) y la suite `tests/security` siguen verdes.
- Rendimiento: el baseline de `fixtures/large-10k` no empeora más de un 10 %.

## Revisión cruzada (Codex, 2026-10-05) y diseño corregido

La primera implementación (OpenCode) traducía los globs sensibles a pathspecs de git. Codex
encontró siete vías de evasión; todas **VÁLIDAS**:

| # | Hallazgo | Corrección obligatoria |
|---|---|---|
| 1 | Secreto anidado en un directorio colapsado (`dist/nested/.env`) no reabre `dist` | Desaparece con el punto 3 |
| 2 | `.git/info/exclude`, `core.excludesFile` o un `.gitignore` nuevo que se ignora a sí mismo ocultan archivos | Solo cuentan los `.gitignore` del árbol (`--exclude-per-directory=.gitignore`, nunca `--exclude-standard`); todo archivo llamado `.gitignore` se hashea siempre |
| 3 | Pathspecs pierden `{a,b}` y la semántica de `./` y profundidad de Foker | La sensibilidad se decide **en Foker** con `matchGlobs`: los directorios ignorados no se hashean, pero se recorren con `readdir` y se hashean los archivos que casan con rutas protegidas o secretos |
| 4 | El snapshot carga `foker.config.yaml` aunque `submit` use `--config` | La política del snapshot es la misma que evalúan los gates (`configPath` hasta `treeSnapshot`) |
| 5 | Git falla solo en `begin` o solo en `submit` y fabrica cambios | El baseline guarda el modo (`git`/`none`) y la lista de exclusiones; si git falla en `submit`, se usan las exclusiones guardadas; si `begin` fue `none`, `submit` también |
| 6 | `\` se convierte en `/` en POSIX | Normalizar separadores solo en Windows |
| 7 | Symlinks invisibles (preexistente) | El árbol registra los enlaces como entrada con hash de su destino (`readlink`), sin seguirlos |

Criterio de aceptación ampliado: un test por cada fila (1–7), además de los cinco originales.
Rendimiento: el recorrido sin hash de directorios ignorados mantiene el límite de +10 %.
