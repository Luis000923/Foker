# Benchmark: diseño y estado

FOKER-SPEC §20 y ADR-018 plantean comprobar si Foker reduce tokens por tarea exitosa sin empeorar
el éxito. **No hay resultados del experimento ni evidencia que confirme H1/H2.**
`benchmarks/` contiene hoy solo `perf-baseline.json`, usado por nightly para rendimiento del núcleo.
El esquema `packages/schemas/schemas/benchmark-result.schema.json` y su ejemplo validado existen;
no existe manifiesto, arnés, dataset curado, informe ni workflow benchmark.yml.

## Diseño previsto (no ejecutado)

Experimento pareado: mismo repo/commit, anfitrión y modelo con id exacto; control sin MCP/roles/skills
Foker, conservando las instrucciones originales, frente a experimental tras init/sync.
Claude Code headless con strict-mcp-config en MVP; OpenCode como segundo anfitrión en V0.2.
Contenedor nuevo por run, sin secretos de usuario, red limitada al proveedor/registro, caché pnpm
precalentada y límites de turnos, tiempo y coste. Orden aleatorio con semilla registrada; tres
repeticiones por tarea y brazo.

Dataset objetivo ≥40 tareas: fixture sintético de ~300 archivos/6 paquetes y 2–3 monorepos TS
reales fijados por commit, ≥15 tareas por repo real. Mezcla prevista: 40 % fixes, 30 % features
pequeñas, 20 % refactors y 10 % tests. Cada tarea necesita gold patch, tests ocultos fail-to-pass
y pass-to-pass; los tests se exponen solo al evaluador.

Task Success se determina en contenedor limpio: pasan ambos conjuntos de tests, lint y tipos;
no se modifican archivos protegidos del arnés y se respetan límites. El estado COMPLETED de Foker
no es criterio de éxito del experimento: ambos brazos reciben la misma evaluación independiente.

Métrica primaria: tokens de entrada totales por tarea exitosa, incluyendo input, cache-read y
cache-write. Se registran además éxito, coste con precios versionados, latencia, tokens de salida,
archivos expuestos/modificados, precisión/recall respecto al gold, ediciones fuera de alcance,
errores y reintentos. CCR_relevante 18:1 es hipótesis informativa, no criterio de éxito.

H1 exige reducción estimada ≥30 %, IC 95 % de reducción excluyendo cero y límite inferior del IC
de diferencia de éxito ≥−5 puntos. §20.6 prevé medias de repeticiones exitosas emparejadas,
bootstrap de 10.000 remuestreos con semilla y Wilcoxon; tareas sin éxito en un brazo se analizan
aparte. H2 compara exposición y cambios fuera de alcance. Se publicarán resultados negativos;
40 tareas ×3 puede no detectar efectos <15 %.

## Pendientes y decisiones bloqueantes

| Issue | Falta |
|---|---|
| FKR-010 | Manifiesto validado y resultados JSONL. |
| FKR-011 | Arnés headless aislado, límites y extracción completa de usage; PREGUNTA-2: presupuesto API/modelo. |
| FKR-012 | Evaluador independiente con los cinco criterios y sus tests. |
| FKR-013 | Fixture A y ≥20 tareas curadas con gold patches/tests ocultos. |
| FKR-014 | Fixture B; PREGUNTA-6: selección de 2–3 repos y commits con tests offline. |
| FKR-015 | Línea base ≥10 tareas ×3. |
| FKR-016 | Análisis estadístico e informe generado. |
| FKR-017/037 | Suite ctx-gold (30 casos M1, objetivo 60) y calibración de defaults de contexto. |
| FKR-018 | Experimento completo ≥40 tareas ×2 brazos ×3 y publicación del informe. |

`pnpm bench:run --suite smoke/full` es **PENDIENTE FKR-011/018**: no existe ese script actualmente.
PREGUNTA-2 y PREGUNTA-6 bloquean las ejecuciones/curación real, pero no impiden construir esquema,
fixture sintético y evaluador sin llamadas al proveedor. PREGUNTA-3 bloquea publicación npm
(FKR-080), no es una prueba de eficacia ni reemplaza el benchmark.
