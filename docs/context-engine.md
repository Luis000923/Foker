# Context Engine Rust

`foker_context::build_context(&MapState, root, &ContextRequest, &ContextInputs)`
implementa FOKER-SPEC §9 y ADR-006/007. TypeScript suministra reglas, skill,
alcance y archivos modificados; Rust no ejecuta git ni checks.

## Pipeline

- `normalize`: NFC y espacios de la tarea, candidatos léxicos y stopwords es/en
  versionadas (150 entradas por idioma). La consulta BM25 añade equivalencias es/en
  de `lexicon-es-en-v1.tsv` y stemming nominal ligero limitado al diccionario. Las anclas reutilizan `foker_map::path`.
- `intent`: tabla versionada y desempate fijo.
- `bm25`: documentos de rutas y símbolos exportados, top 20 normalizado; corte
  relativo opcional para experimentos.
- `seeds` y `rank`: pesos normativos, required_context débil (0,5), PPR y razones.
  El grafo y el procedimiento numérico se comparten con el PageRank global de
  `foker-map`. El mapa construido ya aplica include y filtros de secretos.
- `select`: reserva anclas, aplica el corte ADR-028 (1 % del máximo total) y
  suficiencia ADR-031 (2,5 % del mejor no-ancla, máximos por intención), degrada
  niveles, deduplica core y contabiliza el render completo.
- `render`: delimitación de datos, tipos completos mediante rangos del mapa y
  lectura segura del disco, sin volver a parsear ni inventar declaraciones.
- `pack`: Context Pack v2 y JSON canónico snake_case; el esquema admite históricos v1.
- `cache`: LRU opcional de 64 entradas y métricas fuera del pack determinista.

## Decisiones de implementación

El coste incluye cabeceras, etiquetas y notas. `budget.used` suma los techos por
sección y puede superar ligeramente la estimación del texto concatenado; siempre
queda dentro del límite. Se reserva el 5 % para selección opcional, pero el
contenido obligatorio puede utilizarlo antes de fallar.

Todas las anclas resueltas reservan primero L1. Se intenta L3/L2 en orden de
ranking usando el espacio restante. Las anclas degradadas permanecen en
`targets`; si ni L1 cabe se devuelve `FKR-CTX-001` con desglose. `core` es opcional
y puede omitirse si el contexto obligatorio consume su espacio.

Los nombres de símbolo ambiguos usan `FKR-CTX-102` con un mensaje de ambigüedad y
reparten el peso entre declaraciones. No se incorpora un código nuevo al contrato.
Las razones se ordenan y deduplican. Un candidato alcanzado sin razón directa usa
`CORE` como razón del prior genérico. Un archivo que también es candidato del contorno
core aparece solo a su nivel más alto, sin repetir el texto en otra sección.
El prior genérico puede conservar la razón `CORE` del ranking, aunque no forme
parte del contorno core final. El texto core se marca con estabilidad `task`: su
lista candidata sigue usando el PageRank global, pero la deduplicación depende
de related/targets.

L0/L1/L2 usan un índice por construcción de exports del módulo y exports
resueltos, excluyendo miembros de namespaces. L0 deduplica nombres de
sobrecargas; L1/L2 conservan las firmas. L2 recupera interfaces, aliases y enums
exportados completos, también cuando se reexportan desde otro archivo. Si no
caben, la selección degrada a L1 sin recortar el texto. Las firmas L1 reutilizan las firmas acotadas del mapa. El texto
L3 conserva Unicode y normaliza únicamente CRLF a LF. Los delimitadores
`foker:file` literales dentro del contenido se escapan para impedir el cierre
prematuro de la región de datos. Las cabeceras escapan controles como secuencias
visibles y los caracteres `<`/`>` como entidades.

La caché pertenece al propietario del motor: no hay caché global ni estado
compartido implícito. Su clave incluye versión, hashes del mapa/configuración,
petición normalizada y todos los inputs efectivos. Duración, hit, tokens por
sección, archivos por nivel, utilización y semillas por fuente se devuelven como
`BuildMetrics`, sin timestamps en el JSON del pack.

## Verificación

Hay snapshots completos de tres tareas sobre `fixtures/monorepo-pnpm`, tests por
módulo, propiedades de presupuesto (1000–20000) y 50 ejecuciones idénticas,
incluidos 25 hilos. Los casos adicionales cubren reglas enormes, ambigüedad,
secciones static, tipos largos, degradación de anclas y exclusiones duras.

```sh
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo nextest run --workspace
```

Los snapshots son portables; ejecutar en Linux no certifica por sí solo los otros
dos sistemas operativos exigidos por REQ-CTX-001.

