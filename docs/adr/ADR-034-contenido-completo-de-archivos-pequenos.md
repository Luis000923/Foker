# ADR-034 · Contenido completo de archivos pequeños en L2

- **Estado**: Aceptada. Criterio y umbral fijados **antes** de implementar y de medir (commit
  `4377075`, previo al código). La implementación cambió un detalle, no el umbral: L2 completo
  sin `files[].note`.
- **Fecha**: 2026-10-04
- **Issue**: FKR-096
- **Modifica**: FOKER-SPEC §9.7 (contenido de L2 en archivos pequeños) y el esquema `ContextPack`
  (un parámetro interno opcional)

## Contexto (OBSERVACIÓN)

En `bench-smoke-7`, a-09 (Foker), el pack incluía `packages/catalog/src/skuMatches.ts` en L2,
con su firma y su JSDoc. El modelo escribió «el pack solo trae la firma de `skuMatches`, no su
cuerpo» y lo abrió con `Read`: un archivo de 4 líneas cuyo contenido completo cuesta pocos tokens
más que su firma.

Según FKR-092, cada llamada adicional al modelo relee el prefijo acumulado. En smoke-6/7 la
entrada inicial es B ≈ 17.000 tokens en el brazo Foker, casi toda en caché. Con los precios
archivados del manifiesto (`anthropic-2026-09-25`: entrada 2, lectura de caché 0,2 USD/M),
un turno extra cuesta como mínimo ≈ 0,1 × 17.000 ≈ **1.700 tokens equivalentes de entrada**,
más la salida, la latencia y el propio resultado del `Read`.

## Decisión: criterio y umbral (fijados a priori)

Un archivo **no ancla** que la selección ya iba a entregar en **L2** (los primeros
`l2_count` = 5 aceptados) se entrega con su **contenido completo**, en lugar de firmas, si:

> Δ = tokens(contenido completo) − tokens(L2) ≤ `small_full_max_extra` = **64 tokens**

y además cabe en la capacidad, igual que cualquier otra elección de nivel. Si no cabe, se intenta
L2 y luego L1, como hasta ahora.

**Justificación del 64** (sin datos de Fixture A): entregar el contenido compensa si
Δ ≤ P(Read | firma) × C_turno. Con C_turno ≈ 1.700 tokens equivalentes (arriba) y una
probabilidad mínima conservadora P = 4 % de que el agente abra un archivo L2 de los cinco
primeros, el límite es 1.700 × 0,04 = 68. Se redondea a la potencia de dos inferior, **64**
(≈ 200 bytes, unas 6–8 líneas de diferencia sobre la firma). El Δ se relee en cada turno
posterior, pero desde caché (0,1×): con 5 archivos y 6 turnos, el peor caso es
5 × 64 × (1,25 + 6 × 0,1) ≈ 590 tokens equivalentes. Un solo `Read` evitado (≈ 1.700) lo
compensa.

Reglas complementarias, también fijadas ahora:

- Solo L2 de no anclas. Las anclas ya tienen su política (L3, focal de ADR-033 y degradación).
  L1 no se toca: son archivos de menor rango.
- El nivel sigue siendo **L2**: no se convierten en objetivos para `deriveScopePaths` (que usa
  L3) ni cambian las métricas que cuentan L1–L3. **Implementación**: sin `files[].note`; una
  nota tras `</foker:file>` rompería la agrupación L2 compartida de ADR-031 1c. El contenido
  completo se distingue por su cuerpo; ctx-gold lo detecta con `goldFull`.
- Mismo escape y delimitación que cualquier contenido (`trust="repository-content"`).
- Parámetro interno `small_full_max_extra` (64; 0 lo desactiva), omitido del JSON cuando vale el
  default; propiedad opcional en el esquema `ContextPack`. Sin cambios en N-API, CLI ni MCP.

## Límites declarados antes de smoke-8 (revisión metodológica)

- **Anfitrión**: Claude Code exige un `Read` previo antes de `Edit`/`Write` sobre un archivo
  existente. Un `Read` del archivo que luego se modifica **no es evitable** por ningún contenido
  del pack; el de `skuMatches.ts` en smoke-7, que motivó este ADR, era de ese tipo. Solo son
  evitables los `Read` de archivos que no se editan después (en smoke-7: `baseline.test.ts`).
- **Métrica causal de smoke-8**: `Read` sobre archivos cuyo contenido completo ya estaba en el pack,
  separando «seguido de edición del mismo archivo» (obligatorio) de «sin edición posterior»
  (evitable). `gold_full` mide `gold_modified` y, por el punto anterior, **no** cuenta `Read`
  evitables: es un indicador de contenido entregado, no de llamadas ahorradas.
