# ADR-007 · Context Pack determinista con niveles de renderizado

- **Estado**: Aceptada
- **Fecha**: 2026-10-04

## Contexto
La "ecuación conceptual" del contexto (prefijo + skill + AST podado + archivos + tarea) no especificaba presupuesto, niveles, orden ni salida.

## Problema
Necesitamos una salida reproducible, auditable y útil para cualquier anfitrión.

## Decisión
`ContextPack` (esquema `context-pack.schema.json`) con secciones de clase obligatoria/opcional y estabilidad `static/session/task`, archivos a niveles L0–L3, selección voraz con degradación, contexto obligatorio que nunca se trunca en silencio (`FKR-CTX-001`), traza de razones y descartados, contenido del repo delimitado como dato no confiable, y `rendered` en orden estable→dinámico.

## Alternativas
1. *Devolver solo rutas y que el agente lea*: mínimo, pero traslada el coste de tokens al agente y pierde las firmas.
2. *Devolver archivos completos priorizados*: simple; contradice la tesis de reducción.
3. *Resúmenes generados por LLM*: compresión mayor; no determinista y con coste. Future, si acaso, como caché opcional.

## Consecuencias
- (+) Reproducible (REQ-CTX-001), depurable, medible.
- (−) La heurística de tokens es aproximada (R-14).
