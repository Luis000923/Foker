# FKR-092 · Overhead fijo del anfitrión por llamada

Medición offline del 2026-10-04 (hora local; trazas smoke-6 del 2026-10-05 UTC).
Claude Code 2.1.289, `claude-sonnet-5-5`, suscripción. No se modifica el anfitrión,
el motor, los contratos ni los artefactos existentes. Tres tareas pequeñas,
una repetición por brazo: no demuestra generalización ni causalidad.

## Metodología y reproducción

Fuentes de solo lectura bajo `/home/luis/Documentos/Foker/benchmarks/`:
`results/bench-smoke-{3,4,5,6}.jsonl` y
`generated/bench-smoke-{3,4,5,6}/{0..5}/evidence/{traces,usage,host}.json`.
Se usa `traces.json[0]`, la transcripción principal; las demás entradas del
contenedor no son llamadas adicionales. Se excluyen eventos `isSidechain=true`.
Identidad: `evaluation.json` en la raíz del run identifica la tarea; la fila
correspondiente de results identifica el brazo, contrastado con los archivos de
`work/` y las tools usadas. No se deduce el brazo por paridad del índice:
a-15 control está en 2 y Foker en 3. Los 24 runs tienen transcripción.

`benchmarks/src/analysis/host-overhead.ts` agrupa respuestas por `message.id`
en orden de aparición. Una respuesta puede tener varios bloques con el mismo
usage; se cuenta una sola vez y se exige igualdad de contadores. Usage incompleto,
negativo o contradictorio produce error, nunca ceros inventados. No se suman
`usage.iterations` otra vez. `host.num_turns` cuenta eventos del anfitrión y no
sirve como número de llamadas al modelo.

Para cada llamada t:

- `I_t = message.usage.input_tokens` (entrada nueva sin caché).
- `W_t = cache_creation_input_tokens`; `R_t = cache_read_input_tokens`.
- `O_t = output_tokens`; entrada efectiva `E_t = I_t + W_t + R_t`.
- Base del primer turno `B = E_1`; incremento `D_1 = 0`, `D_t = E_t − E_(t−1)`.
- Crecimiento acumulado `G_t = E_t − B`; media incremental
  `media(D_2..D_n) = (E_n − E_1)/(n−1)`; no disponible si n < 2.
- Total de entrada `T = Σ E_t = nB + Σ G_t`; salida `Σ O_t`.

**OBSERVACIÓN:** B incluye tarea, instrucciones y cualquier otro contexto inicial;
no es una captura del system prompt puro. **INTERPRETACIÓN:** se usa como proxy del
prefijo estable, no como prueba de que esos mismos tokens persisten sin cambios.
D incluye resultados de tools, respuestas anteriores y cambios de contexto interno
(esquemas diferidos, recordatorios, compactación). Puede ser negativo.

El script también informa bytes visibles desde la llamada anterior: `text` del
modelo y JSON de `tool_use.input`; resultados de tools como texto UTF-8 o JSON
completo del bloque si son estructurados; otros mensajes user como texto o JSON.
La tarea inicial queda en `other_user_bytes` del primer turno. Se excluyen firmas
de thinking y envoltorios internos no observables. Es un proxy reproducible de
contenido visible, **no** una partición exacta de D en tokens. La salida final
no entra en ninguna llamada posterior. No se convierte O directamente en D.

Estimador del repo `bytes-lf/3.2@1`: `ceil(bytes_UTF8(texto con CRLF→LF)/3.2)`.
Bytes de archivo son los originales; cada archivo se redondea por separado.
No hay `tiktoken` Python ni paquete o200k/tokenizer en las dependencias locales
consultadas: o200k **NO DISPONIBLE offline**; no se descarga ni se simula.
El estimador no es el tokenizer de Claude y no permite restas exactas con sus tokens.

```sh
./node_modules/.bin/tsc -p benchmarks/tsconfig.build.json --customConditions @foker/source
node benchmarks/run.mjs host-overhead /home/luis/Documentos/Foker/benchmarks/generated/bench-smoke-6/0/evidence/traces.json
```

Subcomando integrado en el despacho existente, sin dependencias nuevas; escribe
JSON en stdout. Para reproducir la tabla, repetir con smokes 3–6 e índices 0–5,
leer `calls`, `first_turn_input`, `mean_incremental_growth`, `total_input` y
`total_output`, y contrastar con usage y results. No escribe en el dataset.

## OBSERVACIÓN · Por ejecución

Entrada inicial y total en tokens del anfitrión; media incremental con un decimal.
Todos los totales de entrada y salida coinciden con `usage.json` y results.