- **Aritmética del umbral**: el revisor señala que Δ se paga al escribir en caché (1,25) y en
  cada turno posterior (0,1×), lo que con los mismos supuestos da Δ ≤ 68/1,85 ≈ 37. A cambio,
  C_turno está subestimado (el prefijo crece ~1.000 tokens por turno, la salida cuesta 5× y el
  resultado del `Read` se escribe en caché). El 4 % no tiene una fuente medida, y Δ usa el
  estimador `bytes-lf/3.2`, no el tokenizer de Claude. **El 64 es un límite de orden de
  magnitud (rango plausible 37–68), no un óptimo**. Se mantiene sin cambios para cumplir el
  compromiso de no reajustar tras ver resultados (ctx-gold ya se había medido).
- **Barrels (corrección de revisión)**: si L2 muestra símbolos declarados en otros archivos
  (reexportaciones resueltas), el contenido literal (`export … from`) perdería esos contratos.
  Codex y el revisor metodológico lo señalaron en los snapshots, así que **no se sustituye**: es
  una salvaguarda de corrección (nunca perder información que L2 ya entregaba). El umbral de 64
  no cambia.
- **Comparabilidad**: smoke-8 usa el manifiesto archivado de smoke-6/7
  (`blake3:3ea8e24f…`), Claude Code 2.1.289, `claude-sonnet-5-5`, el mismo orden y una imagen
  etiquetada `foker-bench:smoke8` construida desde el commit fusionado; se conserva
  `foker-bench:smoke7`. Una ablación intercalada (brazo Foker con la imagen de smoke-7) aislaría
  la deriva entre días, pero añade ejecuciones no autorizadas: queda como recomendación.

## Compromiso de medición

- **No se ajusta el umbral después de ver resultados** (ni con ctx-gold ni con smoke-8).
- ctx-gold (Fixture A + monorepo): recall del pack y del flujo sin regresiones por caso; nueva
  métrica aditiva `gold_full` = fracción de `gold_modified` entregados con contenido completo
  (L3 o L2 completo), como indicador de `Read` evitables. Tokens antes/después.
- foker-self (`focal_eval`): sin regresión del recall de símbolos.
- smoke-8: mismas tareas, brazos, manifiesto y condiciones que smoke-7. Se informan éxito,
  tokens, llamadas, `Read` sobre archivos ya presentes en el pack, exploración manual,
  tamaño del pack y Foker/control por tarea. Con n = 1 no se declara mejora por diferencias
  dentro del ±25 % observado entre smoke-6 y smoke-7.
- Después de smoke-8 no se siguen ajustando umbrales sobre Fixture A: la siguiente evidencia
  debe venir de Fixture B (PREGUNTA-6).

## Resultados ctx-gold y foker-self (OBSERVACIÓN, código final)

60 casos, presupuesto 8000, estimador bytes-lf/3.2@1; «antes» = mismo commit con
`small_full_max_extra = 0`.

| Métrica | Antes | Después |
|---|---:|---:|
| Recall pack (total / cal. / val.) | 0,7444 / 0,7389 / 0,7500 | igual (sin regresiones por caso) |
| Recall flujo begin | 0,7611 | 0,7611 (sin regresiones por caso) |
| `gold_full` pack (gold con contenido completo) | 0,1667 | **0,4361** |
| `gold_full` flujo begin | 0,1667 | **0,3944** |
| Mediana / media rendered pack | 903 / 889 | 1007 / 1006 (+11,5 %) |
| Mediana / media rendered flujo | 929,5 / 956 | 1054 / 1093 (+13,4 %) |

foker-self (`focal_eval`): recall de símbolos igual en ambos splits y umbrales (0,75 / 0,289 /
0,442), sin regresiones; tokens del pack ±0,2 %.

**INTERPRETACIÓN**: más gold llegan completos a cambio de un 11–13 % de tokens del pack. Por el
límite del anfitrión, eso no implica menos llamadas cuando el gold se edita; el efecto real se
mide en smoke-8 con los `Read` evitables.

## Resultados smoke-8 (OBSERVACIÓN)

`bench-smoke-8` repite smoke-7: mismo manifiesto archivado (`blake3:3ea8e24f…`), 3 tareas ×
2 brazos, 1 repetición, Claude Code 2.1.289, `claude-sonnet-5-5` por suscripción, mismo orden.
Imagen `foker-bench:smoke8` construida desde `main` 9bd5729; se conservan `smoke7` y `smoke6`.
Llamadas con `host-overhead` (FKR-092); `Read` clasificados comparando el cuerpo entregado
en el pack de begin con el archivo del baseline.

