# ADR-031 · Context Pack compacto (v2) y flujo corto

- **Estado**: Fases 1 y 1c implementadas y medidas (objetivo del 85 % pendiente; diccionario de fase 1b rechazado); fase 2 implementada y medida localmente; smoke-5 de anfitrión recibido y fase 2b implementada; fase 3 propuesta
- **Fecha**: 2026-10-04
- **Modifica**: FOKER-SPEC §9.7, §9.8, §9.9, §10.2–10.3 (`foker_context`, `foker_task_begin`) y la skill `foker-workflow`
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

- Todas las tools entregan lo que el modelo necesita en `structuredContent`, compacto;
  `content[0]` lleva la misma información en texto. Se conserva `outputSchema` y se valida
  antes de enviar. También los errores `isError` usan ambas vías: la variante de error del
  transporte evita que el cliente legacy rechace `structuredContent` al validarlo.
- `foker_context` publica `{pack_version, pack_hash, budget:{used,limit}, rendered,
  diagnostics}` por defecto; el `ContextPack` completo solo con `explain=true`.
  `content[0].text = rendered`. Se valida el pack completo antes de proyectar y la salida
  compacta después de redacción/truncado. Las variantes se definen exclusivamente en
  `mcp-tools.json`, como ADR-030; no cambian el contrato del motor ni los formatos persistidos.
- `foker_task_begin` admite `context: true` (defaults) u objeto con `budget_tokens?`,
  `anchors?`, `intent?`. Construye el pack con el `task_id` ya creado, alcance, perfil y skill
  de esa tarea, y devuelve `context:{pack_hash,budget:{used,limit},rendered}`.
  Si falla, devuelve `context_error:{code,message,recoverable}` junto al `task_id`: la tarea
  queda creada y se puede recuperar contexto sin crear otra. Las opciones `context` no se
  persisten ni cambian la identidad por `client_token`; un reintento puede variar presupuesto
  o anclas y conserva la misma tarea. Sin `context` se conserva la respuesta anterior.
- Skill y bloques generados: `foker_task_begin` con context → editar → `foker_task_submit`.
  Submit ejecuta checks y gates. `foker_check` es opcional para feedback intermedio;
  `foker_search`, si el pack no basta. El pack ya contiene el código objetivo: no se releen
  esos archivos salvo aviso de omisión. Se mantiene paridad entre los cuatro targets.
- Las ocho descripciones se acortan; el registro MCP las obtiene del mismo esquema.

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
Al cierre de la fase 1, las fases 2 y 3 permanecían propuestas. Esa fase no cambió
la entrega MCP, outputSchema, structuredContent, task_begin, task_submit ni la skill.
La implementación posterior de fase 2 se documenta al final.

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

## Resultados fase 2

Implementada sin red, pnpm, escrituras Git ni recompilar el addon nativo. No se modifica
el motor Rust ni ctx-gold. Se conserva el pack v2 de fase 1: estas medidas aíslan la entrega
MCP y las instrucciones, sin atribuirle otra reducción del motor. El smoke de anfitrión
requerido para la aceptación por suscripción sigue pendiente; no se certifican tokens reales.

### Medición de bytes

Bytes UTF-8: `Buffer.byteLength(JSON.stringify(respuesta))` para la respuesta MCP completa
(`isError`, `content`, `structuredContent`, sin sobre JSON-RPC); texto literal para descripciones,
skill y bloques. Se midieron instrucciones antes de editar. Para el pack típico se reconstruye
la proyección anterior (metadatos en structured, rendered solo en content) sobre **el mismo
pack** que entrega el servidor actual: misma fase 1, petición, hash y código; sin secreto ni
truncado. El script reproduce esa comparación y los tamaños actuales:

```sh
node packages/mcp/scripts/measure-phase2.mjs
```

Caso a-01 de Fixture A, semilla 42, tarea «El escaparate permite comprar artículos agotados.»,
sin anclas, dirty_files=false, presupuesto 8000, defaults de configuración y reglas
`# Reglas\nEdita solo el alcance autorizado.\n`. budget.used=2285, estimador bytes-lf/3.2@1.
Hash: `blake3:0674b604474073ef123daeed9affb615c90759f1afc66cafd9de83af08b267db`.
Es una medida del transporte con esa configuración, no una repetición de ctx-gold.

