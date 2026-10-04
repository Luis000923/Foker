# MCP de Foker

Arranque: `foker mcp --root <ruta>`. Usa stdio; stdout contiene únicamente mensajes MCP. El root debe existir y ser un directorio. Los fallos de arranque, incluidos errores de flags, escriben una única línea JSON en stderr con `ts`, `level: error`, `event: startup`, `code` y `message`, dejando stdout vacío. Los logs JSON Lines de llamadas contienen `ts`, `level`, `event`, `tool`, `duration_ms` y `code`, sin argumentos ni contenido del proyecto.

## Herramientas

Las ocho herramientas aparecen en orden alfabético, con título, anotaciones y esquemas autocontenidos de `@foker/schemas`. Se validan entrada y salida con Ajv 2020-12.

| Herramienta | Uso |
|---|---|
| `foker_check` | Ejecuta un perfil confiado, por defecto `quick`; los timeouts son resultados con `status: timeout`, `isError: false`. |
| `foker_context` | ContextPack, presupuesto 1000–20000 tokens; Markdown en `content[0]`, `rendered` en structuredContent solo con `explain`. |
| `foker_impact` | Dependencias o dependientes, profundidad 1–3. |
| `foker_search` | Archivos y símbolos, máximo 50 resultados. |
| `foker_status` | Versiones, frescura del mapa, perfiles, tareas activas y trust. |
| `foker_task_begin` | Rechaza intersecciones de alcance con globs protegidos aunque no estén en el mapa (`FKR-POL-002`, lista `protected_paths_in_scope` en el mensaje); captura baseline y devuelve un task_id; idempotente con `client_token`. |
| `foker_task_get` | Lee el TaskRecord y renueva el lease. |
| `foker_task_submit` | Ejecuta gates y devuelve evidencia y siguiente acción. |

Las llamadas con `task_id` renuevan el lease. Las tareas se atribuyen a `mcp:<clientInfo.name>`. MCP nunca concede trust ni aprueba tareas. El usuario concede confianza mediante la CLI. Los checks declarados requieren trust y pueden producir artefactos del proyecto conforme a §10.3; Foker escribe su propio estado solamente en `.foker/`.

Los errores de herramienta producen `isError: true` sin `structuredContent`: `content[0].text` contiene el JSON `{code,message,recoverable}`; rate limit añade `retry_after_ms`. Los errores internos y un root inválido son errores JSON-RPC. Un fallo de checks es un resultado de validación, no un error de protocolo. Para perfiles largos configura el timeout de herramientas del anfitrión (`MCP_TOOL_TIMEOUT` o equivalente) hasta 600 segundos.

Según [ADR-030](adr/ADR-030-respuestas-mcp-compactas.md), `foker_task_begin`
muestra como máximo 20 rutas ordenadas en `baseline.dirty_files`, sin rutas bajo
`node_modules/` (incluidos directorios anidados). `dirty_files_total` cuenta todas
las rutas originales y `dirty_files_truncated` indica que se omitieron rutas.
El ledger local conserva el baseline completo y su hash; `foker_task_get` y el
recurso de tarea permiten consultarlo. En `foker_check` y `foker_task_submit`,
`output_tail` es opcional: se omite en checks `pass` y se devuelve sin ANSI para
los demás estados. Los findings se conservan. La CLI humana mantiene la salida completa.

## Recursos

| URI | Contenido | ttlMs |
|---|---|---|
| `foker://rules` | `foker/rules.md` | 60000 |
| `foker://map/outline` | L0 de los 50 archivos con mayor PageRank global | 60000 |
| `foker://skills/{name}` | SKILL.md de la skill | 60000 |
| `foker://tasks/{task_id}` | TaskRecord y renovación del lease | 0 |

`cacheScope` es siempre `private`. `resources/list` presenta las cuatro familias; `resources/templates/list` presenta skills y tasks como templates. Cada entrada lleva sus hints; la lista completa usa TTL 0 porque incluye tareas. `resources/read` entrega hints tanto en el resultado como en el contenido.

## Límites y seguridad