| Smoke/run | Tarea | Brazo | Llamadas | Primer turno B | Media D | Total entrada T | Total salida |
|---|---|---|---:|---:|---:|---:|---:|
| 3/0 | a-01 | foker | 9 | 17000 | 4578.0 | 340780 | 1795 |
| 3/1 | a-01 | control | 4 | 15711 | 607.7 | 67638 | 488 |
| 3/2 | a-15 | control | 4 | 15725 | 240.0 | 64316 | 642 |
| 3/3 | a-15 | foker | 7 | 17014 | 6063.3 | 255714 | 1380 |
| 3/4 | a-09 | control | 7 | 15726 | 488.2 | 122429 | 1651 |
| 3/5 | a-09 | foker | 9 | 17015 | 5309.8 | 326794 | 2327 |
| 4/0 | a-01 | foker | 9 | 16992 | 1508.9 | 219243 | 1638 |
| 4/1 | a-01 | control | 4 | 15703 | 605.0 | 67586 | 478 |
| 4/2 | a-15 | control | 4 | 15717 | 226.0 | 64208 | 517 |
| 4/3 | a-15 | foker | 7 | 17006 | 1244.7 | 151404 | 1150 |
| 4/4 | a-09 | control | 7 | 15718 | 492.7 | 123057 | 1070 |
| 4/5 | a-09 | foker | 9 | 17007 | 1607.5 | 222294 | 1957 |
| 5/0 | a-01 | foker | 9 | 16933 | 1073.1 | 201263 | 2165 |
| 5/1 | a-01 | control | 4 | 15703 | 597.0 | 67536 | 498 |
| 5/2 | a-15 | control | 4 | 15717 | 237.0 | 64245 | 506 |
| 5/3 | a-15 | foker | 8 | 16947 | 1168.6 | 174399 | 2179 |
| 5/4 | a-09 | control | 9 | 15707 | 518.5 | 165255 | 1754 |
| 5/5 | a-09 | foker | 7 | 16948 | 955.5 | 141318 | 1780 |
| 6/0 | a-01 | foker | 6 | 17019 | 1104.8 | 123551 | 1158 |
| 6/1 | a-01 | control | 4 | 15703 | 611.7 | 67624 | 462 |
| 6/2 | a-15 | control | 4 | 15717 | 226.7 | 64210 | 464 |
| 6/3 | a-15 | foker | 4 | 17033 | 1455.0 | 77468 | 831 |
| 6/4 | a-09 | control | 8 | 15718 | 440.6 | 140787 | 1643 |
| 6/5 | a-09 | foker | 8 | 17034 | 922.0 | 169395 | 1735 |

En smoke-6 a-09 son **8 llamadas por brazo** tras deduplicar; el ADR-031 decía
7 y ≈6. Esta tabla precisa esa aproximación sin modificar el ADR histórico.
Los totales de smoke-3 tampoco se sustituyen por las aproximaciones anteriores.

## OBSERVACIÓN · Archivos generados y límites de atribución

Inventario de `work/` en smoke-6: estos archivos tienen los mismos tamaños en
los tres runs Foker (0, 3, 5); ninguno está presente en los controles (1, 2, 4).
Son tamaños del proyecto conservado al terminar, no captura del request inicial.
Leer un archivo desde una tool podría modificar qué contenido llega después.

| Archivo | Bytes medidos | Tokens estimados |
|---|---:|---:|
| CLAUDE.md | 159 | 50 |
| AGENTS.md | 938 | 294 |
| foker/rules.md | 277 | 87 |
| .claude/skills/foker-workflow/SKILL.md | 1303 | 408 |
| .claude/skills/next-route/SKILL.md | 1022 | 320 |
| .claude/skills/react-component/SKILL.md | 836 | 262 |
| .claude/skills/secure-form/SKILL.md | 932 | 292 |
| .claude/skills/ts-strict-change/SKILL.md | 849 | 266 |
| .claude/skills/write-tests/SKILL.md | 919 | 288 |
| .claude/agents/foker-implementer.md | 1348 | 422 |
| .claude/agents/foker-reviewer.md | 1021 | 320 |
| .claude/settings.json | 1247 | 390 |
| .mcp.json | 181 | 57 |

Total inventariado: **11.032 bytes**, no 11.032 bytes de prompt inicial.
CLAUDE importa `@AGENTS.md`: 1.097 bytes, ~344 tokens por suma de estimaciones.
Skills: 5.861 bytes; roles: 2.369. No se puede sumar todo al prefijo:
en 6/0 se observa `Skill(foker-workflow)` y la expansión posterior del cuerpo;
los roles no tienen subagentes ejecutados (`host.subagent_stats.spawned=0`).
El anfitrión puede anunciar descripciones sin incluir cuerpos completos.
`foker/rules.md` aparece dentro del pack de begin, después del primer turno.
Settings contiene configuración/hook y `.mcp.json` configuración de conexión,
no esquemas de tools. `foker/sync-manifest.json` (3.503 bytes) es inventario de
sincronización, sin evidencia de inclusión en el prompt; queda fuera de la suma.