| Elemento | Antes (bytes) | Después (bytes) |
|---|---:|---:|
| foker_context, respuesta completa típica a-01 | 17877 | 15353 |
| foker_context, structuredContent a-01 | 10289 | 7683 |
| foker_context, respuesta completa fixture monorepo pequeño | 6796 | 7083 |
| Ocho descripciones, suma de sus textos | 1327 | 885 |
| Skill foker-workflow, archivo completo | 1256 | 1005 |
| Bloque común agentsBlock, sin delimitadores de sync | 765 | 688 |
| Bloque claudeBlock, sin delimitadores de sync | 199 | 104 |

La respuesta típica baja 14,12 %; structured baja 25,33 % y ahora incluye el código.
El fixture pequeño (`fixtures/monorepo-pnpm`, ancla button.tsx, «Modificar el botón»,
presupuesto 8000, mismas reglas) **crece** 287 bytes: sus metadatos anteriores eran menores
que el código que ahora debe entregarse también en structured. No se promete ahorro para
todos los packs. Las descripciones bajan 33,31 %; la skill, 19,98 %.

| Descripción de tool | Antes | Después |
|---|---:|---:|
| foker_check | 212 | 117 |
| foker_context | 238 | 151 |
| foker_impact | 130 | 90 |
| foker_search | 100 | 80 |
| foker_status | 121 | 67 |
| foker_task_begin | 203 | 162 |
| foker_task_get | 94 | 63 |
| foker_task_submit | 229 | 155 |

Bloques generados en un proyecto vacío, incluyendo frontmatter, notas y delimitadores;
roles incluidos, sin skills en esta tabla. AGENTS.md tiene los mismos bytes en cada target.
El rol Implementer incluido se proyecta dentro de integrations; todos los adaptadores
reciben el mismo cuerpo actualizado y el reviewer conserva su procedimiento de lectura.

| Archivo generado / target | Antes | Después |
|---|---:|---:|
| AGENTS.md, los cuatro targets | 808 | 731 |
| CLAUDE.md, Claude Code | 254 | 159 |
| .agents/rules/foker.md, Antigravity | 838 | 761 |
| .claude/agents/foker-implementer.md, Claude Code | 1484 | 1141 |
| .codex/agents/foker-implementer.toml, Codex | 1181 | 834 |
| .agents/rules/foker-implementer.md, Antigravity | 1237 | 894 |
| .opencode/agents/foker-implementer.md, OpenCode | 1266 | 923 |

**Llamadas MCP obligatorias del flujo: antes 4, después 2** (−50 %).
Antes: begin → context → editar → check → submit. Después: begin con context → editar → submit.
Son pasos normativos; fallos, recuperación o exploración adicional pueden requerir más llamadas.

### Verificación

- MCP en memoria con clientes 2026-07-28 y legacy 2025-11-25: código en structured/texto,
  explain completo, pack validado antes de proyectar, context=true y opciones, scope/skill/task_id,
  idempotencia con opciones variables, fallo real FKR-CTX-001 y recuperación sin duplicados,
  rechazo de entradas inválidas, redacción/truncado con rendered idéntico y diagnóstico.
- Paridad: prueba existente de CLI (catálogo, reglas, skills y roles) y nueva prueba en
  integrations que exige el flujo corto y la instrucción de no releer para los cuatro targets.
- `./node_modules/.bin/vitest run packages`: resultado registrado tras la comprobación final
  abajo. Se usa un wrapper temporal que permite lecturas Git y bloquea toda escritura; no
  se omiten ni se cambian fixtures para simular verde.
- `./node_modules/.bin/tsc -p tsconfig.json`: verde.
- `./node_modules/.bin/biome check packages skills docs`: verde.
- `node packages/schemas/scripts/generate.mjs --check`: verde; incluye gen-config-docs.

Los fallos de subprocess EPERM se comprueban además invocando directamente los scripts.
Logs de esta ejecución: `/tmp/foker-phase2-vitest-final.log`,
`/tmp/foker-phase2-targeted.log` y `/tmp/foker-phase2-measurements.log`.
Las conexiones stdio fallidas no se presentan como compatibilidad certificada; las mismas
revisiones de protocolo sí pasan con transporte en memoria.

## Fase 1c