Token bucket de 120 llamadas a herramientas por minuto y proceso, capacidad inicial 120 y reposición de un token cada 500 ms. El reloj es inyectable para tests. Cada salida pasa por `redactSecrets`, incluidos recursos y errores. El límite de herramienta es 80000 caracteres contabilizando las representaciones textual y estructurada. El truncado reduce texto y colecciones y se vuelve a validar. El aviso `FKR-MCP-101` aparece en `diagnostics`; para TaskRecord, cuyo esquema cerrado no admite ese campo, se usa `_meta.diagnostics`. Si no es posible conservar el contrato al truncar/redactar, se devuelve `FKR-INT-001`.

Auditoría en `.foker/audit/AAAA-MM-DD.jsonl`: timestamp UTC, actor, herramienta, BLAKE3 canónico de argumentos, resultado, task_id opcional y hash del evento anterior. La cadena continúa entre días y reinicios; las escrituras del proceso se serializan. No contiene argumentos ni contenidos de archivos. No se admiten symlinks en el árbol de estado `.foker/`.

## Configuración por anfitrión (§14.2)

Claude Code, `.mcp.json`:

```json
{"mcpServers":{"foker":{"command":"npx","args":["--no-install","foker","mcp","--root","."]}}}
```

OpenCode, fragmento de `opencode.json`:

```json
{"mcp":{"foker":{"type":"local","command":["npx","--no-install","foker","mcp","--root","."],"enabled":true}}}
```

Antigravity, `.agents/mcp_config.json`:

```json
{"mcpServers":{"foker":{"command":"npx","args":["--no-install","foker","mcp","--root","."]}}}
```

Instala Foker en el proyecto para que `npx --no-install` use su versión local.

## SDK y decisiones de adaptación

SDK server 2.3.0: `serveStdio` selecciona 2026-07-28 por `server/discover` o 2025-11-25 por `initialize`. `createFokerServer().connect()` usa el mismo mecanismo sobre un transporte inyectado. Sin prompts, roots, sampling ni logging MCP. Las revisiones y capacidades las negocia el SDK; el estado de tarea se referencia siempre mediante task_id.

El SDK tipa los campos cache; no requieren fallback en `_meta`. No tipa el campo adicional `foker_mcp_api` en Implementation: se pasa un objeto con ese campo al constructor sin modificar el SDK. Algunos clientes eliminan campos desconocidos de serverInfo al validarlo; `foker_status` publica siempre la versión de API.

El cliente SDK 1.32 valida cualquier `structuredContent` contra `outputSchema` incluso con `isError: true`, tanto en `callTool` como en la ruta experimental de tareas (ESM y CJS); el servidor SDK omite la validación de errores. Por interoperabilidad, los errores de Foker se entregan únicamente como JSON textual.

El cliente v2 conserva por defecto el handshake legado. Para probar 2026-07-28 configura `versionNegotiation: {mode: {pin: "2026-07-28"}}`. La identidad moderna se lee del sobre de la petición; la identidad legacy viene del handshake. El núcleo omite `via` para nodos origen de impacto; el adaptador publica `null` conforme al esquema MCP.

Decisiones no fijadas por la spec: TTL de la lista mixta 0; templates incluidos como familias en la lista de cuatro recursos; diagnóstico de truncado FKR-MCP-101; cadena de auditoría continua entre días; aviso de truncado en `_meta` para TaskRecord. Los hashes del ContextPack describen el pack original del motor, antes de la redacción o truncado del transporte.

## Verificación

Tests unitarios y de transporte en memoria en `packages/mcp/src/server.test.ts`; E2E real stdio con ambos clientes en `packages/mcp/src/server.e2e.test.ts`. El E2E construye los paquetes en orden siempre, aunque exista dist, copia `fixtures/monorepo-pnpm`, concede trust en un XDG temporal y completa begin → context → edición del anfitrión → submit → COMPLETED. Los tests de confinamiento comparan el árbol fuera de `.foker/` antes y después de todas las herramientas, usando checks que no escriben artefactos externos.
