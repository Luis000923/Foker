# ADR-030 · Respuestas MCP compactas

- **Estado**: Aceptada
- **Fecha**: 2026-10-04
- **Amplía**: ADR-008 y ADR-029

## Contexto

El smoke real bench-smoke-3 (claude-sonnet-5-5, Claude Code 2.1.289)
observó ~4,5x tokens de entrada en Foker con el mismo éxito que el control.
Los transcripts referidos por evidence/host.json mostraron ~9.100 tokens en
foker_task_begin: baseline.dirty_files enumeraba 425 rutas, 409 bajo node_modules.
foker_task_submit devolvía ~2.000–4.400 tokens de output_tail de checks que
pasaban, con ANSI. foker_context (~1.700–3.900 tokens) resulta aceptable.

## Decisión

La capa MCP proyecta el baseline de task_begin a las primeras 20 rutas ordenadas,
excluyendo cualquier segmento node_modules. Añade dirty_files_total (incluye
las rutas excluidas) y dirty_files_truncated (hay rutas originales omitidas).
El ledger, el snapshot completo y sus hashes permanecen íntegros.

foker_check y foker_task_submit omiten output_tail en checks pass; los demás
estados conservan su salida sin secuencias ANSI. Los findings no se modifican
por esta proyección. La redacción y los límites de seguridad MCP siguen aplicándose.
La CLI conserva sus respuestas completas.

mcp-tools.json define variantes exclusivas del transporte: baseline con contadores
opcionales y checkResult con output_tail opcional. Aceptan también las salidas
previas, sin cambiar contratos persistidos ni la versión de API MCP. Los clientes
que requieren output_tail en pass deben adoptar su opcionalidad; no se elimina
ningún campo del esquema común del motor ni del ledger.

La preparación Docker añade node_modules/ a /work/.git/info/exclude cuando
existe .git, sin modificar archivos versionados del fixture.

## Consecuencias

El agente recibe estado, conteo, hash, hallazgos y fallos con menor coste de contexto.
La lista completa se consulta en el ledger local, task_get o el recurso de tarea.
Los tests acotan la respuesta con 1.000 rutas y comprueban ambas herramientas,
la preservación de los resultados originales y la exclusión local del fixture.
La reducción real de tokens requiere repetir el smoke; no se infiere una medición
posterior a partir de estos tests.
