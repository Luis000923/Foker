# ADR-006 · Ranking: PageRank personalizado + BM25, sin base vectorial

- **Estado**: Aceptada (pesos = HIPÓTESIS a calibrar)
- **Fecha**: 2026-10-04

## Contexto
V1 proponía multiplicar proximidad topológica por PageRank global e insertar siempre los archivos por encima de un umbral. La petición sugería una fórmula aditiva de seis señales.

## Problema
El PageRank global premia *hubs* irrelevantes para la tarea; sin señal léxica no hay semillas cuando el agente no indica archivos; sumar seis señales correladas exige pesos que no podemos estimar sin datos.

## Decisión
PageRank **personalizado** sobre el grafo de archivos (aristas hacia delante y hacia atrás con factor por intención), con vector de teletransporte formado por anclas, menciones de ruta/símbolo, BM25 sobre rutas/símbolos/firmas/docs, archivos modificados y alcance de la tarea. El PageRank global queda como prior y para la sección `core`. Detalle en FOKER-SPEC §9.5–§9.6.

## Alternativas
1. *Fórmula aditiva de seis términos*: interpretable, pero con seis pesos sin calibrar y doble conteo de señales estructurales. Descartada.
2. *Embeddings + base vectorial*: captura sinónimos; añade modelo, índice, coste y no determinismo de versión del modelo. Future, solo si el benchmark muestra fallos léxicos.
3. *Solo grep/BM25*: simple; ignora la estructura. Es esencialmente el brazo de control del benchmark.

## Consecuencias
- (+) Un modelo único, determinista, con pocas perillas y explicable (razones por archivo).
- (−) Sensible a la calidad de la resolución (ADR-004) y a la elección de pesos; se calibra con `ctx-gold`.
