# ADR-036 · Reparto del presupuesto y archivos grandes en repositorios reales

- **Estado**: Propuesta. Hipótesis, umbrales y protocolo fijados **antes** de implementar y de
  medir.
- **Fecha**: 2026-10-05
- **Issue**: FKR-097
- **Modifica (si se acepta)**: FOKER-SPEC §9.5 (semillas de mención con paquete), §9.7 pasos 2–4
  (tope por archivo no ancla, L1 focal, anclas que no caben ni en L1) y el esquema `ContextPack`
  (parámetros internos opcionales). Sin cambios en N-API, CLI ni MCP.

## Contexto (OBSERVACIÓN)

Evaluación offline de Fixture B (ADR-035, `benchmarks/fixture-b/results/offline-eval-2026-10-05.json`,
presupuesto 8000, motor congelado en `e749daa`):

| Split | Casos | Recall pack | Recall flujo | Recall símbolos | Errores `FKR-CTX-001` (modo símbolos) |
|---|---|---|---|---|---|
| calibration | 24 | 0,2188 | 0,2396 | 0,3958 | 7 |
| validation | 21 | 0,6238 | 0,5746 | 0,3413 | 5 |
| todos | 45 | 0,4078 | 0,3959 | 0,3704 | 12 |

Fixture A: recall pack 0,7444, flujo 0,7611. TARGET de REQ-CTX-003: 0,80.

## Diagnóstico (OBSERVACIÓN, 2026-10-05)

`foker context --explain --json` sobre copias de los 45 árboles B (el CLI reproduce la evaluación
salvo b-query-03, b-query-13 y b-zod-03; ver «Pendiente»). 69 archivos gold:

| Categoría | Archivos gold | Mecanismo |
|---|---|---|
| Entregados (L1–L3) | 27 (39 %) | — |
| Rango 0–9, fuera por `BUDGET` | 16 (23 %) | **Reparto del presupuesto**: archivos *hub* sin señal directa ocupan la mayor parte |
| Rango 10–19 | 11 (16 %) | Ranking: candidatos de otros paquetes y de tests desplazan al gold |
| Rango ≥ 20 | 7 (10 %) | Ranking |
| Fuera del ranking | 8 (12 %) | Vocabulario (enunciado en español, sin término que case) |

Hallazgos concretos:

1. **Hubs que se comen el presupuesto.** En 13 de 45 casos un solo archivo ocupa más del 50 % de
   B. Sin señal léxica ni mención (`DEPENDENCY_OF:*` solamente), los archivos > 1.000 tokens
   consumen de media 2.328 tokens por caso. Ejemplos: b-query-01 entrega
   `query-core/src/types.ts` en L1 con **7.368 de 8.000 tokens**, y `react-query/src/useQueries.ts`
   (citado en el enunciado, rango 6) queda fuera por `BUDGET`. En Zod, `v4/core/util.ts` es el archivo
   más caro del pack en 14 de 15 casos (3.800–5.600 tokens) y los packs se quedan en 3–9 archivos.
   En Vite, `node/utils.ts` es el más caro en los 15 (2.700–3.300 tokens). Hoy un no ancla no tiene tope de tamaño:
   L2 se intenta en los 5 primeros y L1 en el resto, cueste lo que cueste.
2. **Archivos que no caben ni en L1.** `zod/src/v4/core/schemas.ts` ≈ 44.500 tokens
   (142.527 bytes) y `v4/classic/schemas.ts` ≈ 27.900. Son gold en 9 de 15 tareas de Zod. Su L1
   supera B, así que son imposibles de entregar: recall estructural 0. Las mismas anclas, en modo
   símbolos, producen los 12 `FKR-CTX-001` (las anclas se reservan siempre a L1 y el L1 no cabe).
   En uso real, un agente que ancla `schemas.ts` recibe un error en lugar de contexto.
3. **Monorepos con nombres repetidos.** `useQueries.ts` existe en react, preact, vue y solid. La
   mención `useQueries` reparte la semilla entre los cuatro. El enunciado dice
   `@tanstack/react-query`, pero el nombre de paquete no desambigua.
4. **Tests y ejemplos.** En Vite, 24 de 25 archivos del pack de b-vite-12 y 34 de 35 de b-vite-10
   son tests, `playground/` o utilidades de test, con intención `modify`.
