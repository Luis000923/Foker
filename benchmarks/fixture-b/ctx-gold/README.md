# Fixture B · ctx-gold y evaluador offline (FKR-014, parte D)

Implementa la sección «ctx-gold de Fixture B» de
[ADR-035](../../../docs/adr/ADR-035-fixture-b-repositorios-reales.md). **Solo evaluación**: ningún
parámetro del motor se ajusta con estos datos. Todavía no hay tareas aceptadas; este directorio no
contiene `cases.jsonl` hasta que exista `tasks.jsonl` con las tareas verificadas.

## Reproducción

Desde la raíz de Foker, con Node ≥ 22.14, Git, el addon nativo y `packages/core/dist`
(`pnpm build:native && pnpm build` si faltan) y los clones completos de solo lectura:

```sh
node benchmarks/fixture-b/ctx-gold.mjs \
  --tasks <tasks.jsonl> \
  --repos /home/luis/Documentos/foker-fixture-b/full \
  --trees <dir de árboles>

CARGO_TARGET_DIR=$PWD/target cargo run --release -p foker-context --example fixture_b_eval --offline -- \
  benchmarks/fixture-b/ctx-gold/cases.jsonl <dir de árboles> <salida.json>
```

### Generador (`ctx-gold.mjs`)

- Entrada: una línea JSON por tarea `{id, repo, base, commit, statement, tests_changed}`. `id`
  debe casar con `^[a-zA-Z0-9][a-zA-Z0-9._-]*$` (es un nombre de directorio), `repo` es el nombre
  del clon dentro de `--repos`, `base` y `commit` son SHA de 40 hex. Se exige `base = commit^1`.
- Sobre el clon solo ejecuta `git rev-parse`, `git diff` y `git archive` (sin checkout, HEAD ni
  remotos). Materializa B con `git archive B | tar -x` en `<trees>/<id>` (reemplaza un árbol previo
  de ese id; sin `.git`). El motor (`openEngine` → `refresh` → `exportMapJson`) construye el mapa de B;
  su caché `.foker/` se elimina después si B no la traía.
- Escribe únicamente `benchmarks/fixture-b/ctx-gold/cases.jsonl`, ordenado por `id`, con
  `{id, fixture: "fixture-b", repo, base, task, gold_modified, gold_symbols, split}`; `task` es
  `statement` literal. Imprime un resumen con splits, líneas sin símbolo y casos con
  `gold_symbols` vacío (se conservan: la tarea ya fue aceptada).
- Determinista: dos ejecuciones dan los mismos bytes (comprobado en el test y con cuatro
  candidatos reales de Zod y TanStack Query).

Definiciones:

- **`gold_modified`**: rutas con estado `M` en `git diff --name-status --find-renames=50% B C` que
  son TS propio según `isOwnSource` de `mine.mjs` (`.ts/.tsx/.mts/.cts`, no `.d.ts`, fuera de
  `TEST` y `EXCLUDE`). Es exactamente `src_modified` del minado. Añadidos, borrados y renombres no
  cuentan. Un caso sin `gold_modified` es un error.
- **`gold_symbols`**: método de FKR-095, importado sin cambios de
  `benchmarks/ctx-gold/foker-self/generate.mjs` (`oldLines`, `assignLines`, `parentMap`): para cada
  `gold_modified`, las líneas antiguas de `git diff -U0 --no-renames B C -- <ruta>` (una inserción
  usa su anclaje antiguo) se asignan al símbolo más interno del mapa de B que las contiene; ids
  ordenados y únicos.
- **`split`**: `splitFor(id)` de foker-self: primer byte de `sha256(id)` par → `calibration`, impar
  → `validation`.

### Evaluador (`crates/foker-context/examples/fixture_b_eval.rs`)

Construye el mapa de cada `<trees>/<id>` con `MapConfig::default()` (igual que `openEngine` sin
configuración) y evalúa cada caso con presupuesto **8000** en la lista fija de configuraciones:

| Config | Parámetros |
| --- | --- |
| `default` | motor actual, `params` ausente |
| `sin_adr034` | `small_full_max_extra = 0` |
| `sin_adr033` | `focal_min_tokens = 0` |
| `plegado` | `inflection_folding = true` (solo medido; sigue desactivado) |

La lógica vive en `examples/support/fixture_b.rs`; `examples/support/delivery.rs` contiene
`delivered_in_file`, extraído sin cambios de `focal_eval.rs` (su salida no cambia).

## Métricas (por caso y configuración)

Notación: `G` = `gold_modified`; `E(pack)` = archivos del pack con nivel L1, L2 o L3 (L0 no cuenta).

