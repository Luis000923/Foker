# ADR-018 · Metodología de benchmark: experimento pareado con agente headless

- **Estado**: Aceptada (diseño); repos y presupuesto PENDIENTES
- **Fecha**: 2026-10-04

## Contexto
La investigación fijaba "18:1" como objetivo a "demostrar inequívocamente", usaba un modelo obsoleto ("Claude 3.5 Sonnet") y no definía éxito ni estadística.

## Problema
Medir si Foker funciona de forma reproducible y falsable.

## Decisión
Experimento pareado control vs Foker con el mismo anfitrión (Claude Code headless con `--strict-mcp-config` en el MVP) y modelo fijado por id; contenedores aislados; ≥ 40 tareas con tests ocultos fail-to-pass y pass-to-pass; 3 repeticiones; *Task Success* automático (FOKER-SPEC §20.4); hipótesis H1 (≥ 30 % menos tokens de entrada por tarea exitosa con no inferioridad de éxito de −5 pp) y H2; IC 95 % por bootstrap + Wilcoxon; resultados negativos publicados. "18:1" se informa como `CCR_relevante` (TARGET/HYPOTHESIS), sin ser criterio de éxito. El arnés se construye en M1, antes del Context Engine.

## Alternativas
1. *SWE-bench / benchmarks públicos de Python*: no representan monorepos TS.
2. *Medir solo compresión del pack*: no dice nada del éxito real de la tarea.

## Consecuencias
- (+) La tesis es falsable y el resultado guía el roadmap.
- (−) Coste de API y tiempo de curación de tareas.
