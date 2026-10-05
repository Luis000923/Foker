# ADR-037 · Gates y archivos ignorados por git

- **Estado**: Propuesta. Criterio fijado antes de implementar.
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

1. Los archivos **ignorados por git** (`git ls-files --others --ignored --exclude-standard
   --directory` o equivalente, siempre sin shell y con el ejecutor existente) **no forman parte del
   conjunto de cambios** que evalúa G1, **salvo** que casen con `protected_paths` o con los globs de
   secretos. Esos siguen en el conjunto: G2 debe seguir bloqueando una edición de `.env` aunque
   esté ignorado.
2. `treeSnapshot` no recorre ni hashea los directorios ignorados enteros. Los archivos ignorados
   que casan con `protected_paths` o secretos se siguen hasheando, como hoy.
3. Un archivo **versionado** que además case con `.gitignore` (añadido con `git add -f`) **no** se
   considera ignorado: cuenta como hoy.
4. Las exclusiones se calculan en `begin` y en `submit` con la misma función, para que un
   `.gitignore` editado durante la tarea no oculte cambios: un cambio en `.gitignore` es, a su vez,
   un cambio sujeto a G1.

Sin git, el comportamiento no cambia (no hay fuente fiable de ignorados).

## Criterio de aceptación (fijado a priori)

- Test E2E: tarea con alcance `src/**`; un check crea `dist/x.js` y `.eslintcache` ignorados;
  el segundo `submit` pasa G1.
- Test negativo: `.env` ignorado y protegido, editado por el agente → G2 falla.
- Test negativo: añadir `secreto.txt` a `.gitignore` y crear `secreto.txt` fuera de alcance →
  G1 falla (por el cambio en `.gitignore`, que está fuera de alcance).
- Test: archivo versionado y forzado (`git add -f`) que casa con `.gitignore` → cuenta.
- REQ-TSK-001 (cinco escenarios del agente simulado) y la suite `tests/security` siguen verdes.
- Rendimiento: el baseline de `fixtures/large-10k` no empeora más de un 10 %.
