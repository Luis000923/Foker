# ADR-033 · Vista focal por símbolo para anclas grandes (fase 3)

- **Estado**: Implementada y medida; **desactivada por defecto** (`focal_min_tokens = 0`) porque
  no cumple el criterio declarado de activación
- **Fecha**: 2026-10-04
- **Issues**: FKR-094 (motor y evaluación), FKR-095 (ctx-gold de símbolos, Codex)
- **Modifica**: FOKER-SPEC §9.7 (opción adicional de nivel para anclas) y el esquema `ContextPack`
  (tres parámetros internos opcionales). Desarrolla la fase 3 de ADR-031.

## Contexto

Las anclas (L3) se entregaban completas o, si superaban el 40 % del presupuesto, se degradaban a
L2: solo firmas, sin cuerpos. Fixture A no puede medir esto, porque sus archivos tienen 2–5 líneas.

### ctx-gold de símbolos `foker-self` (FKR-095, metodología aditiva)

Lo genera, de forma determinista, `benchmarks/ctx-gold/foker-self/generate.mjs` a partir del
historial de este repositorio en `d03fd5e`. Selección: commits feat/fix/refactor/perf no merge
con 1–3 archivos TS modificados y al menos uno de ≥ 300 líneas en el padre. Tarea = asunto del
commit sin prefijo. `gold_symbols` = el símbolo más interno del mapa del padre que contiene cada
línea cambiada. Resultado: 8 casos (2 calibration, 6 validation) y 43 descartes con motivo.
Las reglas se fijaron antes de ver los resultados y no se relajaron para obtener más casos.

Sesgos conocidos: un único repositorio, escrito en gran parte por agentes; los asuntos pueden
nombrar módulos; solo TS; n pequeño. **No sustituye a Fixture B (PREGUNTA-6).**

## Decisión

### Representación (motor, `crates/foker-context/src/focal.rs`)

Un ancla cuyo L3 supera `focal_min_tokens` y tiene foco determinista se entrega como **L3
focal**. Cada símbolo del archivo recibe una de estas formas:

| Forma | Cuándo | Qué se entrega |
|---|---|---|
| FULL | Símbolo focal, símbolo de una línea o contrato (interface/type/enum) de < 40 líneas | Cuerpo completo y comentarios/decoradores contiguos |
| OPEN | Contenedor de un símbolo focal (p. ej. clase) | Cabecera, hijos clasificados con estas reglas y cierre |
| SIGNATURE | Su nombre aparece en algún cuerpo focal (callee o tipo usado) | Comentario, primera línea y `// foker: líneas a–b omitidas` |
| REFERENCE | Resto | Solo el nombre, agrupado con los contiguos: `// foker: líneas a–b omitidas: n1, n2…` |

La cabecera del archivo (imports) va completa. La primera línea del cuerpo avisa: «vista focal;
cuerpos completos: …; N líneas omitidas y marcadas. Lea el archivo completo si necesita más».
El aviso va **dentro de `rendered`**, porque `files[].note` no llega al modelo por MCP.
El nivel sigue siendo L3; `files[].note` registra los símbolos focales.

**Foco** (sin gold ni reglas por caso): anclas de símbolo de la petición (id, nombre o nombre
cualificado), identificadores citados en la tarea y BM25 dentro del archivo (nombre, firma y
JSDoc de cada símbolo; idf sobre los símbolos del archivo; se ignoran los términos presentes en
todos sus símbolos). Hasta `focal_max_symbols` (5) con puntuación ≥ `focal_relative` (0,5) × la
mejor. **Sin foco, o si la vista no reduce el archivo, se entrega el archivo completo**.

En la selección de anclas, la vista focal se prueba antes que el L3 completo y antes de la
degradación a L2/L1. Si hay foco, también sustituye a la L2 sin cuerpos.

### Parámetros internos

