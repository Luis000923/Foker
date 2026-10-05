# ADR-031 · Context Pack compacto (v2) y flujo corto

- **Estado**: Fase 1 implementada y medida (objetivo del 85 % no alcanzado); fases 2 y 3 propuestas
- **Fecha**: 2026-10-04
- **Modifica**: FOKER-SPEC §9.7, §9.8, §9.9, §10.3 (`foker_context`) y la skill `foker-workflow`
- **Amplía**: ADR-028 y ADR-030

## Contexto

El usuario fija un objetivo de ahorro de tokens del 85–90 % sin perder calidad.
Dos investigaciones con Codex (estado del arte con búsqueda web y análisis del código)
y las trazas de `bench-smoke-4` dan estos hechos:

1. **El modelo no recibió el código del pack.** Claude Code 2.1.289 entrega al modelo
   `structuredContent` cuando existe. `foker_context` enviaba ahí los metadatos del pack
   (`files`, `excluded`, `sections`, hashes): unos 11,7k caracteres sin código. El texto
   `rendered` de `content[0]` no llegó. El modelo volvió a leer los archivos con `Read`.
   No hubo truncado: la respuesta medía unos 36 KB, por debajo del límite de 80 KB.
2. **El pack gasta el presupuesto en ruido.** En a-01 (fix de una línea) el pack v1 tiene
   107 bloques `<foker:file>` y 5.233 tokens estimados. `related` y `core` ocupan el 91 %;
   los objetivos, el 3,8 %. Cada archivo paga una cabecera `###` con puntuación y razones
   más el envoltorio: unos 35 tokens fijos, aunque su contenido sea una sola firma. `core`
   repite archivos ya presentes en `related` y añade archivos con PageRank empatado y mínimo.
3. **El presupuesto se trata como capacidad que llenar**, no como suficiencia (§9.7 paso 4–5).
4. **El flujo añade turnos.** Cada turno relee el prefijo en caché. Foker hizo 9–15 llamadas
   frente a 4 del control. `foker_task_submit` ya ejecuta los checks y los gates, así que
   `foker_check` previo es redundante como paso obligatorio.

Línea base v1 en ctx-gold (60 casos, presupuesto 8.000): recall 0,744 (validation 0,750),
mediana 5.553 tokens, media 4.985.

### Qué ahorro es alcanzable

Con un suelo del anfitrión de unos 12k tokens por llamada, un 85 % frente al control total
(64–67k en tareas pequeñas) exige terminar por debajo de una sola llamada. **No es
alcanzable extremo a extremo en tareas pequeñas** y este ADR no lo promete. El objetivo se
declara sobre dos denominadores medibles:

- **Contexto de código entregado** (pack): reducción ≥ 85 % de la mediana de tokens del pack
  v1 en ctx-gold, con recall ≥ v1 y sin regresiones por caso en validation.
- **Sobrecoste de Foker frente al control** en el benchmark pareado: reducción de llamadas
  y de tokens de entrada medidos por el anfitrión. Se informa sin objetivo numérico hasta
  tener Fixture B (repositorios reales), donde la exploración ingenua cuesta más.

## Decisión

### Fase 1 · Pack v2 compacto (motor Rust)

- `pack_version` = 2. Cada archivo aparece **una sola vez**, en su nivel más alto.
- Renderizado sin cabeceras `###` ni puntuación ni razones; esos datos quedan en `files[]`
  y en `explain`. L3 y L2 conservan un envoltorio por archivo. L1 y L0 se agrupan en un
  único bloque por sección con una línea de ruta y sus firmas. Todo contenido del
  repositorio sigue delimitado y marcado `trust="repository-content"` (REQ-CTX-002) y la
  nota fija aparece una vez.
- `core` solo incluye archivos con puntuación significativa y no repetidos en otra sección.
- Selección por suficiencia: los no-ancla entran solo si su puntuación supera un corte
  relativo a la del mejor no-ancla y hasta un máximo por intención. Los parámetros se
  calibran solo con el split `calibration` y se validan con `validation` (como ADR-028).