5. **Vocabulario.** 8 gold no aparecen en el ranking. No se aborda aquí (expansión léxica,
   ADR-028).

## Decisión propuesta (HIPÓTESIS)

Cuatro cambios, cada uno con su parámetro interno en `params.rs` (0 o `false` lo desactiva) para
ablación:

- **D1 · Tope por archivo no ancla** (`related_max_fraction`). Un no ancla en L2 o L1 no puede
  ocupar más de `f × B`. Si L2 supera el tope, se prueba L1; si L1 lo supera, se aplica D2; si D2
  no da nada, se descarta con motivo `BUDGET`. Rejilla a priori: f ∈ {0,10, 0,15, 0,20, 0,25}.
- **D2 · L1 focal para no anclas grandes** (`related_focal`). Firmas solo de los símbolos del
  archivo con coincidencia léxica con la tarea (mismo foco BM25 que ADR-033, como máximo
  `focal_max_symbols`) y el número de símbolos omitidos. Nivel L1, con la marca de omisión dentro
  de `rendered`.
- **D3 · Anclas que no caben ni en L1** (`anchor_overflow_focal`). En lugar de `FKR-CTX-001`, el
  ancla se entrega como L3 focal (ADR-033) si cabe. Si no, como L0 con la nota «contenido omitido
  por presupuesto; léalo con su herramienta de lectura». `FKR-CTX-001` solo si ni el L0 de todas
  las anclas cabe junto al contexto obligatorio. No se trunca en silencio: la omisión es explícita.
- **D4 · Desambiguación por paquete** (`package_mentions`). Si el texto nombra un paquete del
  workspace (`name` de su `package.json`, p. ej. `@tanstack/react-query`), las semillas de mención
  de ruta o símbolo que resuelven en varios paquetes se restringen a los paquetes nombrados,
  cuando alguno de ellos contiene un candidato. Si no, se reparten como hoy.

**Fuera de alcance**: degradar tests y ejemplos (hallazgo 4). Se mide su efecto residual tras
D1–D4 y, si sigue dominando, irá en un ADR propio.

## Umbrales (fijados a priori)

Criterio principal, medido **una sola vez** con `validation` al final:

> Recall pack de Fixture B `validation` ≥ **0,724** (base 0,6238 + 0,10).

Barreras (todas obligatorias):

| Métrica | Base | Exigido |
|---|---|---|
| Fixture A ctx-gold, recall pack (60) | 0,7444 | ≥ 0,7444 y ningún caso pierde un archivo gold |
| Fixture A ctx-gold, recall flujo | 0,7611 | ≥ 0,7611 |
| foker-self símbolos, `validation` | 0,442 | ≥ 0,442 |
| Fixture B `validation`, recall flujo | 0,5746 | ≥ 0,5746 |
| Fixture B, errores en modo símbolos | 12 | ≤ 12 (objetivo de D3: 0) |
| Presupuesto | — | `budget.used` ≤ B en todos los casos (property test existente) |
| REQ-CTX-001/002/004 | verdes | verdes |

Si no se alcanza 0,724, el ADR pasa a **Rechazada** y se publica el resultado negativo con las
cifras, como ADR-024. Ningún umbral se mueve después de ver `validation`.

## Protocolo

1. Implementación con los cuatro parámetros desactivados por defecto: la salida del motor en
   Fixture A, foker-self y Fixture B debe ser **byte a byte idéntica** a `main` (prueba de no
   regresión del refactor).
2. Selección **solo con `calibration`** (24 casos B, más Fixture A como barrera): cada D se activa
   si sube el recall pack de calibration sin bajar ninguna barrera. D1 elige f en la rejilla fija
   (empate → la f mayor, más conservadora). Orden de evaluación fijo: D1 → D2 → D3 → D4, de forma
   acumulativa.
3. Con la configuración congelada se mide `validation` una vez y se aplican los umbrales.
4. Revisión cruzada (Codex implementa, Claude revisa; OpenCode revisa el evaluador).

## Riesgos

- D1 puede quitar contexto útil de tipos centrales (p. ej. `types.ts`) que el agente necesita. Se
  vigila en el smoke posterior: que no aumenten los `Read` de esos archivos.
