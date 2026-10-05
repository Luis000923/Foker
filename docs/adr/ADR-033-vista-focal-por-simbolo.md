# ADR-033 · Vista focal por símbolo para anclas grandes (fase 3)

- **Estado**: Aceptada. **Activa por defecto** (`focal_min_tokens = 500`) **solo** como sustituta de
  la degradación de anclas; la primera política (sustituir también a L3 completos) se rechazó
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
El aviso va **dentro de `rendered`**, delimitado y escapado. `files[].note` se renderiza tras
`</foker:file>`, fuera del límite de confianza, así que solo lleva conteos y nunca ids del
repositorio. El nivel sigue siendo L3 (los objetivos para `deriveScopePaths` y las métricas
L1–L3 no cambian).

**Foco** (sin gold ni reglas por caso): anclas de símbolo de la petición (id, nombre o nombre
cualificado), identificadores citados en la tarea y BM25 dentro del archivo (nombre, firma y
JSDoc de cada símbolo; idf sobre los símbolos del archivo; se ignoran los términos presentes en
todos sus símbolos). Hasta `focal_max_symbols` (5) con puntuación ≥ `focal_relative` (0,5) × la
mejor. **Sin foco, o si la vista no reduce el archivo, se entrega el archivo completo**.

**Política final (B)**: el L3 completo va primero si cabe en `anchor_fraction` y en la capacidad
restante. La vista focal solo se intenta cuando no cabe, y antes de degradar a L2/L1. Nunca
sustituye a un L3 completo que cabe. Todo cuerpo anunciado como focal se entrega completo; si un
solapamiento de rangos lo impide, se abandona la vista.

### Parámetros internos

`focal_min_tokens` (500 por defecto; 0 la desactiva), `focal_max_symbols` (5, solo para las
incorporaciones léxicas: las anclas y los identificadores citados siempre entran) y
`focal_relative` (0,5).
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

### Política A (primera implementación): rechazada

La vista focal sustituía también a L3 completos que cabían. Evaluador inicial (contención en
todo `rendered`):

| Split | Umbral | Recall de símbolos | Tokens de ancla (media) | Regresiones por caso |
|---|---:|---:|---:|---|
| calibration (2) | 0 / 500 (elegido) | 0,750 / 0,750 | 3590 / 3402 | ninguna |
| validation (6) | 0 / 500 | 0,289 / 0,408 | 1767 / 1777 | fs-0193be72 (0,4 → 0,2) |

No cumplía el criterio. El revisor de arquitectura y la HIPÓTESIS del ADR coinciden: la
regresión aparece al quitar un L3 completo que cabía.

### Política B (final), tras corregir los hallazgos de revisión

Evaluador corregido (hallazgo 6 de Codex): un símbolo cuenta solo si su texto completo, escapado
igual que `rendered`, está en el bloque de su propio archivo (L3, L2 individual o L2 compartido
indentado). Un gold ausente del mapa es un error. Mismos umbrales y criterio.

| Split | Umbral | Recall de símbolos | Tokens de ancla (media) | Tokens del pack (media) | Regresiones por caso |
|---|---:|---:|---:|---:|---|
| calibration (2) | 0 | 0,750 | 3590 | 7568 | — |
| calibration (2) | **500 (elegido por empate)** / 1000 / 2000 | 0,750 | 3590 | 7568 | ninguna |
| validation (6) | 0 | 0,289 | 1767 | 7543 | — |
| validation (6) | 500 / 1000 / 2000 | **0,442** | 2024 | 7542 | **ninguna** |

**Se cumple el criterio de activación: `focal_min_tokens = 500` por defecto.** Por caso
(validation): fs-4e4c8bb1 0 → 0,25; fs-68685f96 0,33 → 0,5; fs-92fef5fd 0 → 0,5; el resto,
igual. En calibration no hay anclas degradadas con foco, así que la elección es por empate y no
informa del umbral.

ctx-gold de Fixture A y de monorepo con el nuevo default: **rendered idéntico byte a byte en las
60 filas** (pack 0,7444, flujo 0,7611). Sus archivos no superan el umbral ni degradan.

**INTERPRETACIÓN**: hoy un ancla grande que no cabe pierde todos sus cuerpos (L2). La vista
focal recupera los del foco a cambio de un 15 % más de tokens de ancla y sin cambiar el total del
pack (el resto del presupuesto se ajusta). Con n = 8 la evidencia es **indicativa**. El umbral no
está calibrado; es el primero de una rejilla empatada. Revalidar con Fixture B (PREGUNTA-6).
Informativo, sin anclas: el recall de archivos en este repositorio real es 0,5 (calibration)
y 0,78 (validation).

## Revisiones independientes

| Hallazgo | Revisor | Clasificación | Acción |
|---|---|---|---|
| La nota con ids de símbolo se renderiza fuera de `foker:file` sin escapar | Codex | VALID | Nota solo con conteos |
| Solapamiento de rangos: cuerpo focal descartado pero anunciado | Codex + Claude | VALID | Invariante final; si falla, sin vista; test |
| Hijo que acaba en la línea de cierre del contenedor se pierde | Claude | VALID | Cota inclusiva del bloque hijo; test |
| OPEN pierde cabecera multilínea o con decorador | Codex | VALID | Cabecera hasta la llave; test |
| Comentario de bloque sin `*` y continuaciones con `*` mal clasificadas | Codex + Claude | VALID | Recorrido hasta `/*`; test |
| `focal_max_symbols` no limita lo explícito, contra la documentación | Codex + Claude | VALID (documentación) | Documentado: lo explícito siempre entra |
| `focal_eval` sin vínculo al archivo, sin escape y con denominador sesgado | Codex | VALID | Corregido; resultados remedidos |
| Política A sustituye a L3 que caben (causa de la regresión) | Claude | VALID | Política B |
| Tabla de niveles de §9.7 desactualizada | Claude | VALID | Tabla actualizada; nivel L3 conservado |
| `focal_candidate` recorre todos los símbolos por ancla | Claude | VALID | Índice perezoso por archivo, solo si hace falta la vista |
| Ancla `foo` de otro archivo marca un `foo` homónimo | Claude | VALID | `ruta#símbolo` por id exacto; test |

Sin falsos positivos. Confirmado sin cambios por ambos revisores: presupuesto (`used ≤ limit`),
determinismo, hash y caché, y grafo §4.2.

## Consecuencias

- Cambia el pack solo cuando un ancla de más de 500 tokens no cabe completa y tiene foco. Los
  snapshots y ctx-gold de Fixture A no varían.
- El esquema admite `request.params.focal_*` (aditivo y opcional).
- ctx-gold gana un dataset de símbolos reproducible y un evaluador (`focal_eval`).
- Hallazgo general: `files[].note` se renderiza fuera del límite de confianza; no debe contener
  datos del repositorio.

## Reproducción

```sh
node benchmarks/ctx-gold/foker-self/generate.mjs --head d03fd5e
# Materializar cada commit padre: materialize(sha, dir) exportado por generate.mjs, en <trees>/<sha>
cargo run --release --offline -p foker-context --example focal_eval -- \
  benchmarks/ctx-gold/foker-self/cases.jsonl <trees> /tmp/focal-eval.json 0 500 1000 2000
```
