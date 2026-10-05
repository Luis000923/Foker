# ADR-032 · Recall en el flujo `foker_task_begin`

- **Estado**: Aceptada (correcciones 1 y 2); plegado flexivo medido y **rechazado como default**
- **Fecha**: 2026-10-04
- **Issue**: FKR-091
- **Modifica**: FOKER-SPEC §9.5 (peso de `TASK_SCOPE`) y la derivación de alcance de ADR-031 fase 2b
- **Amplía**: ADR-028 (metodología ctx-gold) y ADR-031

## Contexto

En `bench-smoke-6`, a-09 falló en ambos brazos. El pack de Foker no incluyó
`packages/catalog/src/skuMatches.ts` y el modelo lo buscó con Bash/`foker_search`/Read.
Tampoco vio `packages/ui/src/referenceSearch.ts`, el segundo archivo que exigía la tarea.

### Reproducción (OBSERVACIÓN)

Traza del anfitrión (`benchmarks/generated/bench-smoke-6/5/evidence/traces.json`): el modelo
llamó a `foker_task_begin` sin `scope`, con `context: {anchors: {symbols: [sku, SKU,
searchBySku]}, intent: add}`. Sobre una copia del baseline real de ese run, con la misma
petición, `rules`, `dirty_files` y configuración:

| Paso | `skuMatches.ts` | `referenceSearch.ts` |
|---|---|---|
| Motor, enunciado del benchmark sin anclas | L2 (`LEXICAL:sku`) | L2 |
| Mismo con anclas inexistentes e `intent: add` | L2 | L1 |
| Pack **preliminar** de begin (sin `taskScope`) | L2 | L1 |
| Pack **definitivo** de begin (`taskScope` = `catalog/src/**`, `users/src/**`) | **ausente** | **ausente** |

Las anclas inexistentes (`FKR-CTX-102`) y la intención no causan la pérdida. Lo que la causa
es el pack definitivo:

1. **RANKING FAILURE por dilución de semillas.** §9.5 daba `w_task_scope = 0,5` a **cada**
   archivo del alcance. El alcance derivado `catalog/src/**` + `users/src/**` casa con unos
   50 archivos, que suman unas 25 unidades de masa de teletransporte frente a < 2 del BM25.
   El PPR concentra la puntuación en `index.ts` (hubs con 22 dependientes) y la señal léxica
   cae por debajo de los cortes de suficiencia.
2. **Alcance derivado desde hubs.** Sin L3, el alcance salía de los tres L2 de mayor
   puntuación: dos `index.ts` con razón `CORE` y un acierto léxico débil. `ui/` quedaba fuera,
   así que el gate de alcance habría rechazado además la edición necesaria.

### Brecha metodológica (OBSERVACIÓN)

ctx-gold (ADR-028/031) llama a `buildContext` sin `taskScope`. El agente, en cambio, recibe
siempre el pack definitivo de begin. Un modo que emula ese flujo da, con el código de `main`
(34d7b08): **recall del pack 0,7444 frente a recall del flujo 0,3319**. 33 de los 60 casos
pierden recall en el flujo. El 0,744 publicado no describía lo que recibe el agente.

### Clasificación del resto de fallos de ctx-gold

Con el ejemplo `recall_diagnose` (semillas, rango y corte por gold):

| Causa | Casos (gold no expuesto) |
|---|---|
| Archivo nuevo, ausente del mapa (no recuperable) | a-15…a-20 (6 archivos) |
| QUERY NORMALIZATION: flexión (plural, `-e`) | a-09 (`referencias`/`referencia`), a-26, a-27, a-29 |
| CANDIDATE GENERATION: vocabulario es↔en o sinónimo | a-01, a-06, a-13, a-14, a-33, a-34, a-36, a-37, a-38, a-40, a-41, a-47 |
| Tests `baseline.test.ts` sin señal léxica | a-48, a-49 |

En todos los recuperables, el gold perdido no tiene señal directa (rango ~290–307 de 313):
falla la generación de candidatos, no el corte ni el presupuesto.

## Decisión

### 1 · `TASK_SCOPE` aporta una masa fija (motor)

Los archivos que casan con los globs del alcance reciben `w_task_scope / n` cada uno
(n = archivos que casan), de modo que el alcance aporta en total `w_task_scope`. Es la misma
regla de §9.5 para un ancla de símbolo ambigua (1/n). Un alcance de un solo archivo conserva
el 0,5 anterior. No hay parámetro nuevo. El alcance es una región: no son n señales
independientes de relevancia.

### 2 · El alcance derivado antepone la señal directa (engine/MCP)