- D4 depende de que el enunciado nombre el paquete. En la web piloto (Next.js + Turborepo) los
  paquetes `@repo/*` son el caso típico.
- n = 21 en `validation`: un caso vale ≈ 0,048. El umbral exige algo más de dos casos completos.

## Pendiente

- El CLI y `fixture_b_eval` difieren en 3 de 45 casos (b-query-03, b-query-13, b-zod-03). Hay que
  explicar la diferencia (¿configuración del mapa?) antes de comparar cifras del CLI con las del
  evaluador.

## Resultados de calibración

**OBSERVACIÓN (FKR-097, 2026-10-05):** implementación Rust, presupuesto 8000, exclusivamente
los **24 casos calibration** de Fixture B. No se ha medido validation de Fixture B. El ADR
sigue en estado **Propuesta**; sus umbrales y el orden de selección permanecen sin cambios.
Los árboles se leen directamente y `ParseCache` vive en memoria; no se crea `.foker/`.
La base reproduce la evaluación congelada en `e749daa` en calibration. No se comparan aquí
las cifras con el diagnóstico del CLI; la discrepancia de tres casos de «Pendiente» sigue abierta.

| Configuración candidata | Recall pack | Recall flujo | Recall símbolos | Errores símbolos | Tokens medianos pack |
|---|---:|---:|---:|---:|---:|
| Todos desactivados (base) | 0,218750 | 0,239583 | 0,395833 | 7 | 7590,5 |
| D1 · f = 0,10 | 0,395833 | 0,395833 | 0,395833 | 7 | 7535,0 |
| D1 · f = 0,15 | 0,395833 | 0,395833 | 0,395833 | 7 | 7552,5 |
| D1 · f = 0,20 | 0,416667 | 0,416667 | 0,395833 | 7 | 7580,0 |
| D1 · f = 0,25 | 0,458333 | 0,458333 | 0,395833 | 7 | 7582,0 |
| D1 (0,25) + D2 | 0,718750 | 0,541667 | 0,395833 | 7 | 7588,0 |
| D1 (0,25) + D2 + D3 | 0,718750 | 0,541667 | 0,437500 | 0 | 7588,0 |
| D1 (0,25) + D2 + D4 (D3 descartada) | **0,802083** | **0,625000** | 0,395833 | 7 | 7589,5 |

Selección acumulativa según el criterio principal de calibration:

1. D1 conserva **f = 0,25**, por mayor recall pack; no hubo empate para el máximo.
2. D2 se conserva: aumenta el recall pack y pasa las barreras.
3. D3 se descarta de la configuración elegida: mejora símbolos y elimina todos sus errores,
   pero **no aumenta recall pack**. Su implementación queda disponible para ablación, desactivada.
4. D4 se prueba sobre la cadena conservada (D1+D2, sin D3) y se conserva: aumenta recall pack
   y pasa las barreras. No se reincorpora D3 para evaluar D4.

**Barreras:** todas las candidatas de esta tabla conservan Fixture A pack **0,744444** y flujo
**0,761111**, con **cero casos que pierdan algún archivo gold** frente al motor desactivado
(comparación de conjuntos, 60 casos completos). No se usó Fixture A para ajustar parámetros.
Foker-self validation conserva **0,441667 (0,442 a la precisión del ADR-033)** y es idéntico
por caso en los seis casos, para todas las candidatas. La barrera de errores de B se comprueba
solo en calibration (7 → 7, o 0 con D3); el total de B y sus barreras validation quedan pendientes.
El property test de presupuesto cubre ahora combinaciones de los cuatro parámetros.

**Configuración congelada, activada como default únicamente en el segundo paso:**

```json
{
  "related_max_fraction": 0.25,
  "related_focal": true,
  "anchor_overflow_focal": false,
  "package_mentions": true
}
```

[Parámetros congelados](../../benchmarks/fixture-b/results/adr036-frozen-params.json) e
[informe con métricas, casos y barreras](../../benchmarks/fixture-b/results/adr036-calibration-2026-10-05.json).
La selección no implica aceptación del ADR: se mantiene el criterio validation ≥ 0,724 y
las demás barreras fijadas arriba. Validation B corresponde al siguiente paso humano, una sola vez.