Clasificación en dos ejes: capacidad de Foker para cambiar el componente y
pertenencia a los brazos. «Compartido» no significa igualdad byte a byte del request.

| Componente del prefijo/contexto | Evidencia y tamaño atribuible | Control | Pertenencia |
|---|---|---|---|
| System prompt interno del anfitrión | NO DISPONIBLE por separado; solo residual INFERIDO conjunto | NO CONTROLABLE | COMPARTIDO POR AMBOS BRAZOS |
| Esquemas de tools nativas | NO DISPONIBLE: nombres/argumentos visibles no son schemas | NO CONTROLABLE | COMPARTIDO POR AMBOS BRAZOS |
| Esquemas MCP Foker | NO DISPONIBLE en request histórico; ToolSearch devuelve referencias, no el schema completo | CONTROLABLE POR FOKER | ESPECÍFICO DE FOKER |
| CLAUDE.md / AGENTS.md | Archivos medidos arriba; inclusión exacta/tokenización no capturada | CONTROLABLE POR FOKER | ESPECÍFICO DE FOKER |
| Skills / roles generados | Archivos medidos; anuncios iniciales y cuerpos diferidos no desglosables | CONTROLABLE POR FOKER | ESPECÍFICO DE FOKER |
| Reglas y pack | Archivo medido; contenido de begin visible, crecimiento posterior | CONTROLABLE POR FOKER | ESPECÍFICO DE FOKER |
| Configuración MCP y hooks | Bytes medidos; no son texto íntegro del prefijo | CONTROLABLE POR FOKER | ESPECÍFICO DE FOKER |
| Tarea y metadatos de entorno, envoltorios, recordatorios | Tarea visible y pareada; resto NO DISPONIBLE por separado | NO CONTROLABLE en este análisis | COMPARTIDO POR AMBOS BRAZOS |

No se usa el catálogo MCP actual del repositorio como si fuera el schema realmente
serializado por Claude Code en el smoke: no existe captura de ese request.

## INTERPRETACIÓN · Qué significa el suelo y el diferencial

En smoke-6, B control = 15.703/15.717/15.718 y B Foker =
17.019/17.033/17.034 (a-01/a-15/a-09). Diferencial pareado
**ΔB = B_F − B_C = 1.316 tokens** en los tres pares (8,37 % aproximadamente).
En smoke-3/4 es 1.289; smoke-5, 1.230/1.230/1.241.

**INFERIDO:** el prefijo adicional inicial conjunto atribuible a activar Foker
es ~1.316 tokens en smoke-6 bajo esta comparación. No permite atribuir 1.316
al MCP o al system prompt por separado. Si se descuenta el proxy de 344 tokens
de CLAUDE+AGENTS, queda ~972 de residual adicional (schemas/anuncios/entorno/
envoltorios), también **INFERIDO**, mezclando estimador y tokenizer real.
No es una medición de ningún componente oculto.

**INFERIDO:** el residual común del control, tras descontar solo la tarea visible
con bytes/3.2, aproxima conjuntamente system prompt + tools nativas + metadatos
+ otros. No hay ecuaciones suficientes para separar esas incógnitas. El system
prompt individual sigue NO DISPONIBLE; restar brazos cancela componentes comunes,
no revela su contenido ni su tamaño individual.

**OBSERVACIÓN:** los tres Foker y control a-09 empiezan con `R_1=11.914`;
control a-01/a-15, con 15.701/15.715 ya cacheados. W inicial Foker es
5.103/5.117/5.118 y control a-09 3.802. I=2 en todas las llamadas smoke-6.
**INTERPRETACIÓN:** ~12k describe un bloque reutilizado de caché observado,
no el suelo de entrada efectiva total. B tampoco es puro overhead del anfitrión.

Usando B como base constante contable, en smoke-6 `nB/T` es Foker
82,65 %/87,95 %/80,45 % y control 92,89 %/97,91 %/89,32 %.
El crecimiento por encima de B paga el resto; esa partición algebraica no prueba
estabilidad física del prefijo. Reducir turnos reduce la relectura de la base.

## OBSERVACIÓN · Caché y coste equivalente

Precios persistidos del manifiesto `anthropic-2026-09-25`, USD por millón:
entrada 2; lectura 0,2; escritura 2,5; salida 10. No son precios consultados
actualmente ni importe facturado de la suscripción.
`C_manifest = (2ΣI + 2,5ΣW + 0,2ΣR + 10ΣO)/10^6`.
Contrafactual sin caché: `C_sin = (2T + 10ΣO)/10^6` (misma conversación).