Revisión de fase 1b: **diccionario de sustituciones rechazado**. Se eliminan
su implementación, los interruptores de rutas y prefijos de firmas, el atributo
de bloque, sus tests y ejemplos. Se conserva únicamente la compactación de
hermanos con patrón, reglas sin comentarios HTML, cabeceras/request compactas,
envoltorio L2 compartido y firma inline.

La evidencia aportada por el revisor con o200k como proxy muestra que a-01
con el diccionario medía 874 tokens estimados y 854 reales del proxy, frente
a 2413 estimados y 1859 reales sin ese códec. El ahorro del estimador
bytes/3,2 no se traslada en la misma proporción a tokens reales. Además,
las sustituciones obligan al modelo a interpretar macros al leer y editar
código, con riesgo de copiar una referencia como `$c` al código fuente.
Esa pérdida de calidad incumple el objetivo del ADR. La conclusión de fase
1b de «meta alcanzada» queda retirada; no se acepta ahorrar bytes a costa
de legibilidad y calidad de edición.

Medido en Linux x64, sin red, pnpm ni operaciones git de escritura. Dataset
SHA-256 `482dbc0a2783eb159df86f4f63a9b46c38e6b349cb9267e2fbeda2f3b7b5ec09`,
60 casos, splits persistidos 30/30, presupuesto 8000 y estimador
bytes-lf/3.2@1, iguales a fase 1. Las capturas históricas v1 y fase 1 se
comparan por id con las 60 filas nuevas. Las cifras de la tabla son tokens
estimados del texto rendered completo; no son tokens del anfitrión ni del proxy.

### Comparación por split

| Split | Versión | Recall | Mediana rendered | Media rendered |
|---|---|---:|---:|---:|
| total (60) | v1 | 0,744444 | 5552 | 4984,05 |
| total (60) | fase 1 | 0,744444 | 1049 | 1333,82 |
| total (60) | 1c | 0,744444 | 903 | 889,00 |
| calibration (30) | v1 | 0,738889 | 4099,5 | 4726,97 |
| calibration (30) | fase 1 | 0,738889 | 1049 | 1267,13 |
| calibration (30) | 1c | 0,738889 | 890 | 871,03 |
| validation (30) | v1 | 0,750000 | 7497,5 | 5241,13 |
| validation (30) | fase 1 | 0,750000 | 1063,5 | 1400,50 |
| validation (30) | 1c | 0,750000 | 910 | 906,97 |

**Casos con cambio de recall: ninguno (0/60)**, frente a v1 y a fase 1,
tanto en calibration como en validation. También permanecen idénticos por
caso exposed, gold_modified y occupants completos (id, nivel y coste
individual) frente a fase 1. No se compensa una pérdida con una mejora ni
se cambian archivos a L0 para aparentar ahorro.

**La mediana rendered 903 supera 830: el objetivo ≥85 % no se alcanza.**
Reducción frente a v1: 83,74 % (5552 → 903); frente a fase 1: 13,92 %
(1049 → 903). No se introducen otros trucos de bytes ni se retocan los
parámetros de selección. El TARGET independiente recall ≥0,80 sigue pendiente.
Budget.used total: mediana 904 y media 890,15; su diferencia respecto de
rendered_tokens es 0–3 por caso, por redondeo de secciones.

### Transformaciones y garantías

`compact` actúa después de select, sin calibrar de nuevo ni aprovechar el
ahorro para añadir o subir archivos. La capacidad, reserva obligatoria y
las decisiones de degradación siguen usando los costes de fase 1. Se
recalculan hashes y costes de secciones y pack. files[].tokens conserva
el coste individual previo a compactar.

1. Hermanos L0/L1 consecutivos con idéntica plantilla byte a byte se combinan
   en rangos inclusivos/listas. Los números se ordenan numéricamente dentro
   del grupo: el orden bytewise 0,1,10…19,2,20,21,3…9 pasa a `record-{0..21}.ts`.
   Solo se reordena ese grupo consecutivo; no se atraviesan entradas de otras
   plantillas ni se altera files[]. `{N}` sustituye el mismo token numérico
   en ruta y firmas; otros números, huecos, duplicados y Unicode se mantienen.
   La expansión conserva **el mismo multiconjunto de líneas y el mismo orden
   fuera del grupo**. Los ceros iniciales permanecen literales. Las propiedades
   incluyen separadores entre grupos para comprobar que no se cruzan.
