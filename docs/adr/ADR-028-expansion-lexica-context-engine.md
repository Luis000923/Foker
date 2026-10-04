# ADR-028 · Expansión léxica bilingüe y corte relativo de contexto

- **Estado**: Aceptada para recuperación; sincronización normativa de overrides pendiente fuera de este ámbito
- **Fecha**: 2026-10-04
- **Relacionado**: ADR-024, FKR-037, FOKER-SPEC §9.3/9.5/9.7

## Contexto y decisión

La suite persistida contiene 60 casos: 30 `calibration` y 30 `validation`.
El baseline de los defaults anteriores recupera 0,6222 en calibración y 0,6000
en validación. La rejilla anterior de pesos (144 configuraciones) elige baseline.
Se implementan las propuestas de ADR-024 sin reglas por caso ni rutas del gold.

Se acepta `lexical_expansion = true` y `relevance_fraction = 0.01` como defaults.
`bm25_min_relative = 0` conserva top 20: el corte relativo BM25 se implementa como
opción experimental, pero no gana la calibración y no se activa. No se ajustan
pesos, presupuesto ni intención. Esta decisión amplía el MVP sin stemming de
§9.3 y el recorrido completo del ranking de §9.7; no reemplaza la especificación
normativa ni pretende reconstruir contratos faltantes.

## Algoritmo

`data/lexicon-es-en-v1.tsv` es un diccionario pequeño de vocabulario general de
desarrollo, versionado con el motor. Cada fila agrupa equivalencias es/en. Solo
se expande la consulta BM25: las rutas, identificadores candidatos para resolución
exacta, documentos indexados e intención permanecen separados. NFC, camelCase y
stopwords usan la tokenización existente. La búsqueda de entradas elimina tildes,
plural `es` (excepto `ces`) o `s`, y un sufijo nominal `acion`, `amiento`, `idad`,
`o` o `a`, conservando raíces de al menos cuatro caracteres. No es un stemmer
lingüístico completo: no trata conjugaciones ni todas las irregularidades.
El stemming solo compara contra el diccionario; nunca añade raíces arbitrarias.
Se conserva la multiplicidad original y se añade cada alternativa una vez,
ordenada lexicográficamente. No se consulta gold ni se generan anclas.

Con `bm25_min_relative > 0`, tras normalizar por el máximo, se conservan todas
las coincidencias con score ≥ umbral en lugar de truncar a `bm25_top`; los empates
siguen por id. Cero conserva top-k. Puede recuperar más de k documentos.

El corte de selección compara el score PPR final con el máximo del ranking
(incluidas anclas): descarta no-anclas estrictamente por debajo de
`maximum * relevance_fraction`, también para contornos L0. Las anclas mantienen
la reserva obligatoria y degradación por presupuesto; core mantiene su selección
estática independiente. Los descartes usan el motivo existente `RANK_CUTOFF`.
Cero desactiva el corte. El corte reduce contenido opcional: no introduce semillas
ni garantiza por sí solo recuperar archivos al final del ranking.

## Parámetros y contratos

Los tres parámetros viven en Rust `ContextParams`; N-API únicamente adapta campos
opcionales `lexicalExpansion?: boolean`, `bm25MinRelative?: number` y
`relevanceFraction?: number`. Las fracciones deben ser finitas y estar en [0,1].
No hay lógica de dominio en el binding ni exposición adicional en CLI/MCP.

La petición normalizada omite params si todos sus valores son predeterminados.
Dentro de overrides, los tres campos nuevos se serializan en snake_case solo
cuando difieren de sus defaults; así los overrides antiguos conservan la forma
JSON anterior. Un override nuevo distinto del default participa en pack_hash y
clave de caché, y puede añadir campos a `request.params`. El formato global del
pack y la API nativa mantienen sus versiones existentes: la entrada es aditiva.

**Pendiente contractual**: `packages/schemas/schemas/context-pack.schema.json`
tiene `additionalProperties: false` y todavía no reconoce estos tres campos
opcionales; `spec/api/foker-core.d.ts` tampoco los declara. Ambos archivos están
fuera del ámbito autorizado. Los packs predeterminados y overrides antiguos
siguen con una forma admitida; los overrides nuevos no predeterminados requieren
sincronizar esas declaraciones antes de validarlos con el esquema normativo.
Este ADR registra la ampliación, no inventa ni modifica esos contratos.

## Medición sin usar validación para ajustar

