# ADR-008 · Servidor MCP: stdio, 8 herramientas deterministas, 2026-07-28 + 2025-11-25

- **Estado**: Aceptada
- **Fecha**: 2026-10-04

## Contexto
V1 exponía `read_file`, `apply_patch`, `run_typecheck` y `run_security_check` sin esquemas de salida, timeouts ni idempotencia, sobre la especificación MCP 2026-07-28.

## Problema
Definir una superficie mínima, segura y compatible con anfitriones que aún pueden hablar la revisión anterior.

## Decisión
- Transporte stdio; SDK oficial TypeScript v2.
- Revisión 2026-07-28 (HECHO verificado: sin estado, `server/discover`, `resultType`, MRTR; Roots/Sampling/Logging deprecados) con compatibilidad 2025-11-25.
- Herramientas: `foker_status`, `foker_search`, `foker_context`, `foker_impact`, `foker_check`, `foker_task_begin`, `foker_task_submit`, `foker_task_get`. Recursos: 4. Prompts: 0.
- Ninguna herramienta escribe código ni ejecuta comandos arbitrarios; estado entre llamadas solo vía `task_id`.

## Alternativas
1. *Incluir lectura/escritura de archivos*: duplicaría las herramientas del anfitrión con otra política de permisos. Descartada.
2. *Streamable HTTP*: permitiría servidor compartido; exige autenticación y protección de red. Future.
3. *Exponer skills como prompts MCP*: útil para anfitriones sin skills; V0.2 (el recurso `foker://skills/{name}` cubre el MVP).

## Consecuencias
- (+) Superficie pequeña y auditable; funciona en todos los anfitriones con MCP stdio.
- (−) `foker_task_submit` puede durar más que el timeout de herramientas de algunos anfitriones (R-09) hasta adoptar la extensión *Tasks*.