2. Comentarios HTML completos y blancos redundantes de rules se omiten solo
   en su render. Input y archivo no cambian. Código fenced, inline (también
   multilínea), indentado y comentarios incompletos se preservan. La suite
   no incluye rules: ahorro cero en ctx-gold, probado separadamente en Rust.
3. Cabeceras sin blancos redundantes y `## request [intención]`, seguido de
   la tarea completa. Las cabeceras vacías ya se omitían en fase 1.
4. L2 consecutivos comparten envoltorio con rutas completas y cuerpos
   indentados dos espacios. Se preservan cuerpos íntegros, blancos y orden;
   L3 permanece literal.
5. Una sola firma L1 admite `ruta: firma`; múltiples firmas siguen indentadas.
   Las declaraciones, tipos y rutas se muestran completos.

La expansión deshace inline y rangos, en ese orden. `{N}` literal, llaves
presentes en rutas o rutas L1 con `: ` conservan la representación original
para evitar ambigüedades. No se reservan símbolos para alias. El texto final
no crece y todo dato sigue dentro de trust="repository-content", conservando
escapes y nota fija. Los tests de confianza cubren el render final; los tres
snapshots actualizados conservan sus files[].

El ejemplo de ablación sigue siendo útil para las cinco transformaciones
conservadas y se simplifica a 32 combinaciones. Nueva máscara: hermanos=1,
reglas=2, cabeceras/request=4, L2=8, inline=16. No contiene interruptores de
diccionario. La máscara 31 reproduce exactamente texto, budget.used y
rendered_tokens del addon en **60/60** filas, sin reconstruir selección.
Las máscaras de fase 1b dejan de aplicarse.

### Volcado y reproducción

ctx-gold mantiene rendered, rendered_bytes, categorías de bytes y
bytes_at_median global/por split; se retira la categoría del diccionario.
`FOKER_CTX_GOLD_DUMP=<dir>` crea el directorio y escribe el rendered exacto
de cada caso en `<dir>/<id>.txt`, sin añadir nueva línea ni separadores.
Los ids se validan como nombres de archivo seguros. El test comprueba la
creación del directorio, el contenido exacto por caso y el rechazo de rutas
que escaparían del directorio. Los 60 volcados medidos coinciden byte a byte
con rows[].rendered del informe. Permiten tokenizar externamente sin extraer
texto del JSON ni alterar su formato.

```sh
./node_modules/.bin/tsc -p benchmarks/tsconfig.build.json
cargo build --offline --release -p foker-napi
cp target/release/libfoker_napi.so /tmp/foker-adr031-1c.node
(cd benchmarks && NAPI_RS_NATIVE_LIBRARY_PATH=/tmp/foker-adr031-1c.node FOKER_CTX_GOLD_DUMP=/tmp/foker-adr031-1c-dump node run.mjs ctx-gold ../benchmarks/ctx-gold/cases.jsonl 8000 /tmp/foker-adr031-1c)
cargo run --offline -p foker-context --example compact_ablation -- /tmp/foker-adr031-1b-before.json /tmp/foker-adr031-1c-ablation.json
```

Informes nuevos: `/tmp/foker-adr031-1c.{json,md}`; volcados:
`/tmp/foker-adr031-1c-dump/*.txt`; ablación:
`/tmp/foker-adr031-1c-ablation.json`. Comparaciones contra
`/tmp/foker-adr031-v1.json` y `/tmp/foker-adr031-1b-before.json` (fase 1).
No se sustituyen informes históricos persistidos. El addon recompilado se
carga desde /tmp; no se modifica el artefacto de packages/core ni sus fuentes.

### Verificación local de fase 1c

- `cargo fmt --all --check`: verde.
- `cargo clippy --workspace --all-targets --offline -- -D warnings`: verde.
- `cargo nextest run --workspace --offline`: **132 pasan, 2 omitidos** por diseño.
- `./node_modules/.bin/vitest run benchmarks crates packages/engine packages/cli`:
  **260 pasan, 35 fallan** (22 archivos pasan, 6 fallan). Los 35 requieren
  `git init` o `git apply` en fixtures y se bloquean con un wrapper temporal
  en PATH para respetar la prohibición de escrituras; también se bloquea
  pnpm de subprocess. No se omiten tests ni se permiten esas operaciones.
  Los cuatro tests ctx-gold pasan. `GIT_OPTIONAL_LOCKS=0` evita escrituras
  opcionales en lecturas git. Un preload temporal carga exclusivamente el
  addon de Foker desde /tmp, sin sustituir otros bindings ni packages/core.