- ctx-gold informa también tokens del texto `rendered` realmente entregado.

### Fase 2 · Entrega MCP y flujo corto

- `foker_context` devuelve el texto `rendered` en `content` y no publica `outputSchema`
  ni `structuredContent`: así todos los anfitriones entregan el código al modelo. La salida
  se sigue validando internamente contra `ContextPack` antes de responder.
- `foker_task_begin` acepta pedir el pack en la misma llamada (begin + context = 1 turno).
- La skill y los bloques generados dejan `foker_check` como opcional: `foker_task_submit`
  ejecuta checks y gates.

### Fase 3 · Cuerpo focal por símbolo

- Las anclas grandes muestran el cuerpo completo de los símbolos focales y el esqueleto
  del resto, con aviso explícito de omisión. Requiere ampliar ctx-gold con cobertura focal.

## Consecuencias

- Cambia el formato de `rendered` y `pack_version`; el esquema `ContextPack` acepta v2.
- Las fases se aceptan por separado: cada una exige ctx-gold sin regresión de recall y,
  para las fases 2 y 3, un smoke del benchmark con tokens reales del anfitrión.
- Si la fase 1 no logra −85 % de mediana sin perder recall, se documenta el límite medido
  y no se fuerzan parámetros sobreajustados.

## Resultados fase 1

Implementada y medida en Linux x64, sin red ni operaciones git de escritura.
Las fases 2 y 3 permanecen propuestas. No cambia la entrega MCP, outputSchema,
structuredContent, task_begin, task_submit ni la skill de flujo.

Dataset SHA-256:
`482dbc0a2783eb159df86f4f63a9b46c38e6b349cb9267e2fbeda2f3b7b5ec09`.
60 casos, split persistido 30/30, presupuesto 8000, estimador bytes-lf/3.2@1.
Se reprodujo la línea base suministrada antes de recompilar el addon para v2:
recall y tokens coinciden. Se añadió entonces medición del texto rendered
completo, que la línea base original no contenía.

| Split | Pack | Recall | Mediana tokens | Media tokens | Mediana rendered_tokens | Media rendered_tokens |
|---|---|---:|---:|---:|---:|---:|
| total | v1 | 0.744444 | 5553 | 4985.43 | 5552 | 4984.05 |
| total | v2 | 0.744444 | 1050.5 | 1335.38 | 1049 | 1333.82 |
| calibration | v1 | 0.738889 | 4101 | 4728.37 | 4099.5 | 4726.97 |
| calibration | v2 | 0.738889 | 1050.5 | 1268.70 | 1049 | 1267.13 |
| validation | v1 | 0.750000 | 7498.5 | 5242.50 | 7497.5 | 5241.13 |
| validation | v2 | 0.750000 | 1065 | 1402.07 | 1063.5 | 1400.50 |

**Casos con cambio de recall: ninguno (0/60)**. Recall total 0,744444,
calibration 0,738889 y validation 0,750000. Comparación individual de todas
las filas contra v1; no se compensa una pérdida con una mejora en otro caso.

La mediana rendered disminuye **81,11 %** (5552 → 1049); la mediana budget.used,
81,08 % (5553 → 1050,5). La media rendered disminuye 73,24 %.
**No se alcanza el objetivo ≥85 % / ≤830**. Dentro de la rejilla registrada,
1049 es la menor mediana calibration sin regresiones individuales. Las
32 configuraciones con mediana rendered ≤830 tienen regresiones calibration.
No se amplía la rejilla ni se retocan parámetros después de ver validation;
estos datos muestran el límite de esta búsqueda, no una imposibilidad general.
La fase 3 no se implementa para forzar este objetivo.

### Configuración fijada antes de validation

