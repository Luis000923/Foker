# ADR-035 · Fixture B: repositorios reales, curación de tareas y ctx-gold

- **Estado**: Propuesta. Reglas de selección **congeladas antes de enumerar candidatos**
  (este commit precede al minado). La ejecución pagada exige autorización humana.
- **Fecha**: 2026-10-04
- **Issues**: FKR-014 (fixture), FKR-015 (línea base), FKR-018 (benchmark)
- **Amplía**: ADR-018 (benchmark), ADR-025, ADR-029, docs/bench/fixture-b-criterios.md (FKR-093)
- **Decisión humana**: PREGUNTA-6, selección inicial Vite, TanStack Query y Zod, sujeta a E1–E8.

## Identidad de cada repositorio

- SHA de identidad = último commit first-parent de la rama por defecto con fecha de commit
  ≤ **2026-09-30T23:59:59Z**:
  - Vite: `cf5c0288d526824aead1b24e977400f13c527927`
  - TanStack Query: `b90d8cee92c931773df73a39c9aa6cfc30afe5a1`
  - Zod: `004d800c9e3cd4c79930f55aa4ad080225b22efd`
- Cada tarea fija además su base B = padre del commit C (no usa HEAD ni etiquetas).
- Conteos de E2/E3 con `cloc` 1.96 (paquete npm `cloc@2.11.0`, sha256 del script
  `099b5223…`) sobre `git ls-tree` del SHA, con la misma regla de exclusión para todos
  (`tools/eligibility.py` en el expediente de Fixture B).

## Ventana y reglas de minado (fijadas ahora)

Universo: commits C first-parent de la rama por defecto con fecha de commit en
**[2026-04-01T00:00:00Z, 2026-09-30T23:59:59Z]** y ancestros del SHA de identidad.

Un C es **candidato** si cumple todo:

1. Un solo padre (B = C^1).
2. Asunto que no empieza por `chore`, `ci`, `docs`, `build`, `release`, `test`, `style`
   ni `revert`, con o sin ámbito, y no es una actualización de dependencias.
3. Modifica (no solo añade) entre **1 y 5** archivos TS propios (`.ts/.tsx/.mts/.cts`, no `.d.ts`)
   fuera de tests y de las exclusiones de E2/E3.
4. Añade o modifica al menos un archivo de test TS (misma regex de tests de E2/E3).
5. No cambia lockfiles, `package.json`, `pnpm-workspace.yaml`, `.nvmrc` ni configuración
   de TypeScript/test (`tsconfig*.json`, `vitest*.config.*`).
6. Toca como máximo 20 archivos en total.

Los candidatos se ordenan por `sha256("fixture-b-42:" + C)` y se verifican en ese orden hasta
**15 aceptados por repo** o hasta agotar la lista. Todos los rechazos quedan registrados con su
motivo. No se sustituyen tareas tras ver resultados de los brazos.

## Verificación de cada tarea (E4/E8)

En el entorno del repo (imagen por repo, ver abajo) y sin red:

- **F2P**: los tests añadidos o modificados por C, aplicados sobre B, deben fallar con al menos
  un caso de test fallido (no solo por un error de carga ajeno a la conducta) y pasar en
  B + gold + tests.
- **P2P**: los demás archivos de test de los paquetes afectados deben pasar en B y en
  B + gold + tests.
- Tipos y lint del paquete afectado pasan en B + gold + tests.
- 3 repeticiones; cualquier inestabilidad, skip nuevo o dependencia de red, reloj o servicio
  rechaza la tarea.
- Gold = cambios de C fuera de los tests; los tests de C son la evaluación oculta.

## Enunciados

Se redactan a partir del **diff de los tests F2P y del título del PR**, nunca del diff del gold.
No pueden contener rutas ni nombres de archivos del gold, ni nombres de símbolos internos que no
aparezcan en la API pública que usa el test. Claude audita fugas y la revisión humana (§6 de
los criterios) sigue pendiente. El tipo (fix/feature) se toma del asunto del commit.