- `./node_modules/.bin/biome check crates benchmarks docs`: verde (97 archivos).
- `./node_modules/.bin/tsc -p tsconfig.json` y build TS de benchmarks: verdes.

Logs: `/tmp/foker-adr031-1c-{fmt,clippy,nextest,vitest,biome,typecheck}.log`;
build TS: `/tmp/foker-adr031-1c-build-ts.log`. Wrapper de restricciones:
`/tmp/foker-adr031-bin/{git,pnpm}`; preload:
`/tmp/foker-adr031-1c-preload.cjs`. Comando Vitest utilizado:

```sh
PATH=/tmp/foker-adr031-bin:$PATH GIT_OPTIONAL_LOCKS=0 NODE_OPTIONS=--require=/tmp/foker-adr031-1c-preload.cjs ./node_modules/.bin/vitest run benchmarks crates packages/engine packages/cli
```

No se modifican N-API ni contratos JSON, ni fuentes de MCP, integrations,
skills o schemas. La gramática de rendered v2 revisada queda registrada
solo en este ADR y FOKER-SPEC §9.9. La evidencia nueva corresponde a esta
suite y al estimador; la medición o200k citada es la aportada por el revisor.


## Resultados smoke-5 y fase 2b

### Evidencia del anfitrión

En `bench-smoke-5` con Claude Code real, a-01 y a-15 obligaron al modelo a
adivinar `scope.paths` **antes de ver el pack**. Propuso `src/**`, inexistente
en el monorepo cuyos fuentes están en `packages/*/src`. Foker creó la tarea
igualmente. El modelo abrió otra con el alcance correcto y envió la tarea
huérfana a submit (`REJECTED`), porque el Stop hook bloquea con tareas
`RUNNING`. El coste observado fue **tres llamadas extra por tarea: nueve
frente a las seis del camino ideal**. Esta evidencia se recibe del smoke;
no es una nueva ejecución del benchmark en esta sesión.

### Decisión e implementación

- Antes de crear una tarea MCP, cada patrón explícito debe coincidir con un
  archivo del mapa o con un directorio existente, incluido el padre de un
  archivo nuevo. La comprobación de directorios se ancla al root: el glob
  de basename `src` no puede validar `src/**` a través de `packages/*/src`.
  No se recorren symlinks ni `.git`, `.foker` o `node_modules`.
- Un alcance inexistente devuelve `FKR-INP-001` recuperable, con hasta cinco
  sugerencias: directorios de archivos ordenados por puntuación descendente
  y ruta ascendente en empate, seguidos de raíces de paquetes ordenadas.
  Se deduplican y excluyen alcances protegidos. Si el pack para sugerir no
  se puede construir, se conservan las raíces disponibles. No se captura
  baseline ni se escribe tarea, eventos o ancla de integridad. La auditoría
  MCP sigue registrando el rechazo; no es el ledger de tareas.
- `scope` es opcional únicamente con `context`. El pack preliminar se
  construye con descripción, skill, anclas, intención, presupuesto y demás
  defaults existentes, **sin task_id ni taskScope**. Se toman todos sus
  archivos L3; si no hay L3, los tres primeros L2 por puntuación descendente
  y ruta ascendente. Cada archivo aporta su directorio + `/**` (en raíz,
  `**`); se deduplican y ordenan por ruta. No se amplía desde L1/L0. Sin
  candidatos, o si falla el pack preliminar, se devuelve el error recuperable
  anterior antes de crear la tarea. `assertUnprotectedScope` rechaza cualquier
  intersección con `protected_paths`, incluso rutas omitidas del mapa.
- El alcance se persiste en el `scope` existente de TaskRecord y se devuelve
  mediante `allowed_paths`; las llamadas sin scope incluyen `scope_derived:
  true`. No cambia ningún formato persistido ni la API nativa. Solo cambia
  el contrato MCP, definido en `mcp-tools.json` y sus tipos regenerados.
- Tras crear la tarea se construye el pack definitivo con su task_id,
  alcance y checks del perfil. Así se evita la dependencia circular: la
  selección preliminar fija el alcance y el pack definitivo incorpora la
  identidad y restricciones reales. Ambos siguen siendo deterministas
  para sus entradas; no se promete igualdad de hashes entre ellos. Si
  falla el definitivo, se conserva task_id y context_error como en fase 2.