Se conserva la recuperación ADR-028: lexical_expansion=true, bm25_top=20,
bm25_min_relative=0, relevance_fraction=0,01 contra el máximo **total**.
Se añade un corte inclusivo de suficiencia 0,025 contra el mejor **no-ancla**.
`related_limits = [64,64,96,64,64,96]`, en orden fix, test, refactor, add,
modify, explain; `outline_limits = [0,0,0,0,0,0]`. Las anclas no consumen
esos máximos. core_min_relative=0,1 respecto del máximo global y exclusión
de scores mínimos empatados. context.core_files explícito conserva su tope;
la lista candidata se filtra antes de tomar ese tope y deduplicar.

La rejilla se declaró antes de medir: corte {0; 0,01; 0,025; 0,05; 0,1; 0,2}
× máximo base L2/L1 {8;16;32;64;128;512}
× máximo base L0 {0;5} = 72 configuraciones. Refactor/explain multiplican
el máximo base L2/L1 por 1,5 y el L0 por 2; las demás intenciones usan el base.
Core (0,1), pesos, anclas y presupuesto se mantienen fijos.

Criterio: solo candidatos sin regresión de recall en ningún caso calibration;
minimizar mediana rendered, luego media rendered y, si ambas empatan,
maximizar recall. Empate completo: primera configuración de la rejilla.
La configuración elegida se evaluó después en los 30 validation, sin ajustar
por caso ni cambiar el dataset. La evaluación Rust y ctx-gold vía N-API
coinciden exactamente en recall, tokens y rendered_tokens de las 30 filas
calibration de la configuración elegida.

### Rejilla medida (solo calibration)

Las dos columnas de máximo son bases; se aplican los multiplicadores por
intención descritos arriba. Tokens incluyen el texto completo (request,
nota, envoltorios, rutas, firmas y separadores), sin tokenizer externo.

