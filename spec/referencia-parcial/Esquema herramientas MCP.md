# Esquema herramientas MCP

> Resumen parcial recuperado de la bóveda. El archivo canónico `spec/schemas/mcp-tools.json` NO se ha podido recuperar.

Archivo canónico: `foker-spec/schemas/mcp-tools.json` (no se copia a la bóveda).

- `$id`: `https://foker.dev/schemas/mcp-tools/v1.json`

## Herramientas
- `foker_check`: Ejecuta un perfil de validación del proyecto (typecheck, lint, test, secrets…) y devuelve hallazgos estructurados. No cambia el estado de ninguna tarea. Úsalo para feedback rápido antes de foker_task_submit.
- `foker_context`: Devuelve el contexto mínimo suficiente para una tarea: reglas del proyecto, núcleo, skill, firmas de dependencias y contenido de los archivos objetivo, con la razón de cada inclusión. Pasa anclas (archivos o símbolos) si las conoces.
- `foker_impact`: Lista qué archivos, paquetes y tests dependen de los archivos o símbolos dados (o de qué dependen), hasta una profundidad de 3.
- `foker_search`: Busca archivos y símbolos del proyecto por nombre o ruta usando el Project Map (sin leer archivos).
- `foker_status`: Versión de Foker, estado del Project Map, perfiles de validación disponibles, confianza del workspace y tareas activas.
- `foker_task_begin`: Crea una tarea con alcance (globs de rutas que podrás modificar) y perfil de validación. Devuelve task_id, que debes pasar a foker_context y foker_task_submit. Las tareas inactivas 4 h pasan a BLOCKED.
- `foker_task_get`: Devuelve estado, intentos, últimos hallazgos de validación y siguiente acción de una tarea.
- `foker_task_submit`: Declara terminado el intento actual y ejecuta los gates deterministas (alcance, política, mapa, checks, skill). Solo Foker decide si la tarea queda COMPLETED. Si el resultado es REJECTED, corrige los hallazgos y vuelve a llamar.

## Definiciones (`$defs`)
`finding`, `checkResult`, `gateResult`