Dataset SHA-256: `482dbc0a2783eb159df86f4f63a9b46c38e6b349cb9267e2fbeda2f3b7b5ec09`.
Presupuesto 8.000; estimador `bytes-lf/3.2@1`; medias macro por caso.
La rejilla nueva se fijó antes de evaluar validación:
expansión {false,true} × corte BM25 {0,0.1,0.25,0.5} × corte ranking
{0,0.01,0.05,0.1}, 32 configuraciones. Se maximiza recall en calibración sujeto
a **media** de tokens ≤ baseline; desempate por precisión y luego primer resultado
(baseline incluido). Solo la configuración elegida se evalúa en validación.
No se ajusta el diccionario ni los umbrales después de observar validación.

| Split | Configuración | Recall | Precisión | Media tokens | Mediana tokens |
|---|---|---:|---:|---:|---:|
| calibration (30) | Antes | 0,6222 | 0,021787 | 6.655,33 | 7.541,5 |
| calibration (30) | Elegida | 0,7389 | 0,052084 | 4.728,37 | 4.101 |
| validation (30) | Antes | 0,6000 | 0,022893 | 6.650,13 | 7.546,5 |
| validation (30) | Elegida | 0,7500 | 0,049178 | 5.242,50 | 7.498,5 |

El objetivo ≥ 0,80 **no se alcanza**. La mejora de recall en validación es
0,15 y el pack medio baja un 21,17 %. La expansión aislada, sin corte, obtiene
0,7389 en calibración pero aumenta la media a 6.667,37; el corte al 1 % conserva
recall y reduce el tamaño. No se usa una cifra de archivos existentes en lugar
del recall normativo: los destinos y tests aún inexistentes siguen siendo misses.
La independencia entre tareas similares de una misma fixture sigue limitada.

### Rejilla de calibración registrada

| Expansión | Corte BM25 | Corte ranking | Recall | Precisión | Media tokens | Mediana tokens |
|---|---:|---:|---:|---:|---:|---:|
| false | 0 | 0 | 0.622222 | 0.021787 | 6655.33 | 7541.5 |
| false | 0 | 0.01 | 0.622222 | 0.073398 | 5491.90 | 7535.5 |
| false | 0 | 0.05 | 0.588889 | 0.111552 | 2474.27 | 1834.5 |
| false | 0 | 0.1 | 0.588889 | 0.174956 | 1707.53 | 1708 |
| false | 0.1 | 0 | 0.622222 | 0.021787 | 6655.33 | 7541.5 |
| false | 0.1 | 0.01 | 0.622222 | 0.073398 | 5491.90 | 7535.5 |
| false | 0.1 | 0.05 | 0.588889 | 0.111552 | 2474.27 | 1834.5 |
| false | 0.1 | 0.1 | 0.588889 | 0.174956 | 1707.53 | 1708 |
| false | 0.25 | 0 | 0.622222 | 0.021779 | 6655.43 | 7541.5 |
| false | 0.25 | 0.01 | 0.622222 | 0.078336 | 5448.43 | 7535.5 |
| false | 0.25 | 0.05 | 0.588889 | 0.140123 | 2437.87 | 1820 |
| false | 0.25 | 0.1 | 0.588889 | 0.174956 | 1706.80 | 1708 |
| false | 0.5 | 0 | 0.622222 | 0.021621 | 6650.27 | 7540 |
| false | 0.5 | 0.01 | 0.622222 | 0.130925 | 5395.57 | 7535.5 |
| false | 0.5 | 0.05 | 0.588889 | 0.173439 | 2269.43 | 1762 |
| false | 0.5 | 0.1 | 0.588889 | 0.189570 | 1677.47 | 1674.5 |
| true | 0 | 0 | 0.738889 | 0.023980 | 6667.37 | 7540.5 |
| true | 0 | 0.01 | 0.738889 | 0.052084 | 4728.37 | 4101 |
| true | 0 | 0.05 | 0.722222 | 0.086040 | 3200.40 | 2398.5 |
| true | 0 | 0.1 | 0.705556 | 0.177056 | 1841.50 | 1786 |
| true | 0.1 | 0 | 0.722222 | 0.023660 | 6669.27 | 7546 |
| true | 0.1 | 0.01 | 0.722222 | 0.058537 | 4705.63 | 3140 |
| true | 0.1 | 0.05 | 0.722222 | 0.085446 | 3585.63 | 2362 |
| true | 0.1 | 0.1 | 0.705556 | 0.180389 | 1899.33 | 1786 |
| true | 0.25 | 0 | 0.705556 | 0.023116 | 6663.63 | 7543 |
| true | 0.25 | 0.01 | 0.705556 | 0.077077 | 4386.87 | 2274.5 |
| true | 0.25 | 0.05 | 0.705556 | 0.137136 | 3070.33 | 2005 |
| true | 0.25 | 0.1 | 0.705556 | 0.208961 | 1755.57 | 1723 |
| true | 0.5 | 0 | 0.713889 | 0.022363 | 6650.23 | 7535.5 |
| true | 0.5 | 0.01 | 0.672222 | 0.178561 | 3526.53 | 2172.5 |
| true | 0.5 | 0.05 | 0.672222 | 0.189750 | 2835.40 | 1912.5 |
| true | 0.5 | 0.1 | 0.672222 | 0.212714 | 1652.60 | 1714.5 |