| Corte suficiencia | Máximo base L2/L1 | Máximo base L0 | Recall calibration | Mediana tokens | Media tokens | Mediana rendered | Media rendered | Casos con regresión |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 | 8 | 0 | 0.472222 | 689.5 | 723.67 | 687.5 | 721.83 | 10 |
| 0 | 8 | 5 | 0.472222 | 739 | 756.73 | 738 | 755.10 | 10 |
| 0 | 16 | 0 | 0.705556 | 925 | 926.20 | 924 | 924.80 | 2 |
| 0 | 16 | 5 | 0.705556 | 1000 | 983.30 | 998.5 | 981.77 | 2 |
| 0 | 32 | 0 | 0.722222 | 1213.5 | 1160.17 | 1212 | 1158.70 | 1 |
| 0 | 32 | 5 | 0.722222 | 1290 | 1208.57 | 1289 | 1207.10 | 1 |
| 0 | 64 | 0 | 0.738889 | 1648.5 | 1567.93 | 1646.5 | 1566.40 | 0 |
| 0 | 64 | 5 | 0.738889 | 1648.5 | 1610.43 | 1646.5 | 1608.83 | 0 |
| 0 | 128 | 0 | 0.738889 | 1648.5 | 2304.73 | 1646.5 | 2303.23 | 0 |
| 0 | 128 | 5 | 0.738889 | 1648.5 | 2338.20 | 1646.5 | 2336.70 | 0 |
| 0 | 512 | 0 | 0.738889 | 1648.5 | 2802.23 | 1646.5 | 2800.70 | 0 |
| 0 | 512 | 5 | 0.738889 | 1648.5 | 2802.23 | 1646.5 | 2800.70 | 0 |
| 0.01 | 8 | 0 | 0.472222 | 689.5 | 723.67 | 687.5 | 721.83 | 10 |
| 0.01 | 8 | 5 | 0.472222 | 739 | 756.73 | 738 | 755.10 | 10 |
| 0.01 | 16 | 0 | 0.705556 | 925 | 926.20 | 924 | 924.80 | 2 |
| 0.01 | 16 | 5 | 0.705556 | 1000 | 983.30 | 998.5 | 981.77 | 2 |
| 0.01 | 32 | 0 | 0.722222 | 1213.5 | 1160.17 | 1212 | 1158.70 | 1 |
| 0.01 | 32 | 5 | 0.722222 | 1290 | 1208.57 | 1289 | 1207.10 | 1 |
| 0.01 | 64 | 0 | 0.738889 | 1648.5 | 1567.93 | 1646.5 | 1566.40 | 0 |
| 0.01 | 64 | 5 | 0.738889 | 1648.5 | 1610.43 | 1646.5 | 1608.83 | 0 |
| 0.01 | 128 | 0 | 0.738889 | 1648.5 | 2304.73 | 1646.5 | 2303.23 | 0 |
| 0.01 | 128 | 5 | 0.738889 | 1648.5 | 2338.20 | 1646.5 | 2336.70 | 0 |
| 0.01 | 512 | 0 | 0.738889 | 1648.5 | 2802.23 | 1646.5 | 2800.70 | 0 |
| 0.01 | 512 | 5 | 0.738889 | 1648.5 | 2802.23 | 1646.5 | 2800.70 | 0 |
| 0.025 | 8 | 0 | 0.472222 | 689.5 | 723.67 | 687.5 | 721.83 | 10 |
| 0.025 | 8 | 5 | 0.472222 | 739 | 755.20 | 738 | 753.50 | 10 |
| 0.025 | 16 | 0 | 0.705556 | 920.5 | 915.37 | 918.5 | 913.90 | 2 |
| 0.025 | 16 | 5 | 0.705556 | 983.5 | 957.30 | 981 | 955.70 | 2 |
| 0.025 | 32 | 0 | 0.722222 | 1050.5 | 1065.03 | 1049 | 1063.43 | 1 |
| 0.025 | 32 | 5 | 0.722222 | 1050.5 | 1091.97 | 1049 | 1090.40 | 1 |
| 0.025 **elegida** | 64 | 0 | 0.738889 | 1050.5 | 1268.70 | 1049 | 1267.13 | 0 |
| 0.025 | 64 | 5 | 0.738889 | 1050.5 | 1283.57 | 1049 | 1282.03 | 0 |
| 0.025 | 128 | 0 | 0.738889 | 1050.5 | 1565.80 | 1049 | 1564.27 | 0 |
| 0.025 | 128 | 5 | 0.738889 | 1050.5 | 1579.97 | 1049 | 1578.40 | 0 |
| 0.025 | 512 | 0 | 0.738889 | 1050.5 | 1671.47 | 1049 | 1669.90 | 0 |
| 0.025 | 512 | 5 | 0.738889 | 1050.5 | 1671.47 | 1049 | 1669.90 | 0 |
| 0.05 | 8 | 0 | 0.472222 | 688.5 | 718.13 | 687 | 716.33 | 10 |
| 0.05 | 8 | 5 | 0.472222 | 739 | 748.17 | 738 | 746.43 | 10 |
| 0.05 | 16 | 0 | 0.705556 | 907.5 | 892.53 | 907 | 891.00 | 2 |
| 0.05 | 16 | 5 | 0.705556 | 968.5 | 925.20 | 966.5 | 923.60 | 2 |
| 0.05 | 32 | 0 | 0.722222 | 981 | 1011.20 | 979 | 1009.60 | 1 |
| 0.05 | 32 | 5 | 0.722222 | 981 | 1032.00 | 979 | 1030.43 | 1 |
| 0.05 | 64 | 0 | 0.722222 | 981 | 1161.97 | 979 | 1160.33 | 1 |
| 0.05 | 64 | 5 | 0.722222 | 981 | 1176.83 | 979 | 1175.23 | 1 |
| 0.05 | 128 | 0 | 0.722222 | 981 | 1459.07 | 979 | 1457.47 | 1 |
| 0.05 | 128 | 5 | 0.722222 | 981 | 1473.23 | 979 | 1471.60 | 1 |
| 0.05 | 512 | 0 | 0.722222 | 981 | 1535.57 | 979 | 1533.93 | 1 |
| 0.05 | 512 | 5 | 0.722222 | 981 | 1535.57 | 979 | 1533.93 | 1 |
| 0.1 | 8 | 0 | 0.472222 | 662 | 653.80 | 660.5 | 651.93 | 10 |
| 0.1 | 8 | 5 | 0.472222 | 690 | 668.37 | 689 | 666.53 | 10 |
| 0.1 | 16 | 0 | 0.705556 | 733.5 | 745.80 | 731.5 | 744.10 | 2 |
| 0.1 | 16 | 5 | 0.705556 | 733.5 | 750.07 | 731.5 | 748.37 | 2 |
| 0.1 | 32 | 0 | 0.705556 | 733.5 | 754.27 | 731.5 | 752.53 | 2 |
| 0.1 | 32 | 5 | 0.705556 | 733.5 | 754.27 | 731.5 | 752.53 | 2 |
| 0.1 | 64 | 0 | 0.705556 | 733.5 | 754.27 | 731.5 | 752.53 | 2 |
| 0.1 | 64 | 5 | 0.705556 | 733.5 | 754.27 | 731.5 | 752.53 | 2 |
| 0.1 | 128 | 0 | 0.705556 | 733.5 | 754.27 | 731.5 | 752.53 | 2 |
| 0.1 | 128 | 5 | 0.705556 | 733.5 | 754.27 | 731.5 | 752.53 | 2 |
| 0.1 | 512 | 0 | 0.705556 | 733.5 | 754.27 | 731.5 | 752.53 | 2 |
| 0.1 | 512 | 5 | 0.705556 | 733.5 | 754.27 | 731.5 | 752.53 | 2 |
| 0.2 | 8 | 0 | 0.422222 | 619.5 | 577.10 | 618.5 | 575.07 | 13 |
| 0.2 | 8 | 5 | 0.422222 | 618 | 584.87 | 617 | 582.87 | 13 |
| 0.2 | 16 | 0 | 0.505556 | 647 | 627.87 | 646 | 625.93 | 10 |
| 0.2 | 16 | 5 | 0.505556 | 647 | 631.00 | 646 | 629.07 | 10 |
| 0.2 | 32 | 0 | 0.505556 | 647 | 635.37 | 646 | 633.43 | 10 |
| 0.2 | 32 | 5 | 0.505556 | 647 | 635.37 | 646 | 633.43 | 10 |
| 0.2 | 64 | 0 | 0.505556 | 647 | 635.37 | 646 | 633.43 | 10 |
| 0.2 | 64 | 5 | 0.505556 | 647 | 635.37 | 646 | 633.43 | 10 |
| 0.2 | 128 | 0 | 0.505556 | 647 | 635.37 | 646 | 633.43 | 10 |
| 0.2 | 128 | 5 | 0.505556 | 647 | 635.37 | 646 | 633.43 | 10 |
| 0.2 | 512 | 0 | 0.505556 | 647 | 635.37 | 646 | 633.43 | 10 |
| 0.2 | 512 | 5 | 0.505556 | 647 | 635.37 | 646 | 633.43 | 10 |