| Tarea | Brazo | Tokens smoke-7 → 8 | Llamadas 7 → 8 | Pack begin (tokens) 7 → 8 | Archivos completos en el pack | `Read` 7 → 8 (obligatorios / evitables sobre completos) | Éxito 7 → 8 |
|---|---|---:|---:|---:|---:|---|---|
| a-01 | control | 84.116 → 67.624 | 5 → 4 | — | — | 0 → 0 | sí → sí |
| a-01 | Foker | 120.147 → 99.603 | 6 → 5 | 990 → 1.107 | 1 → 6 | 1 → 1 (0 / 0) | sí → sí |
| a-15 | control | 64.210 → 64.210 | 4 → 4 | — | — | 1 → 1 | sí → sí |
| a-15 | Foker | 98.225 → 99.385 | 5 → 5 | 906 → 1.081 | 1 → 6 | 0 → 0 | sí → sí |
| a-09 | control | 142.251 → 85.126 | 8 → 5 | — | — | 0 → 0 | no → no |
| a-09 | Foker | 125.037 → 122.235 | 6 → 6 | 1.034 → 1.124 | 0 → 5 | 2 → 2 (**1** / 0) | no → no |

Foker/control: a-01 1,43x → 1,47x; a-15 1,53x → 1,55x; a-09 0,88x → 1,44x. Este último solo
refleja que el control de a-09 dejó de editar (4 Bash, ningún `Write`) y consumió menos.

- **`Read` evitados por ADR-034: 0.** En a-09, `skuMatches.ts` llegó completo en el pack, pero el
  modelo lo leyó para editarlo: es un `Read` obligatorio por el anfitrión, como se declaró antes
  del smoke. El único `Read` sin edición posterior (`baseline.test.ts`, en a-01 y a-09) viajaba
  en L1, fuera del alcance de ADR-034.
- Exploración manual del brazo Foker: 0 en ambos smokes.
- Pack de begin: +9 % a +19 % de tokens.
- Éxito: 2/3 por brazo en ambos smokes; sin regresiones por tarea.

**INTERPRETACIÓN**: con Fixture A y Claude Code, ADR-034 no reduce llamadas. Aumenta el pack un
~10 % sin pérdida de recall ni de éxito. Las variaciones de tokens totales (−17 % a +1 % en Foker)
quedan dentro del ruido observado (±25 %, n = 1). **No se declara mejora.** Por el compromiso
del ADR no se ajusta el umbral. Su utilidad depende de que haya archivos que se consulten sin
editarse, lo que es más probable en repositorios reales: queda pendiente de Fixture B.

## Revisiones independientes

| Hallazgo | Revisor | Clasificación | Acción |
|---|---|---|---|
| El `Read` de un archivo que se edita es obligatorio en el anfitrión; `gold_full` no mide `Read` evitables | Claude (metodología) | VALID | Límite declarado antes de smoke-8; métrica causal = `Read` sin edición posterior |
| Aritmética del umbral (Δ pagado en caché, C_turno subestimado, 4 % sin fuente) | Claude (metodología) | VALID | Documentado como orden de magnitud (37–68); 64 sin cambios por compromiso |
| Barrels pierden firmas resueltas | Codex + Claude | VALID | Salvaguarda `only_own_symbols`; snapshots recuperan las firmas; test |
| Una lectura fallida del completo aborta el pack | Codex | VALID | Se descarta la opción y sigue la degradación; test con archivo borrado |
| Lecturas y renders innecesarios | Codex | VALID | Cota inferior por tamaño del mapa antes de leer; L2 reutilizado |
| `goldFull` acepta coincidencias fuera del bloque del archivo y falla con explain | Codex | VALID | Cuerpos extraídos por id y nivel; tests |
| §9.7 no describe L2 completo | Claude | VALID | Tabla de niveles actualizada |
| Comparabilidad de smoke-8 (imagen etiquetada, ablación) | Claude | VALID (parcial) | Imágenes `smoke7`/`smoke8`; ablación pendiente de autorización |
| (2.ª ronda) La cota usaba el tamaño del mapa, que puede estar desactualizado | Codex | VALID | Tamaño actual en disco (`stat`), cota conservadora para CRLF; test |
| (2.ª ronda) `fileBodies` quitaba cualquier primera línea `### ` | Codex | VALID | Solo la cabecera diagnóstica exacta del id; test |
| (2.ª ronda) Una ruta que empieza por dos espacios es ambigua en el L2 agrupado | Codex | OUT OF SCOPE | Ambigüedad del formato agrupado de ADR-031 1c, no de `goldFull`; documentada |

Sin falsos positivos.