| Run smoke-6 | I | W | R | R/T | C_manifest USD | C_reportado USD |
|---|---:|---:|---:|---:|---:|---:|
| 0 Foker a-01 | 12 | 10627 | 112912 | 91,39 % | 0,0607539 | 0,0766944 |
| 1 control a-01 | 8 | 1835 | 65781 | 97,27 % | 0,0223797 | 0,0251322 |
| 2 control a-15 | 8 | 680 | 63522 | 98,93 % | 0,0190604 | 0,0200804 |
| 3 Foker a-15 | 8 | 9482 | 67978 | 87,75 % | 0,0456266 | 0,0598496 |
| 4 control a-09 | 16 | 6886 | 133885 | 95,10 % | 0,0604540 | 0,0707830 |
| 5 Foker a-09 | 16 | 11572 | 157807 | 93,16 % | 0,0778734 | 0,0952314 |

Los contadores TTL registran **todas** las escrituras smoke-6 como `ephemeral_1h`,
ninguna como 5m. El coste reportado satisface exactamente en los seis runs
`C_reportado = C_manifest + 1,5ΣW/10^6`, equivalente a escritura a 4 USD/M
manteniendo los demás coeficientes. **INTERPRETACIÓN:** la diferencia concuerda
con un precio de escritura de una hora distinto del 2,5 del manifiesto;
no se atribuye a un gasto real de API ni se cambia el manifiesto en este issue.

| Brazo (smoke-6 agregado) | Entrada | Lectura | Escritura | R/T | C_manifest | Peso coste lectura | C_sin | C_reportado |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| control | 272621 | 263188 | 9401 | 96,54 % | 0,1018941 | 51,66 % | 0,570932 | 0,1159956 |
| Foker | 370414 | 338697 | 31681 | 91,44 % | 0,1842539 | 36,76 % | 0,778068 | 0,2317754 |

**INTERPRETACIÓN:** con el manifiesto, caché reduce el contrafactual equivalente
82,15 % en control y 76,32 % en Foker. Las escrituras pesan 23,07 %/42,99 %
del coste, respectivamente. Con coste reportado, lectura pesa 45,38 %/29,23 %
y escritura 32,42 %/54,68 %. Cachear abarata la relectura, no elimina tokens
ni vuelve gratuitas las llamadas. Los controles a-01/a-15 comienzan ya calientes:
no se debe interpretar el menor W agregado como ventaja causal del brazo.

## HIPÓTESIS · Acciones posibles, sin cambios en este issue

- El bloque común ~11.914 cacheado podría contener principalmente prompt interno
  y tools nativas. No hay evidencia para desglosarlo ni demostrar esa composición.
- Compactar instrucciones/anuncios o schemas de Foker podría reducir parte de ΔB,
  pero ToolSearch difiere expansión y puede desplazar coste a turnos posteriores.
- Menos exploración y llamadas podría ahorrar más que compactar el prefijo adicional;
  el recall insuficiente de a-09 sigue siendo un factor. Requiere repetición pareada
  con estado de caché controlado y repositorios mayores para contrastarlo.

## Verificación

Pruebas sintéticas: deduplicación, separación I/W/R/O, UTF-8 y CRLF,
resultados de tools, mensajes del modelo, contracción de contexto, sidechains,
usage contradictorio/incompleto y transcripciones vacías o de una llamada.
Resultados finales: `./node_modules/.bin/biome check benchmarks docs` y
`./node_modules/.bin/tsc -p tsconfig.json`, verdes. Vitest: 7 archivos,
40 tests pasan (incluidos los dos nuevos).

La primera ejecución de `./node_modules/.bin/vitest run benchmarks` dio
30 pasan / 10 fallan por addon nativo ausente en este worktree. Se compilaron
los paquetes schemas/core/policy/integrations/engine/mcp/cli con
`./node_modules/.bin/tsc -p packages/<paquete>/tsconfig.json` y se copiaron
los datos locales con `node scripts/copy-data.mjs` (roles, skills, templates).
No se recompiló Rust. El override global `NAPI_RS_NATIVE_LIBRARY_PATH` afecta
también a Rolldown y no sirve; se usó un preload acotado a Foker.

Comando final:

```sh
NODE_OPTIONS=--require=/tmp/fkr092-native.cjs ./node_modules/.bin/vitest run benchmarks
```

Contenido del preload temporal (sin modificar el binding ni el addon):

```js
const Module = require('node:module');
const original = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === '../binding.cjs' &&
      /\/packages\/core\/(src|dist)\/index\.(ts|js)$/.test(parent?.filename ?? '')) {
    return original.call(this,
      '/home/luis/Documentos/Foker/packages/core/foker-core.linux-x64-gnu.node',
      parent, isMain);
  }
  return original.call(this, request, parent, isMain);
};
```

No se omiten tests. Logs en `/tmp/fkr092-{biome,tsc-final,vitest-final}.log`.
`pnpm verify` no se ejecuta por la restricción offline del issue; estos checks
no certifican una verificación completa Rust del repositorio.