## Reproducción y verificación

Sin red, compilar con `./node_modules/.bin/tsc -p benchmarks/tsconfig.build.json`
y `cargo build --offline --release -p foker-napi`; en Linux x64 glibc, copiar
`target/release/libfoker_napi.so` a
`packages/core/foker-core.linux-x64-gnu.node` (equivale al artefacto de build:native).
`node benchmarks/run.mjs ctx-gold benchmarks/ctx-gold/cases.jsonl 8000 /tmp/foker-ctx-after`
guarda el informe sin modificar benchmarks. El baseline se midió antes de cambiar
el motor. Para reproducirlo en la API nueva usar explícitamente
`{lexicalExpansion:false,bm25MinRelative:0,relevanceFraction:0}`.

La rejilla se reproduce importando `loadCases` y `evaluateContext` desde
`benchmarks/dist/ctx-gold.js`, filtrando `split === 'calibration'` antes de llamar
al evaluador, y pasando cada combinación como quinto argumento
`evaluateContext(cases, repo, 8000, false, params)`. Los informes temporales son
`/tmp/foker-ctx-before.json`, `/tmp/foker-ctx-after.json` y
`/tmp/foker-lexical-calibration.json`; la tabla anterior conserva la rejilla.
`node benchmarks/run.mjs calibrate` ejecuta la rejilla anterior de 144 pesos;
no sustituye esta rejilla ni se utiliza para cambiar la configuración elegida.
Sus escrituras en reports se redirigieron a `/tmp` durante esta tarea.

Tests nuevos: expansión es/en, tildes, plural, multiplicidad y ausencia de entrada;
corte BM25 por encima de top-k, cola débil y empates; límite inclusivo del corte;
rangos inválidos; reserva de anclas; hash/caché con cada nuevo override; 50 packs
idénticos en 25 hilos. Se actualizan únicamente los snapshots botón y carrito por
el cambio de recuperación; el snapshot sin señal no cambia.

### Comprobaciones de esta ejecución

- `cargo test --offline --workspace`: verde; contexto tiene 17 tests unitarios y
  24 de integración (incluidos snapshots y propiedades). Tests de rendimiento
  ignorados no se ejecutan.
- `cargo fmt --all --check` y
  `cargo clippy --offline --workspace --all-targets -- -D warnings`: verdes.
- TypeScript raíz y benchmarks con `./node_modules/.bin/tsc`: verdes.
- `./node_modules/.bin/vitest run packages/core`: 57 tests verdes.
- `./node_modules/.bin/vitest run`: 535 pasan y 4 fallan: dos comprobaciones
  de schemas no pueden crear subprocesos (`spawnSync node EPERM`); dos E2E MCP
  cierran la conexión al arrancar. No se corrigen archivos ajenos al ámbito.
- `./node_modules/.bin/biome check .`: encuentra formato pendiente en `.mcp.json`
  y `benchmarks/docker/host.mjs`, ajenos al ámbito. El binding generado está
  excluido de Biome por la configuración existente.
- `node scripts/check-deps.mjs`: verde.
- `node packages/schemas/scripts/generate.mjs --check`: detecta tipos generados
  desactualizados en schemas (trabajo paralelo), fuera del ámbito.

La rejilla histórica también se ejecutó tras el cambio (`recall-after`): elige
wLex=0,2 por precisión en calibration, pero conserva recall validation=0,7500 y
rechaza cambiar defaults. Ese peso no se adopta ni se usa para ajustar la mejora.
`pnpm verify` no se ejecuta literalmente porque sus comandos cargo no garantizan
modo offline; se ejecutaron las comprobaciones locales equivalentes indicadas.
No se certifican Windows/macOS, rendimiento large-10k ni un tokenizer externo.