`focal_min_tokens` (0 = desactivada, default), `focal_max_symbols` (5) y `focal_relative` (0,5).
Se omiten del JSON cuando valen el default. Se añaden al esquema `ContextPack` como propiedades
opcionales, sin cambios en N-API, CLI ni MCP.

## Evaluación (OBSERVACIÓN)

`focal_eval` construye cada caso con sus `gold_modified` como anclas: es una evaluación
condicionada a que el agente ancle el archivo correcto. Recall de símbolos = fracción de
`gold_symbols` cuyo texto completo aparece literalmente en `rendered`. Presupuesto 8000.

Rejilla y criterio declarados antes de separar splits: `focal_min_tokens` ∈ {500, 1000, 2000}
frente a 0. Se elige con calibration por mayor recall de símbolos sin regresión por caso y, a
igualdad, menos tokens de ancla; empate total → primero de la rejilla. **Activación por
defecto** solo si, además, validation no tiene regresiones por caso.

| Split | Umbral | Recall de símbolos | Tokens de ancla (media) | Regresiones por caso |
|---|---:|---:|---:|---|
| calibration (2) | 0 (por archivo) | 0,750 | 3590 | — |
| calibration (2) | **500 (elegido)** / 1000 / 2000 | 0,750 | 3402 | ninguna |
| validation (6) | 0 (por archivo) | 0,289 | 1767 | — |
| validation (6) | 500 / 1000 | 0,408 | 1777 | fs-0193be72 (0,4 → 0,2) |
| validation (6) | 2000 | 0,442 | 2033 | ninguna (no elegible: elegirlo mirando validation sería sobreajuste) |

**No se cumple el criterio de activación: la vista focal queda desactivada por defecto.**

Mecanismos observados:
- En 5 de los 8 casos, la vista **por archivo** degradaba al menos un ancla a L2, sin cuerpos:
  hoy un ancla grande no entrega su código. La vista focal recupera cuerpos ahí (fs-4e4c8bb1
  0 → 0,25; fs-92fef5fd 0 → 0,5; fs-68685f96 0,33 → 0,5) con un coste similar.
- Donde el L3 completo ya cabía, la vista focal reduce tokens, pero puede elegir mal el foco
  con tareas vagas. En fs-0193be72 («gates G1–G5, validación y comandos task/validate») elige
  `captureBaseline` en lugar de `treeSnapshot`.
- Informativo, sin anclas: el recall de archivos en este repositorio real es 0,5 (calibration)
  y 0,78 (validation).

**INTERPRETACIÓN**: la vista focal mejora el recall de símbolos frente a la degradación a L2,
pero el foco léxico falla en tareas vagas, y con n = 8 (2 en calibration) no hay base para
fijar un umbral. **HIPÓTESIS**: aplicarla solo cuando el L3 completo no cabe (sustituir a L2
sin quitar nunca un L3 que cabe) eliminaría la regresión observada. Es una política distinta que
se declarará y medirá con un ctx-gold de símbolos mayor, procedente de repositorios reales
(Fixture B, PREGUNTA-6).

## Consecuencias

- Sin cambio de comportamiento por defecto: los packs, snapshots y hashes existentes no varían.
- El esquema admite `request.params.focal_*` (aditivo y opcional).
- ctx-gold gana un dataset de símbolos reproducible y un evaluador (`focal_eval`).
- Hallazgo general: `files[].note` (degradación a L2, vista focal) no llega al agente por MCP;
  por eso los avisos de omisión deben ir dentro de `rendered`.

## Reproducción

```sh
node benchmarks/ctx-gold/foker-self/generate.mjs --head d03fd5e
# Materializar cada commit padre: materialize(sha, dir) exportado por generate.mjs, en <trees>/<sha>
cargo run --release --offline -p foker-context --example focal_eval -- \
  benchmarks/ctx-gold/foker-self/cases.jsonl <trees> /tmp/focal-eval.json 0 500 1000 2000
```