- **`pack`** (sin anclas, solo el enunciado):
  - `recall` = |G ∩ E| / |G|; `precision` = |E ∩ G| / |E| (0 si E vacío).
  - `tokens` = `budget.used`.
  - `gold_full` = fracción de G cuyo contenido completo (archivo de B leído como UTF-8, `\r\n`→`\n`,
    con el escape `<foker:`→`&lt;foker:` de rendered) es igual a algún cuerpo de su propio archivo
    en `rendered`. Cuerpos: bloques individuales `<foker:file id=… level="L2|L3" …>` y entradas del
    envoltorio `<foker:files level="L2">` (ruta sin indentar; líneas indentadas dos espacios, sin la
    indentación), quitando solo la cabecera exacta de explain `### <id>  [`. Port literal de
    `fileBodies`/`goldFull` de `benchmarks/src/ctx-gold.ts`.
  - `build_ms` = tiempo de `build_context` (ms, reloj de pared).
  - Si `build_context` falla: `error` = código (`FKR-…`) y recall, precisión y gold_full = 0.
- **`flow`** (`begin` sin scope, ADR-032; port de `flowPack`):
  - `scope` = `deriveScopePaths` del pack anterior: directorios (`dir/**`) de todos los L3; si no
    hay L3, de tres L2, primero los de señal directa (`ANCHOR`, `PATH_MENTION`, `SYMBOL_MENTION`,
    `LEXICAL:`) y luego el resto, cada grupo por puntuación descendente e id ascendente; un archivo
    de la raíz se acota a sí mismo. Únicos y ordenados.
  - Error de alcance (`scope_error: true`, todo 0): alcance vacío (`FKR-INP-001`), glob inválido
    (`FKR-INP-001`) o intersección con `DEFAULT_POLICY.protected_paths` según
    `protectedPathsInScope` (archivos del mapa dentro del alcance y protegidos, prefijos literales y
    representantes de globs) → `FKR-POL-002`. La lista Rust se comprueba contra `@foker/policy` en
    vitest.
  - `scope_coverage` = |{g ∈ G : g casa con algún glob del alcance}| / |G|.
  - Pack definitivo: misma petición con `task_scope = {taskId tsk_000…, description = task, paths =
    scope, checks = typecheck, lint, test, secrets}`; `recall`, `precision`, `gold_full` y `tokens`
    (`budget.used`) como en `pack`. Si falla: `error` = código, `scope_error: false`, recall 0.
- **`symbols`** (anclas = G, como `focal_eval`): `symbol_recall` = fracción de `gold_symbols` cuyo
  texto completo (líneas del rango del símbolo en B, mismo escape) llega en el bloque de su propio
  archivo (`delivered_in_file`); `null` sin `gold_symbols`. `anchor_tokens` = suma de `tokens` de
  las entradas de G; `tokens` = `budget.used`. Si `build_context` falla (p. ej. `FKR-CTX-001`
  cuando un ancla obligatoria no cabe): `error` y recall 0. Un `gold_symbol` ausente del mapa
  aborta la evaluación (error de integridad del dataset).
- **Por árbol**: `map_ms` (tiempo de `build` del mapa) y `map_files`.

## Resumen

`summary.<config>.{all,calibration,validation}`: medias macro por caso de recall, precisión,
gold_full y scope_coverage (los errores cuentan 0); mediana y media de tokens (el flujo con error
aporta 0 tokens, como `rendered_tokens` en ctx-gold.ts; un pack con error no aporta);
mediana/media de `build_ms`; `scope_errors`, `context_errors`/`errors`; recall de símbolos sobre
casos con `gold_symbols` y medianas de tokens de anclas. `map` resume `map_ms` de todos los árboles.
Los tiempos dependen de la máquina; el resto es determinista.

## Comprobación local

```sh
./node_modules/.bin/vitest run benchmarks/fixture-b
CARGO_TARGET_DIR=$PWD/target cargo nextest run -p foker-context --offline -E 'binary(fixture_b_eval)'
```

- Vitest crea un repo git sintético en el directorio temporal: árbol de B, `gold_modified` (sin
  `docs/`, tests ni añadidos), símbolo más interno (método frente a clase), split, determinismo,
  base distinta del padre e ids inválidos; y la paridad de rutas protegidas.
- El test Rust usa un árbol sintético pequeño: pack, `gold_full`, flujo (alcance `src/**`),
  símbolos con anclas, resumen por split, gold_symbol ausente, `directoryScope`, rutas protegidas
  y `fileBodies` con L2 agrupado y cabecera explain.
- Paridad TS↔Rust (`default`) verificada a mano en cuatro árboles reales (dos de Zod, dos de
  TanStack Query, enunciado = asunto del commit, solo humo): archivos expuestos, `gold_full`, tokens,
  alcance, expuestos y `gold_full` del flujo, cobertura y error idénticos a `flowPack`/`goldFull`.
  Esas cifras no son resultados de Fixture B.
