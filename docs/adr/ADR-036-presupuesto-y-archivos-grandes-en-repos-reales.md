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