## ctx-gold de Fixture B (separado de la evaluación)

- Se genera de forma determinista desde las tareas aceptadas: `gold_modified` = archivos TS
  propios modificados por C; `gold_symbols` = símbolo más interno del mapa de B que contiene
  cada línea cambiada (método de FKR-095). Split 50/50 por `sha256(id)`.
- **Solo evaluación**: ningún parámetro del motor se ajusta con Fixture B. Cualquier cambio
  futuro exige un ADR nuevo y un conjunto reservado distinto.
- Métricas offline (sin API): recall y precisión del pack y del flujo `begin` (ADR-032),
  recall de símbolos y tokens de anclas (ADR-033), `gold_full` (ADR-034), plegado flexivo
  on/off solo medido (sigue desactivado), tamaño del pack y tiempo de map/refresh/buildContext.

## Entorno por repositorio (pendiente de implementar antes del benchmark pagado)

Fixture B necesita imágenes por repo con el runtime y el gestor exactos (Vite: Node ≥ 22.12 y
pnpm 12.6.0; Query: Node 24.16.0 y pnpm 12.4.2; Zod: Node 24 y `nub` 0.8.3). El arnés actual
(`prepare.mjs`) solo sabe preparar Fixture A. Antes de FKR-015 hay que implementar y revisar:
preparación por tarea (checkout de B sin historial ni remotos), dependencias desde caché,
montaje de tests ocultos solo en evaluación, comandos de evaluación por tarea y paridad de las
instrucciones de agente que trae el propio upstream (p. ej. `CLAUDE.md`/`AGENTS.md` de Zod) entre
brazos.

## Riesgos de leakage declarados

- Cutoff de `claude-sonnet-5-5`: no declarado por el proveedor (**desconocido**). Commits
  de 2026 pueden estar en sus datos de entrenamiento: la fecha no prueba ausencia.
- Proyectos muy populares: el modelo puede recordar sus APIs y la solución de bugs publicados.
- Los asuntos de commit y los títulos de PR pueden revelar la solución: por eso los enunciados
  se derivan de los tests y se auditan.
- El autor del selector (Claude) ve las tareas: el motor queda congelado para Fixture B
  (ningún ajuste con estos datos).

## Resultados de la preparación (OBSERVACIÓN, 2026-10-05)

### Elegibilidad E1–E8 en el SHA de identidad

| Repo | E1 licencia | E2 TS propio | E3 archivos / LOC TS | Categoría | E4/E8 (3 preparaciones limpias, 2 CPU / 8 GiB) |
|---|---|---:|---:|---|---|
| Vite | MIT | 96,96 % | 164 / 40.805 | mixto (small por archivos, medium por LOC); no monorepo por la regla | install+build 57–70 s, evaluación sin red 43–44 s, pico 3,1 GiB |
| TanStack Query | MIT | 93,82 % | 384 / 33.771 | medium; monorepo | install 46–106 s, evaluación 42–43 s, pico 3,1 GiB |
| Zod | MIT | 99,75 % | 162 / 30.960 | mixto | install+build 44–58 s, evaluación 87–88 s, pico 3,2 GiB |

Los tres cumplen E1–E8 y **se aceptan**. Conteos en `benchmarks/fixture-b/eligibility-*.json`.
E7: build/herramientas (Vite), estado/UI multi-framework (Query) y biblioteca de validación (Zod).
Hallazgos de entorno:
- Vite y Zod necesitan compilar antes de testear (como en su CI).
- El corepack de Node 22.14 no activa pnpm 12, así que Vite usa Node 24.16 (dentro de sus `engines`).
- Zod usa `nub` 0.8.3 en el SHA de identidad (instalador con checksum), pero pnpm 10.12.1 en sus bases.
- Las bases traen sus propias instrucciones de agente (`CLAUDE.md`, `AGENTS.md` y similares).