REQ-CTX-004 tiene un benchmark ignorado con el generador compartido large-10k,
mapa caliente y 20 construcciones sin caché del pack (p95 informativo, TARGET
< 300 ms):

```sh
cargo test --release -p foker-context --test perf_large -- --ignored --nocapture
```

## Calibración y mejora de recuperación FKR-037

Todos los parámetros viven en `foker-context::ContextParams`. Los pesos de §9
se conservan. [ADR-028](adr/ADR-028-expansion-lexica-context-engine.md) acepta la
expansión léxica bilingüe y el corte del ranking al 1 % del máximo: amplían el
algoritmo MVP de §9.3/9.7. Se expanden solo términos BM25; no se fabrican anclas
ni se cambia la intención. El diccionario v1 agrupa vocabulario general y se
versiona con el código. El stemming elimina tildes, plural y un sufijo nominal
para comparar entradas; no transforma documentos ni añade raíces arbitrarias.

La API nativa admite `ContextRequest.params` opcional **interno**, sin nuevos
campos de CLI/MCP. Campos omitidos usan defaults de Rust:

| Parámetro TS / Rust | Default | Efecto |
|---|---:|---|
| `lexicalExpansion` / `lexical_expansion` | true | Expansión es↔en v1 |
| `bm25MinRelative` / `bm25_min_relative` | 0 | Cero conserva top 20; positivo sustituye top-k por score BM25 ≥ umbral relativo |
| `relevanceFraction` / `relevance_fraction` | 0,01 | No-anclas con PPR < máximo × fracción quedan fuera de L1/L2 y contornos L0 |

Las fracciones aceptan valores finitos en [0,1]; cero desactiva el corte.
Las anclas siguen siendo obligatorias. La lista candidata core permanece basada en
PageRank global; en v2 su texto deduplicado depende de la tarea (estabilidad `task`). Los descartes
usan `RANK_CUTOFF`, ya existente. Los demás parámetros incluyen pesos de ancla,
menciones, dirty, alcance y skill; r(intent), factor tests; top BM25 y k1/b;
niveles L2/L0; umbral de ancla, margen y reserva core. Valores inválidos producen
FKR-INP-001. Un `coreFiles` explícito de la API prevalece sobre `params.coreFiles`.

Solo params efectivos distintos de defaults aparecen en la petición JSON
normalizada y participan canónicamente en hash y caché. Los tres campos nuevos
se omiten dentro de params cuando coinciden con sus defaults; los overrides
anteriores conservan la forma JSON anterior. El esquema de ContextPack reconoce los campos ADR-028 y ADR-031; sus tipos
se regeneran con `node packages/schemas/scripts/generate.mjs`. Sigue pendiente
contrastar `spec/api/foker-core.d.ts`, no reconstruido en esta tarea.

### Resultados con 60 casos y split persistido

Se midió antes/después con presupuesto 8.000. La selección usa exclusivamente
los 30 casos `calibration`, sin reasignar splits; los 30 `validation` se evalúan
para baseline y configuración elegida. Dataset SHA-256:
`482dbc0a2783eb159df86f4f63a9b46c38e6b349cb9267e2fbeda2f3b7b5ec09`.
La rejilla de ADR-028 tiene 32 combinaciones de expansión y cortes. Se maximiza
recall sujeto a media de tokens ≤ baseline; desempate por precisión. Gana
expansión=true, corte BM25=0 y corte ranking=0,01. No se ajusta tras validación.

| Split | Configuración | Recall | Precisión | Media tokens del pack | Mediana tokens |
|---|---|---:|---:|---:|---:|
| calibration (30) | Antes | 0,6222 | 0,021787 | 6.655,33 | 7.541,5 |
| calibration (30) | Después | 0,7389 | 0,052084 | 4.728,37 | 4.101 |
| validation (30) | Antes | 0,6000 | 0,022893 | 6.650,13 | 7.546,5 |
| validation (30) | Después | 0,7500 | 0,049178 | 5.242,50 | 7.498,5 |

La cifra honesta es **0,7500 en validation**: el TARGET ≥ 0,80 sigue pendiente.
El pack medio en validación disminuye un 21,17 %. La expansión aislada mejora
calibración hasta 0,7389 pero aumenta ligeramente tokens; el corte de selección
conserva recall y reduce tamaño. El corte BM25 no gana, por eso continúa top 20.
La precisión cuenta archivos distintos a nivel ≥ L1; L0 queda fuera. Los archivos
nuevos aún ausentes siguen contando como misses. Las tareas similares dentro de
una fixture limitan la evidencia de generalización. Tokens corresponden al
estimador `bytes-lf/3.2@1`, no a un tokenizer externo.