- La resolución/validación al crear se ejecuta bajo el lock de begin,
  **después de comprobar client_token y antes de baseline/ledger**. El
  reintento sin scope usa el alcance registrado y nunca vuelve a derivarlo,
  aunque varíen anclas/presupuesto/intención o cambie el mapa. El reintento
  con alcance explícito mantiene la comparación existente; cambiar otros
  campos de identidad sigue rechazándose. La política protegida se aplica
  también al alcance reutilizado. Los reintentos no añaden eventos begin.
- La skill y el bloque común de los cuatro targets/roles indican omitir
  scope y pasar context con anchors si se desconoce el directorio exacto;
  los alcances inventados se rechazan sin crear tarea. Los snapshots y
  las pruebas de paridad reflejan esas instrucciones.

### Verificación local de fase 2b

Se ejecuta sin red, pnpm, operaciones Git de escritura, cambios en crates
ni recompilar el addon. Un wrapper temporal en `/tmp/foker-phase2b-bin`
permite solo lecturas Git y bloquea pnpm de subprocess; se usa
`GIT_OPTIONAL_LOCKS=0`. Las pruebas nuevas cubren monorepo, errores con
sugerencias y sin ledger, archivos nuevos en directorios vacíos, orden y
selección L3/L2, rutas protegidas fuera del mapa, recuperación con el mismo
token, reintentos concurrentes sin eventos nuevos y paridad de los targets.

- `./node_modules/.bin/vitest run packages`: **467 pasan, 31 fallan**;
  30 archivos pasan y siete fallan. Los 27 fallos por Git de escritura
  bloqueado son: 23 E2E de CLI, dos tests de contexto del engine, uno de
  baseline del TaskStore y uno de doctor CLI. Se informan separados de
  los otros cuatro: dos tests de schemas con `spawnSync node EPERM` y
  dos E2E MCP stdio con conexión cerrada. Los scripts generadores invocados
  directamente sí pasan; ambos protocolos MCP pasan en memoria. No se
  certifica stdio en este sandbox ni se simula una suite completa verde.
- `./node_modules/.bin/tsc -p tsconfig.json`: verde.
- `./node_modules/.bin/biome check packages skills docs`: verde (135 archivos).
- `node packages/schemas/scripts/generate.mjs --check`: verde; incluye
  la comprobación de gen-config-docs.

Log completo: `/tmp/foker-phase2b-vitest-final.log`. Las comprobaciones
usan los ejecutables locales y el addon existente. No se modifica ningún
artefacto de benchmark ni se atribuye una nueva reducción de tokens:
la medida de aceptación posterior de fase 2b en el anfitrión queda pendiente.

## Resultados smoke-6 (tras fase 2b)

bench-smoke-6: Claude Code 2.1.289, claude-sonnet-5-5 por suscripción, 3 tareas × 2 brazos,
1 repetición. Tokens de entrada = input + cache_creation + cache_read medidos por el anfitrión.

| Tarea | Control | Foker smoke-4 | Foker smoke-6 | Foker/control | Llamadas Foker (control) | Éxito F/C |
|---|---:|---:|---:|---:|---:|---|
| a-01 | 67.624 | 219.243 | 123.551 | 1,83x | 6 (4) | sí/sí |
| a-15 | 64.210 | 151.404 | 77.468 | 1,21x | 4 (4) | sí/sí |
| a-09 | 140.787 | 222.294 | 169.395 | 1,20x | 7 (≈6) | no/no |

- Sobrecoste de Foker sobre el control en tareas con éxito: a-01 151,7k → 55,9k (−63 %),
  a-15 87,2k → 13,3k (−85 %). Total Foker frente a smoke-4: −44 %, −49 % y −24 %.
- Sin tareas huérfanas ni alcances inventados. El camino observado es ToolSearch → begin con
  context → editar → submit.
- a-09 sigue fallando en ambos brazos (no adaptan el consumidor `ui/referenceSearch`). El pack
  no incluyó `skuMatches.ts` y el modelo exploró con Bash y Read: problema de recall pendiente.
- n = 1 repetición y 3 tareas pequeñas: indicativo, no demuestra no inferioridad ni H1.