### Reproducción del evaluador

`fixture_b_eval <cases> <trees> <salida> [configs.json] [split]` mantiene las cuatro
configuraciones históricas y acepta un array adicional de `{name, params}`. El filtro de split
se aplica **antes** de construir el mapa o consultar símbolos gold. Nombres repetidos de
configuración son error. Para replicar esta fase deben pasarse overrides explícitos que incluyan
los cuatro valores desactivados de la base, porque el default final ya es el congelado.
`fixture_a_barrier <fixture-a generada> <configs.json> <salida>` evalúa los 60 casos, pack/flujo
y pérdidas de archivos gold. `focal_eval` admite el archivo de overrides por
`FOKER_EVAL_PARAMS`, conservando su salida original sin la variable; usar umbral `500`.
Ver [instrucciones y modos internos](../context-engine.md#propuesta-para-repositorios-reales--adr-036-fkr-097).

### Identidad previa a congelar defaults

Con los cuatro parámetros en 0/false se exportó `main` (`e749daa`) a `/tmp` con `git archive`.
Solo se copiaron los evaluadores instrumentados para emitir packs canónicos; no se modificó el
motor de main. Se compiló con `cargo --offline`, el mismo `CARGO_TARGET_DIR` y
`--target x86_64-unknown-linux-gnu` para aislar los artefactos del worktree. Una prueba negativa
confirmó que ese binario de main rechaza los campos nuevos de ADR-036. Esta separación evita
la reutilización de artefactos observada en el primer intento de comparación, que se descartó.

Se compararon con `cmp` los JSON canónicos íntegros (incluyen `rendered`, hashes, presupuesto,
metadatos y descartes) y los errores completos del motor, sin tiempos ni normalización de sus
bytes. Fixture A: 60 casos × cuatro configuraciones históricas más defaults explícitos × tres
modos = **900** packs. Fixture B: **solo calibration**, 24 × cinco configuraciones × tres modos
= **360** resultados (325 packs y 35 errores completos). Foker-self: ocho casos, sin anclas y
con anclas a umbral 500 = **16** packs. **1276 resultados idénticos byte a byte**. Los SHA-256
figuran en el informe. Solo tras cerrar esta prueba se activaron los defaults congelados.

### Comprobaciones locales tras congelar

`cargo fmt --check` y `cargo clippy -p foker-context -p foker-map --all-targets --offline --
-D warnings` pasan. `cargo nextest run -p foker-context -p foker-map --offline`: **155 tests
pasan, 2 omitidos** (los benchmarks de rendimiento ignorados existentes). Incluye los casos D1/D2,
D3 focal/L0/error mínimo, D4 con candidatos repetidos y fallback de paquete, el filtro de split
y el property test de presupuesto. Generación de esquemas `--check` y Biome pasan. Vitest de
esquemas: 55 tests pasan; el test que usa `spawnSync` queda bloqueado por `EPERM` del sandbox,
y su comprobación de generación se ejecuta por separado y pasa. Sin red ni commits.

REQ-CTX-004 se ejecutó también por separado en release, pese a estar ignorado en la suite
habitual: `cargo test --release -p foker-context --test perf_large --offline -- --ignored
--nocapture`. Large-10k, 20 muestras: **p95 256,76 ms**, mediana 245,92 ms (TARGET < 300 ms);
1 test pasa. No se modifica su TARGET.

## Resultado de validation (medido una vez, 2026-10-05)

Medido por Claude con la configuración congelada (defaults del motor), los 45 casos de B y
`fixture_b_eval`; [resultados](../../benchmarks/fixture-b/results/adr036-validation-2026-10-05.json).

| Split | Recall pack | Recall flujo | Recall símbolos | Errores símbolos | Cobertura de alcance | Errores de alcance |
|---|---|---|---|---|---|---|
| calibration | 0,8021 (base 0,2188) | 0,6250 (0,2396) | 0,3958 | 7 | 0,250 (**0,479**) | **4** (0) |
| validation | **0,8635** (base 0,6238) | 0,8159 (0,5746) | 0,3413 | 5 | 0,476 (**0,619**) | **1** (0) |
| todos | 0,8307 (base 0,4078) | 0,7141 (0,3959) | 0,3704 | 12 | 0,356 (**0,544**) | **5** (0) |

Criterio principal (≥ 0,724): **cumplido**. Barreras fijadas: todas cumplidas (Fixture A y
foker-self idénticos, flujo validation 0,8159 ≥ 0,5746, errores de símbolos 12 ≤ 12, presupuesto).
Caso a caso: 23 casos mejoran el recall del pack y **ninguno empeora**. El recall del flujo
empeora en b-query-10 (1 → 0) y b-zod-04 (0,25 → 0). Quedan con recall 0: b-vite-04, b-vite-06,
b-vite-10, b-zod-14 (vocabulario: el gold no está en el ranking).

### Hallazgo no cubierto por las barreras: alcance derivado (OBSERVACIÓN)

La **cobertura de alcance** del flujo `begin` sin `scope` cae (0,544 → 0,356) y aparecen **5
errores de alcance** (`FKR-INP-001`, alcance vacío) donde antes había 0. Causa: `deriveScopePaths`
(ADR-031 2b/ADR-032) usa los L3 o, si no hay, **tres L2**. Con D1+D2 los archivos relevantes y
grandes pasan a **L1** (completo o focal) y dejan de contar. El alcance se forma con L2 marginales
(`playground/**`, `zod/src/v3/benchmarks/**`) o queda vacío. En uso real eso acota la tarea a
directorios equivocados: es lo que hizo fallar b-query-01 (brazo Foker) en `bench-b-smoke-2`,
donde el gate de alcance impidió editar `react-query`. No es una barrera fijada, pero **no se
integra en `main` con esta regresión**.

### D5 · Alcance derivado con L1 (criterio fijado antes de implementar)

`deriveScopePaths` (TS en `@foker/engine` y su port en `examples/support/fixture_b.rs`): sin L3,
toma los tres primeros archivos de **L2 o L1** con señal directa, por puntuación descendente e
id ascendente, y luego los de L2 sin señal directa (como hoy). L0 no cuenta. Sin parámetro nuevo:
es una función del flujo, no del motor.

Barreras de D5 (más estrictas; no relajan nada de lo anterior):

| Métrica | Exigido |
|---|---|
| Errores de alcance B (todos) | 0 |
| Cobertura de alcance B, calibration y validation | ≥ base de `main` (0,479 y 0,619) |
| Recall del flujo B, calibration y validation | ≥ valores de la tabla anterior (0,6250 y 0,8159) |
| Fixture A ctx-gold, cobertura de alcance y recall del flujo | ≥ base (0,8319 y 0,7611) |
| Recall del pack | sin cambios (D5 no toca el motor) |

Si D5 no cumple, el ADR no se integra y se reabre la decisión.

### Resultados de D5

**OBSERVACIÓN (2026-10-05): D5 no cumple todas sus barreras. No se integra el ADR y se
reabre la decisión.** El criterio, las barreras y los defaults congelados permanecen intactos.
Implementación idéntica en TS y Rust: L3 si existe; sin L3, ranking conjunto L1/L2 con señal
directa, después L2 sin señal, corte a tres archivos antes de deduplicar directorios. L0 excluido.
`benchmarks/src/ctx-gold.ts` importa `deriveScopePaths` de `@foker/engine`.

Fixture B: `CARGO_TARGET_DIR=/home/luis/Documentos/Foker-097/target cargo run --release --offline
-p foker-context --example fixture_b_eval -- benchmarks/fixture-b/ctx-gold/cases.jsonl
/home/luis/Documentos/foker-fixture-b/trees benchmarks/fixture-b/results/adr036-d5-2026-10-05.json`.
Los árboles se leen sin modificarlos; no se crea `.foker/`. No se ajustan parámetros del motor.

Cada celda sigue el orden **main / validation D1–D4 / D5**:

| Split | Recall pack | Recall flujo | scope_coverage | scope_errors |
|---|---|---|---|---|
| calibration (24) | 0,218750 / 0,802083 / 0,802083 | 0,239583 / 0,625000 / 0,760417 | 0,479167 / 0,250000 / 0,541667 | 0 / 4 / 0 |
| validation (21) | 0,623810 / 0,863492 / 0,863492 | 0,574603 / 0,815873 / 0,911111 | 0,619048 / 0,476190 / 0,714286 | 0 / 1 / 0 |
| todos (45) | 0,407778 / 0,830741 / 0,830741 | 0,395926 / 0,714074 / 0,830741 | 0,544444 / 0,355556 / 0,622222 | 0 / 5 / 0 |

[Medición D5](../../benchmarks/fixture-b/results/adr036-d5-2026-10-05.json),
[comparación de los 45 casos](../../benchmarks/fixture-b/results/adr036-d5-comparacion-2026-10-05.md)
y [detalle de flujos y alcances](../../benchmarks/fixture-b/results/adr036-d5-comparacion-2026-10-05.json).
`offline-eval-2026-10-05.json` solo contiene agregados: para el detalle main se ejecutó el
binario aislado de `e749daa` conservado de la prueba de identidad en `/tmp/fkr097`;
recall pack/flujo, cobertura y errores por split reproducen el informe publicado (tolerancia
1e-12). Frente a validation, mejora el recall de b-query-10 (0 → 1), b-zod-04 (0 → 0,25),
b-zod-08, b-zod-11, b-zod-12 y b-zod-15 (0 → 1); ningún caso pierde recall del flujo.
Los cinco errores de alcance desaparecen. b-query-13 pierde cobertura (1 → 0), aunque
mantiene recall 1; la tabla por caso incluye también cambios de alcance sin cambio de recall.
Recall del pack idéntico a validation en los 45 casos.

Fixture A se midió con **`fixture_a_barrier` (port Rust del flujo)**, los 60 casos ctx-gold,
la Fixture A generada en `/tmp/fkr097/fixture-a`, el monorepo del repositorio y
`/tmp/fkr097/empty.json` (`[]`, sin overrides). Comando: `cargo run --release --offline
-p foker-context --example fixture_a_barrier -- /tmp/fkr097/fixture-a /tmp/fkr097/empty.json
benchmarks/fixture-b/results/adr036-d5-fixture-a-2026-10-05.json`, con el mismo `CARGO_TARGET_DIR`.
[Resultado A](../../benchmarks/fixture-b/results/adr036-d5-fixture-a-2026-10-05.json):
cobertura **0,822222** (base 0,831944), recall flujo **0,744444** (base 0,761111),
recall pack **0,744444** (sin cambios), cero errores de alcance.
Frente a la medición A anterior conservada en `/tmp/fkr097/d4-a.json`, el recall solo baja
en **a-48 (1 → 0)**; cobertura baja en a-19 (1 → 0), a-32 (1 → 0,5),
a-46 (0,75 → 0,5), a-50 (2/3 → 1/3), y sube en a-20 (0 → 1), a-34 (0,5 → 1).

Aplicación literal de las barreras D5:

| Métrica | Resultado | Cumple |
|---|---|---|
| Errores de alcance B (todos) = 0 | 0 | Sí |
| Cobertura B calibration/validation ≥ main (0,479 y 0,619) | 0,541667 / 0,714286; también supera las bases sin redondear | Sí |
| Recall flujo B calibration/validation ≥ 0,6250 / 0,8159 | 0,760417 / 0,911111 | Sí |
| Fixture A cobertura y recall flujo ≥ 0,8319 / 0,7611 | 0,822222 / 0,744444 | **No, ambos** |
| Recall pack sin cambios | B: idéntico en 45/45 casos; A: 0,744444, idéntico por caso | Sí |

Comprobaciones locales (sin red ni commit):

```text
cargo fmt --check
  exit 0
cargo clippy -p foker-context --all-targets --offline -- -D warnings
  exit 0; Finished dev profile
cargo nextest run -p foker-context --offline
  exit 0; 77 tests run: 77 passed, 1 skipped
./node_modules/.bin/vitest run packages/engine benchmarks
  exit 1; 244 passed, 3 failed (spawnSync git EPERM del sandbox)
./node_modules/.bin/biome check packages/engine benchmarks
  exit 0; Checked 146 files. No fixes applied.
./node_modules/.bin/tsc -b
  exit 0
```

El JSON previo de validation se formateó con Biome sin cambiar datos para resolver su error
preexistente de formato. La suite completa Vitest no queda verde por los tres fallos del
sandbox; no se modifican esos tests ni se presenta la Definition of Done como cumplida.