### Minado y verificación

Ventana 2026-04-01..2026-09-30. Candidatos tras las reglas 1–6: Vite 112, Query 69 y Zod 172.
Verificados en orden de semilla, con 3 repeticiones sin red y el **entorno de B**
(`packageManager` y `.nvmrc` de cada base, imagen fijada por digest), hasta 15 aceptados:

| Repo | Procesados | Aceptados | Rechazos (motivo) |
|---|---:|---:|---|
| Vite | 27 | 15 | 11 tests e2e de `playground` que requieren navegador (`f2p_load_only` + `f2p_fails_after`), 1 `f2p_passes_before` |
| Query | 24 | 15 | 6 `p2p_fails_after`, 4 `f2p_fails_after`, 2 `quality_fails_after`, 2 `f2p_passes_before` |
| Zod | 15 | 15 | — |

Tipos: 36 fix, 4 feat, 1 perf y 4 «otro» (asunto sin prefijo convencional). Tareas, entorno,
comandos y verificación en `benchmarks/fixture-b/tasks.jsonl`. El gold no se guarda: se regenera
con `git diff B C` excluyendo los tests ocultos. Cambios en la verificación respecto al plan: el
entorno es por base y no por repo, y se fija `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` (la descarga
de Chromium se colgaba; los tests e2e se rechazan igual en ambos brazos).

**Sesgos de selección**: en Vite solo entran bugs con tests unitarios (sin navegador). Zod
aceptó sus 15 primeros candidatos, que se concentran en `v4`. En Query, los rechazos P2P
excluyen tareas cuyo paquete tenía tests ya rotos en B.

### Enunciados

Codex los redactó en modo solo lectura a partir del título del PR y del diff de los tests
(sin el gold). Claude auditó los 45 con un detector de fugas (identificadores del gold ausentes
de los tests, nombres de archivos del gold, rutas) y una lectura completa: **0 fugas reales**
(10 falsos positivos por palabras genéricas o el nombre del paquete). Limitación: derivados de
los tests, describen la conducta esperada con más detalle que un issue real (igual en ambos
brazos). La revisión humana (§6 de los criterios) sigue pendiente.

### Evaluación offline de Foker (motor congelado, presupuesto 8000)

`benchmarks/fixture-b/results/offline-eval-2026-10-05.json`; 45 casos (24 calibration / 21 validation).

| Configuración | Recall pack | Precisión pack | Recall flujo begin | Cobertura de alcance | Recall de símbolos (anclas = gold) | `gold_full` |
|---|---:|---:|---:|---:|---:|---:|
| default (ADR-032/033/034) | **0,408** | 0,048 | **0,396** | 0,544 | **0,370** | 0,00 |
| sin ADR-034 | 0,408 | 0,047 | 0,374 | 0,544 | 0,370 | 0,00 |
| sin ADR-033 | 0,408 | 0,048 | 0,396 | 0,544 | 0,326 | 0,00 |
| plegado flexivo on | 0,378 | 0,045 | 0,374 | 0,589 | 0,370 | 0,00 |

Por repo (default): Query pack 0,62 / flujo 0,53 / símbolos 0,54; Vite 0,47 / 0,43 / 0,37;
Zod 0,13 / 0,23 / 0,20. Mediana de tokens del pack: 7.590 (llena el presupuesto; en Fixture A,
~1.000). Mapa por base: 404–1.550 archivos, construcción mediana 144 ms; `build_context`
mediano 62 ms.

**Fallos de anclas**: 12 de 45 evaluaciones con anclas = gold fallan con `FKR-CTX-001` (10 de
ellas en Zod). La reserva mínima obligatoria de un ancla (L1, todas sus firmas) supera el
presupuesto en archivos como `packages/zod/src/v4/core/schemas.ts`, antes de que la vista focal
pueda actuar. En el flujo begin real, un agente que anclara ese archivo recibiría
`context_error` sin código.