### Contratos, confianza y determinismo

El motor emite pack_version=2. El esquema admite 1 y 2, manteniendo su $id y
referencias existentes para validar ejemplos v1, informes históricos y packs
ya exportados; no hay justificación para invalidarlos. Sus tipos se regeneran
con el script vía node. Los cuatro parámetros Rust nuevos son opcionales en
la petición normalizada, se omiten cuando son defaults y participan en hash y
caché cuando son overrides. No se amplía N-API, CLI ni MCP para calibrarlos.

Cada archivo aparece una vez en su nivel más alto. Core se construye después
de targets/related y omite sus ids. Su lista candidata usa PageRank global;
el texto resultante depende de la deduplicación con la tarea y por eso cambia
su estabilidad a `task` (sin prometer byte-estabilidad entre tareas). Rules y
skill permanecen estáticos. Las secciones siguen en el mismo orden del pack.

L3/L2 usan un envoltorio por archivo; L1/L0 uno por nivel y sección. Rutas,
firmas y cabeceras explain quedan delimitadas y marcadas, y se escapan
controles y etiquetas foker literales. La nota de confianza aparece una vez.
Los tests cubren inyección en nombres reales, ambas etiquetas en contenido,
los cuatro niveles, corte inclusivo contra no-anclas, límites por intención,
core mínimo empatado, core_files=0 explícito, anclas, presupuesto, hash y caché.
Los tres snapshots cambian por v2, compactación, deduplicación y sus costes y
hashes derivados. Se mantiene el test de 50 packs idénticos, 25 en hilos, y
las propiedades de presupuesto.