`deriveScopePaths` pasa a `@foker/engine` (lógica de dominio que reutilizan MCP y ctx-gold).
Sin L3, toma tres L2 y antepone los que tienen razón directa (`ANCHOR`, `PATH_MENTION`,
`SYMBOL_MENTION`, `LEXICAL:`) a los que solo llegan por el grafo (`CORE`, `DEPENDENCY_OF`,
`DEPENDENT_OF`). Si ninguno tiene señal directa, el resultado es el de antes. No cambia el
contrato MCP ni el formato persistido.

Rejilla declarada antes de medir, solo con calibration: (a) actual; (b) L2 con señal directa
primero; (c) top 3 de L2∪L1 con señal directa. Criterio: recall del flujo, luego cobertura de
alcance, luego mediana de tokens.

| Variante | Recall flujo cal. | Cobertura cal. | Mediana cal. | Recall flujo val. | Cobertura val. |
|---|---:|---:|---:|---:|---:|
| a | 0,7389 | 0,8000 | 912,5 | 0,7833 | 0,8722 |
| **b (elegida)** | 0,7389 | **0,8083** | **902,5** | 0,7833 | **0,8889** |
| c | 0,7389 | 0,8000 | 920 | 0,7500 | 0,8778 |

**Archivos de la raíz.** `directoryScope` acotaba un archivo de la raíz a `**`, que siempre
intersecta las rutas protegidas (`.git/**`, `.foker/**`…). Begin rechazaba entonces el alcance
derivado con `FKR-POL-002` (a-13, a-26 y a-45, por `vitest.config.ts`). Ahora el alcance es el
propio archivo. Modifica la regla «en raíz, `**`» de ADR-031 fase 2b, también en las
sugerencias de alcance.

### 3 · Plegado flexivo es/en en BM25: implementado, desactivado

`fold_inflection` quita tildes, plural (`-s`, `-ies`→`-y`, nunca `-ss`) y una `-e` final, con
longitud mínima. Se aplica igual a consulta y documento y solo afecta al emparejamiento BM25.
Es morfología general, no vocabulario sacado de los fallos. Queda como parámetro interno
`inflection_folding` (serde, omitido cuando vale el default), sin exponerse en N-API, CLI ni MCP.

Rejilla declarada antes de medir: {off, on} y, tras ver la regresión, **una única**
rejilla adicional on × `bm25_top` {20, 30, 40}. Criterio: ninguna regresión por caso en
calibration frente a off; entre las válidas, el mayor recall de calibration.

| Configuración | Recall pack cal. | Recall flujo cal. | Cobertura cal. | Regresiones cal. |
|---|---:|---:|---:|---|
| off | 0,7389 | 0,7389 | 0,8083 | — |
| on, top 20 | 0,8056 | 0,8056 | 0,7500 | a-49 |
| on, top 30 | 0,8056 | 0,8056 | 0,7667 | a-49 |
| on, top 40 | 0,7889 | 0,8056 | 0,7833 | a-49 |

**Ninguna cumple: queda desactivado.** Mecanismo de a-49: «pruebas»/«tests» se pliegan y
casan con los 22 `record-N.test.ts` de cada paquete, que saturan el top-k y desplazan
`baseline.test.ts`. En validation (medido una vez, solo con top 20) el recall del flujo sube
de 0,7833 a 0,8028, a-50 regresa (1 → 0,33) y la cobertura baja (0,889 → 0,803).
Se conserva para recalibrar con un ctx-gold mayor; no se retocan más parámetros.

### 4 · ctx-gold mide el flujo de begin (metodología, aditiva)

Cada fila añade `flow`: alcance derivado del pack (el mismo que el preliminar de begin), pack
definitivo con `taskScope` (id fijo, checks del perfil default), `recall`, `precision`,
`rendered_tokens`, `exposed` y `scope_coverage` (fracción de `gold_modified` que casa con el
alcance, es decir, editable sin que el gate de alcance la rechace). Sin alcance derivable,
begin devuelve error sin código: `scope_error = true` y recall 0. El recall del pack
(REQ-CTX-003) **no cambia de definición**. El flujo es una métrica adicional y se informa
siempre junto a ella.

Begin se reproduce con la política protegida por defecto: un alcance que la intersecta cuenta
como `scope_error` con `error = FKR-POL-002`. Un fallo del pack definitivo (p. ej.
`FKR-CTX-001` al sumar la sección `task_scope`) se registra como `context_error`, con recall 0 y
sin abortar el informe. `scope_coverage` vale 0 cuando begin rechaza el alcance.

Diferencias conocidas con el MCP real: ctx-gold no pasa `foker/rules.md` ni `dirty_files`
y no usa anclas salvo en los casos que las declaran.