```sh
./node_modules/.bin/tsc -p benchmarks/tsconfig.build.json
cargo build --offline --release -p foker-napi
# Linux x64 glibc: artefacto equivalente al build:native de package.json.
cp target/release/libfoker_napi.so packages/core/foker-core.linux-x64-gnu.node
node benchmarks/run.mjs ctx-gold benchmarks/ctx-gold/cases.jsonl 8000 /tmp/foker-ctx-after
```

ADR-028 incluye la rejilla completa y cómo reproducirla con `evaluateContext`,
filtrando calibration. Los informes de la tarea se guardan en `/tmp` para respetar
el ámbito; no se modifican benchmarks. La rejilla histórica de 144 pesos de
`node benchmarks/run.mjs calibrate` se ejecutó sobre el baseline y no lo mejoró;
no se usó para ajustar los nuevos cortes. [ADR-024](adr/ADR-024-calibracion-context-engine.md)
conserva el resultado histórico negativo de 30 casos; ADR-028 registra la mejora
actual con 60 casos. Los snapshots botón/carrito se actualizan por el nuevo
algoritmo, y el de tarea sin señal queda idéntico. Los tests nuevos cubren
expansión, cortes, anclas, hash/caché y 50 ejecuciones idénticas en 25 hilos.

## Pack compacto v2 · ADR-031 fase 1

[ADR-031](adr/ADR-031-pack-compacto-y-flujo-corto.md#resultados-fase-1) conserva
la rejilla y las mediciones por split. No se cambian recuperación léxica, pesos,
intenciones ni el dataset; tampoco entrega MCP ni cuerpos focales.

Cada archivo se renderiza una vez. L3/L2 usan `<foker:file id="…" level="L2|L3"
trust="repository-content">`; L1/L0 comparten `<foker:files level="L1|L0"
trust="repository-content">` por sección. Las rutas y firmas quedan dentro de la
región de datos; los delimitadores literales de ambas etiquetas se escapan.
Las cabeceras con score/razones aparecen solo con explain=true, y la nota fija
REQ-CTX-002 aparece una vez. Los tres snapshots cambian por versión, formato,
selección, hashes y coste; sus datos de origen permanecen iguales.

Parámetros Rust internos, sin ampliar CLI/MCP ni N-API:

| Parámetro | Default | Efecto |
|---|---|---|
| `sufficiency_fraction` | 0,025 | Corte inclusivo contra el mejor no-ancla; se aplica además del corte ADR-028 |
| `related_limits` | [64, 64, 96, 64, 64, 96] | Máximo de archivos L2/L1 por fix, test, refactor, add, modify, explain |
| `outline_limits` | [0, 0, 0, 0, 0, 0] | Máximo L0 related por intención; además acotado por l0_count |
| `core_min_relative` | 0,1 | Corte contra el máximo PageRank global; también excluye mínimos empatados |

`context.core_files` explícito sigue determinando el tope del núcleo. Los
candidatos se toman del ranking global significativo hasta ese tope y después
se omiten los duplicados: el tope no exige rellenar huecos con archivos de cola.

El presupuesto se calcula con secciones ya agrupadas, incluidos envoltorios,
notas y request. En L1/L0 `files[].tokens` mide la entrada; el coste de su
etiqueta compartida pertenece a `sections[].tokens`. ctx-gold añade
`rendered_tokens`, `median_rendered_tokens`, `mean_rendered_tokens` y
`mean_tokens`, globales y por split, y falla si budget.used subestima rendered.
En los 60 casos v2 budget.used supera rendered_tokens entre 1 y 3 tokens por
redondeos por sección. No se reduce el denominador a las firmas.

Resultado: recall idéntico en cada caso (total 0,7444, calibration 0,7389,
validation 0,7500); mediana rendered 5552 → 1049 (−81,11 %), media 4984,05 →
1333,82. El objetivo de ≤830 no se alcanza; la configuración más pequeña de
la rejilla sin regresiones calibration mide 1049 de mediana. No se retocan
parámetros después de observar validation ni se afirma un límite universal.

Reproducir calibration, sin evaluar validation ni operar git:

```sh
node --input-type=module -e 'import {generate} from "./benchmarks/fixtures/fixture-a/generate.mjs"; generate("/tmp/foker-adr031-fixture-a")'
cargo run --offline -p foker-context --example calibrate_compact -- /tmp/foker-adr031-fixture-a /tmp/foker-adr031-v1.json /tmp/foker-adr031-calibration.json
```

El ejemplo requiere la línea base v1 con filas individuales (la suministrada
por el usuario también sirve). Filtra `calibration` antes de construir packs,
compara recall por caso y minimiza mediana rendered, después media rendered,
después maximiza recall. Los empates mantienen la primera configuración.
La medición Rust elegida y ctx-gold vía N-API coinciden en las 30 filas de
calibration, tanto en recall como en tokens y rendered_tokens.