**INTERPRETACIÓN**:
- El recall en repos reales (0,41) es casi la mitad que en Fixture A (0,74): Fixture A
  sobreestimaba la calidad de selección.
- ADR-034 no entrega ningún gold completo (son archivos grandes); solo mueve el flujo +2,2 pp.
- ADR-033 aporta +4,4 pp de recall de símbolos.
- El plegado empeora validation (−6,4 pp): sigue desactivado.
- El motor queda **congelado** para Fixture B. Corregir la reserva de anclas grandes (por
  ejemplo, L0 o focal como mínimo) exige un ADR nuevo y un conjunto reservado distinto, no
  estos 45 casos.

### Pendiente antes del benchmark pagado (FKR-015)

El arnés solo prepara Fixture A. Falta: preparación por tarea con la imagen y el gestor de B,
checkout sin historial ni remotos, instalación con red en fase separada, montaje de los tests
ocultos solo en la evaluación, comandos de evaluación por tarea, `foker init` en el brazo
Foker sin alterar las instrucciones upstream del control, y revisión de seguridad del montaje.

## Revisión independiente (Codex) y verificador v2

| Hallazgo | Clasificación | Corrección |
|---|---|---|
| P1 · P2P no se comprobaba sobre B | VALID | Fase `p2p_before` sobre B puro (sin tests nuevos) |
| P1 · Snapshots de test tratados como gold (`b-vite-13`) | VALID | Tests ocultos = todos los archivos de C que casan con la regex de tests, incluidos `.snap` |
| P2 · Query solo evaluaba los paquetes con tests (`b-query-15`) | VALID | Paquetes = tests ∪ implementación modificada |
| P2 · Digest registrado pero no usado | VALID | Ejecución con `node@sha256:…` |
| P2 · Sin estabilidad entre repeticiones | VALID | Mismo conjunto de casos F2P fallidos y mismos conteos P2P en las 3; `new_skips` |
| P2 · Herramientas externas no fijadas | VALID | Instalador de nub con sha256, `cloc` 1.96 verificado, manifiesto versionado; el lote usa el verificador hermano |
| P2 · Reutilización y concurrencia | VALID | Preparaciones en directorio nuevo, cerrojo por ejecución, huella del verificador en cada veredicto |
| P3 · Sin resultados por caso | VALID | Se versionarán los resultados por caso con la reevaluación |

La selección v1 (45 tareas) queda **invalidada**. Se reverifica desde cero con v2, en el mismo
orden de semilla y con las mismas reglas; la evidencia v1 se conserva aparte (`verify-v1`).

## Arnés de Fixture B (FKR-015, implementado sin ejecución pagada)

- Imágenes `foker-bench-b:node-<versión>` construidas desde el `node@sha256` de cada base, con el
  mismo Claude Code (2.1.289) y la misma build de Foker que `foker-bench:smoke8`.
- Preparación idéntica en ambos brazos: árbol de B sin historial ni remotos, gestor de B,
  instalación congelada y build con red; en el brazo Foker, además, `foker init/trust/map`.
  Commit «Preparado» como referencia.
- Entrega del agente = `git diff` contra ese commit; los symlinks upstream se conservan; se
  rechazan los symlinks nuevos que escapan del repo y los cambios en rutas protegidas.
- Evaluación sin red sobre una copia del árbol preparado: entrega, tests ocultos sobrescritos
  con su versión de C, build, F2P, P2P (suite sin los archivos F2P) y calidad.
- Validado sin API con agentes simulados (gold → éxito; noop → F2P falso y P2P verdadero) en
  Vite, Query y Zod, y en el brazo Foker.
- Limitaciones: P2P excluye por nombre de archivo (vitest 4) y podría excluir un test homónimo
  del mismo paquete. `task_type` del esquema v1: perf → refactor, otro → fix. `retries` y
  `ccr_relevante` no se instrumentan (null).