`budget.used` suma ceil por sección y siempre es ≥ rendered_tokens. La
diferencia v2 medida es de **1–3 tokens** por caso; v1, 1–3. No existe texto
entregado fuera de la contabilidad. `files[].tokens` mide la entrada
individual; los envoltorios L0/L1 compartidos se cuentan en la sección.

### Reproducción sin red

Desde la raíz (ver también docs/context-engine.md):

```sh
node --input-type=module -e 'import {generate} from "./benchmarks/fixtures/fixture-a/generate.mjs"; generate("/tmp/foker-adr031-fixture-a")'
cargo run --offline -p foker-context --example calibrate_compact -- /tmp/foker-adr031-fixture-a /tmp/foker-adr031-v1.json /tmp/foker-adr031-calibration.json
./node_modules/.bin/tsc -p benchmarks/tsconfig.build.json
cargo build --offline --release -p foker-napi
cp target/release/libfoker_napi.so packages/core/foker-core.linux-x64-gnu.node
cd benchmarks
node run.mjs ctx-gold ../benchmarks/ctx-gold/cases.jsonl 8000 /tmp/foker-adr031-v2
```

El ejemplo Rust admite la línea base original suministrada en lugar de
/tmp/foker-adr031-v1.json; solo usa sus filas calibration. Informes de esta
sesión en /tmp/foker-adr031-{v1,v2}.{json,md}, rejilla en
/tmp/foker-adr031-calibration.json. Ningún artefacto de benchmark persistido
se sustituye.

### Verificación local

- cargo fmt --all --check: verde.
- cargo clippy --workspace --all-targets --offline -- -D warnings: verde.
- cargo nextest run --workspace --offline: 125 pasan, 2 omitidos por diseño.
- ./node_modules/.bin/tsc -p tsconfig.json: verde; build TS de benchmarks también.
- ./node_modules/.bin/vitest run: 504 pasan y 41 fallan. Se ejecuta con un
  wrapper git temporal que permite lecturas y bloquea escrituras para respetar
  la prohibición explícita. 35 fallos requieren git de escritura en fixtures;
  dos tests de schemas fallan con spawnSync node EPERM; dos E2E MCP cierran la
  conexión. Los otros dos son expectativas antiguas fuera del ámbito autorizado:
  packages/core/src/index.test.ts:31 espera contextSchema=1 (v2 devuelve 2), y
  packages/cli/src/main.test.ts:193 exige core no vacío aunque todos sus archivos
  ya estén incluidos en related/targets. No se alteran esos archivos ni se
  simula verde ocultando fallos.
- ./node_modules/.bin/biome check .: falla por dos archivos ajenos al ámbito:
  benchmarks/src/evaluate-task.ts (separación de imports) y
  benchmarks/subscription.test.ts (formato). Comprobación de archivos TS/JSON
  modificados: verde.
- node packages/schemas/scripts/generate.mjs --check,
  node packages/schemas/scripts/gen-config-docs.mjs --check y
  node scripts/check-deps.mjs: verdes, ejecutados directamente; confirma los
  artefactos pese al EPERM de los dos tests con subprocess.

No se ejecuta pnpm ni se escribe git. El addon Linux copiado es un artefacto
ignorado necesario para medir; no se cambian fuentes de packages/core ni CLI.
No se certifican otros sistemas operativos ni tokens reales de anfitriones.
