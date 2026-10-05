# ADR-034 · Contenido completo de archivos pequeños en L2

- **Estado**: Propuesta. Criterio y umbral fijados **antes** de implementar y de medir (este
  commit precede al código).
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
  L3) ni cambian las métricas que cuentan L1–L3. `files[].note` = «contenido completo», sin datos
  del repositorio.
- Mismo escape y delimitación que cualquier contenido (`trust="repository-content"`).
- Parámetro interno `small_full_max_extra` (64; 0 lo desactiva), omitido del JSON cuando vale el
  default; propiedad opcional en el esquema `ContextPack`. Sin cambios en N-API, CLI ni MCP.

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