## Resultados

ctx-gold, 60 casos (30/30), presupuesto 8000, estimador bytes-lf/3.2@1, dataset SHA-256
`482dbc0a2783eb159df86f4f63a9b46c38e6b349cb9267e2fbeda2f3b7b5ec09`.

| Métrica | Antes (34d7b08) | Después |
|---|---:|---:|
| Recall pack (total / cal. / val.) | 0,7444 / 0,7389 / 0,7500 | 0,7444 / 0,7389 / 0,7500 (sin cambios por caso) |
| **Recall flujo begin** (total / cal. / val.) | 0,3319 / 0,3306 / 0,3333 | **0,7611 / 0,7389 / 0,7833** |
| Precisión flujo | 0,0193 | 0,0630 |
| Cobertura de alcance (total / cal. / val.) | 0,8028 / 0,7333 / 0,8722 | 0,8319 / 0,7750 / 0,8889 |
| Rechazos de begin (`FKR-POL-002`) / `context_error` | 2 / 0 | 0 / 0 |
| Mediana rendered flujo | 829 | 929,5 |
| Casos con recall flujo < recall pack | 33 | 0 |

Ambas columnas usan la métrica de flujo **corregida tras la revisión de Codex** (política
protegida y `context_error`). La línea base se midió restaurando `seeds.rs` y
`deriveScopePaths` de `main` sobre esta métrica. Las rejillas de las decisiones 2 y 3 se
midieron antes de la corrección: sus coberturas no aplican la política protegida, pero los
recalls de calibration coinciden y la elección no cambia.

Regresión por caso en el flujo: **a-47** (1 → 0,5). Antes, el alcance inflado exponía
64 archivos y arrastraba los cuatro gold. Ahora expone 17, igual que el pack (0,5). Se acepta:
el recall del flujo nunca queda por debajo del pack y la precisión se triplica.

Caso real de smoke-6, a-09, repetido con el baseline de ese run: el pack definitivo incluye
`skuMatches.ts` (L2, `LEXICAL:sku`) y `referenceSearch.ts` (L1), con 1032 tokens rendered.
El alcance derivado sigue siendo `catalog/src/**`, `users/src/**`, así que la edición de `ui/`
exigiría ampliar el alcance. **HIPÓTESIS**: el éxito de a-09 en el anfitrión mejora. Está
pendiente de un smoke real.

**INTERPRETACIÓN**: el objetivo `recall ≥ 0,80` sigue sin cumplirse para el pack
(0,744). El flujo alcanza 0,78 en validation. El resto de fallos es de vocabulario o
sinonimia (no resoluble sin sobreajustar el diccionario) y archivos nuevos fuera del mapa.

## Revisión independiente (Codex)

| Hallazgo | Clasificación | Acción |
|---|---|---|
| Pack con `inflection_folding: true` no valida contra `ContextPack` (`additionalProperties: false`) | VALID (latente: desactivado) | Campo opcional en el esquema, tipos regenerados, test de esquema |
| `flow` contaba como éxito alcances que begin rechaza por política | VALID | Política protegida por defecto en `flowPack`; tests; reveló el bug de `**` en la raíz |
| Un fallo del pack definitivo abortaba la evaluación | VALID | `context_error` registrado con recall 0; test con motor simulado |

Sin falsos positivos. Codex confirmó además, sin cambios: reparto 1/n sin duplicados ni
división por cero, ningún no determinismo nuevo, `truncate` seguro en UTF-8, ninguna regla de
benchmark en producción y ningún gold que llegue al selector.

## Consecuencias

- Cambia el `pack_hash` de cualquier pack con `task_id` (seeds distintas). No cambian los
  packs sin alcance, los snapshots ni los formatos persistidos.
- La spec §9.5 documenta la masa fija y el plegado como parámetro interno desactivado.
- El esquema `ContextPack` admite `request.params.inflection_folding` (opcional, aditivo).
- Los informes ctx-gold añaden `flow` y `report.flow`. Los consumidores antiguos lo ignoran.
- Riesgo de benchmark: ninguna regla nombra tareas ni archivos. Los parámetros se eligieron
  solo con calibration y validation se midió una vez por variante declarada.

## Reproducción

```sh
node --input-type=module -e 'import {generate} from "./benchmarks/fixtures/fixture-a/generate.mjs"; generate("/tmp/fa")'
cargo run --offline -p foker-context --example recall_diagnose -- /tmp/fa [calibration|validation]
pnpm build:native && pnpm build
(cd benchmarks && node run.mjs ctx-gold ../benchmarks/ctx-gold/cases.jsonl 8000 /tmp/ctx-gold-adr032)
```
