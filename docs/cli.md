# CLI de Foker

Generado desde el registro de comandos. Regenerar con `UPDATE_SNAPSHOTS=1 ./node_modules/.bin/vitest run packages/cli/src/docs.test.ts`.

## Flags globales

| Flag | Tipo | Default | Descripción |
|---|---|---|---|
| --dry-run | boolean | false | Previsualiza archivos sin escribir |
| --cwd | string | "" | Directorio de trabajo |
| --config | string | "" | Ruta de configuración |
| --json | boolean | false | Salida JSON |
| --quiet | boolean | false | Suprime salida humana |
| --debug | boolean | false | Trazas y tiempos en stderr |
| --no-color | boolean | false | Sin color (también NO_COLOR) |
| --ci | boolean | false | No interactivo, sin color, JSON en errores (también CI=true) |
| --non-interactive | boolean | false | Nunca pregunta |
| --version | boolean | false | Muestra versión |
| --help | boolean | false | Muestra ayuda |
| --verbose / -v | boolean | false | Logs detallados en stderr |

## Exit codes

| Código | Significado |
|---|---|
| 0 | Éxito |
| 1 | Resultado negativo esperado |
| 2 | Argumentos inválidos |
| 3 | Configuración inválida |
| 4 | Mapa o parseo irrecuperable |
| 5 | Violación de política |
| 6 | Requiere intervención humana |
| 7 | Timeout |
| 10 | Error interno |

## foker init

Inicializa Foker

| Flag | Tipo | Default | Descripción |
|---|---|---|---|
| --template | string | "" | Plantilla |
| --from-spec | string | "" | Especificación |
| --targets | string | "" | Anfitriones |
| --dry-run | boolean | false | Previsualiza archivos |
| --force | boolean | false | Fuerza inicialización |

## foker map

Construye/refresca el Project Map

| Flag | Tipo | Default | Descripción |
|---|---|---|---|
| --full | boolean | false | Reconstruye completamente |
| --stats | boolean | false | Incluye estadísticas |
| --export | string | "" | Exporta JSON canónico a un archivo |
| --check | boolean | false | Sale con 1 si el mapa estaba desactualizado; no guarda |
| --dry-run | boolean | false | Previsualiza exportación sin escribir (requiere --export) |

## foker context

Construye un Context Pack

| Flag | Tipo | Default | Descripción |
|---|---|---|---|
| --anchor | string[] | [] | Ruta o símbolo (repetible) |
| --intent | string | "" | intent |
| --budget | string | "" | budget |
| --skill | string | "" | skill |
| --task | string | "" | task |
| --format | string | "" | format |
| --explain | boolean | false | Explica selección |

## foker mcp

Arranca MCP stdio

| Flag | Tipo | Default | Descripción |
|---|---|---|---|
| --root | string | "" | Raíz |

## foker sync

Genera integraciones

| Flag | Tipo | Default | Descripción |
|---|---|---|---|
| --target | string | "" | Anfitriones |
| --check | boolean | false | Comprueba diferencias |
| --dry-run | boolean | false | Previsualiza archivos |

## foker doctor

Diagnostica el entorno

| Flag | Tipo | Default | Descripción |
|---|---|---|---|
| --fix | boolean | false | Aplica correcciones seguras |

## foker trust

Confía en el workspace

| Flag | Tipo | Default | Descripción |
|---|---|---|---|
| --yes | boolean | false | Confirma confianza |

## foker policy check

Evalúa una acción contra la política

| Flag | Tipo | Default | Descripción |
|---|---|---|---|
| --hook | string | "" | Anfitrión del hook |
| --path | string | "" | Ruta |
| --command | string | "" | Comando |

## foker validate

Ejecuta checks

| Flag | Tipo | Default | Descripción |
|---|---|---|---|
| --profile | string | "" | Perfil (default) |
| --checks | string | "" | Lista de checks |
| --packages | string | "" | Lista de paquetes |
| --changed | boolean | false | Solo cambios |

## foker task begin

Tareas: begin

| Flag | Tipo | Default | Descripción |
|---|---|---|---|
| --scope | string[] | [] | Ámbito (repetible) |
| --profile | string | "" | Perfil |
| --skill | string | "" | Skill |
| --reason | string | "" | Razón |
| --summary | string | "" | Resumen del intento |
| --yes | boolean | false | Confirma en CI explícito |

## foker task submit

Tareas: submit

| Flag | Tipo | Default | Descripción |
|---|---|---|---|
| --scope | string[] | [] | Ámbito (repetible) |
| --profile | string | "" | Perfil |
| --skill | string | "" | Skill |
| --reason | string | "" | Razón |
| --summary | string | "" | Resumen del intento |
| --yes | boolean | false | Confirma en CI explícito |

## foker task status

Tareas: status

| Flag | Tipo | Default | Descripción |
|---|---|---|---|
| --scope | string[] | [] | Ámbito (repetible) |
| --profile | string | "" | Perfil |
| --skill | string | "" | Skill |
| --reason | string | "" | Razón |
| --summary | string | "" | Resumen del intento |
| --yes | boolean | false | Confirma en CI explícito |

## foker task list

Tareas: list

| Flag | Tipo | Default | Descripción |
|---|---|---|---|
| --scope | string[] | [] | Ámbito (repetible) |
| --profile | string | "" | Perfil |
| --skill | string | "" | Skill |
| --reason | string | "" | Razón |
| --summary | string | "" | Resumen del intento |
| --yes | boolean | false | Confirma en CI explícito |

## foker task approve

Tareas: approve

| Flag | Tipo | Default | Descripción |
|---|---|---|---|
| --scope | string[] | [] | Ámbito (repetible) |
| --profile | string | "" | Perfil |
| --skill | string | "" | Skill |
| --reason | string | "" | Razón |
| --summary | string | "" | Resumen del intento |
| --yes | boolean | false | Confirma en CI explícito |

## foker task reject

Tareas: reject

| Flag | Tipo | Default | Descripción |
|---|---|---|---|
| --scope | string[] | [] | Ámbito (repetible) |
| --profile | string | "" | Perfil |
| --skill | string | "" | Skill |
| --reason | string | "" | Razón |
| --summary | string | "" | Resumen del intento |
| --yes | boolean | false | Confirma en CI explícito |

## foker task unblock

Tareas: unblock

| Flag | Tipo | Default | Descripción |
|---|---|---|---|
| --scope | string[] | [] | Ámbito (repetible) |
| --profile | string | "" | Perfil |
| --skill | string | "" | Skill |
| --reason | string | "" | Razón |
| --summary | string | "" | Resumen del intento |
| --yes | boolean | false | Confirma en CI explícito |

## foker task cancel

Tareas: cancel

| Flag | Tipo | Default | Descripción |
|---|---|---|---|
| --scope | string[] | [] | Ámbito (repetible) |
| --profile | string | "" | Perfil |
| --skill | string | "" | Skill |
| --reason | string | "" | Razón |
| --summary | string | "" | Resumen del intento |
| --yes | boolean | false | Confirma en CI explícito |

## foker task verify

Tareas: verify

| Flag | Tipo | Default | Descripción |
|---|---|---|---|
| --scope | string[] | [] | Ámbito (repetible) |
| --profile | string | "" | Perfil |
| --skill | string | "" | Skill |
| --reason | string | "" | Razón |
| --summary | string | "" | Resumen del intento |
| --yes | boolean | false | Confirma en CI explícito |

## foker skill list

Skills: list

| Flag | Tipo | Default | Descripción |
|---|---|---|---|
| --strict | boolean | false | Validación estricta |

## foker skill show

Skills: show

| Flag | Tipo | Default | Descripción |
|---|---|---|---|
| --strict | boolean | false | Validación estricta |

## foker skill validate

Skills: validate

| Flag | Tipo | Default | Descripción |
|---|---|---|---|
| --strict | boolean | false | Validación estricta |

## foker skill new

Skills: new

| Flag | Tipo | Default | Descripción |
|---|---|---|---|
| --strict | boolean | false | Validación estricta |

## Datos de context

`foker context "<tarea>"` imprime Markdown por defecto. `--json` o `--format json` entrega el sobre CLI con `data` conforme a `context-pack.schema.json` (snake_case). Las anclas de archivo entran en L3; `--explain` incluye razones y descartados. Lee reglas, skill y cambios de git; abre el motor en solo lectura y no guarda el mapa. `--budget` admite 1000–200000 tokens. `--task` queda pendiente de FKR-045. Un presupuesto insuficiente para contexto obligatorio produce FKR-CTX-001 y exit 1.

## Datos de map

`data` incluye `contentHash`, `files`, `symbols`, `added`, `changed`, `removed`, `rebuilt`, `unchanged`, `diagnostics` y, al guardar, `saved: {path, bytes}`. `--stats` añade `stats: {files, symbols, staleFiles, durationMs}`. `--dry-run --export` añade `plannedFiles` y no escribe. Las rutas de exportación se normalizan respecto a `--cwd`. `--check` compara el hash previo con el refrescado y no guarda.

## Datos de task y validate

`task begin` recibe una descripción y `--scope` repetible. status devuelve un TaskRecord (sin id, lista); list devuelve la lista. submit devuelve `{task_id, state, attempt, gates, evidence, next_action}`: REJECTED describe el intento aunque la FSM haya preparado RUNNING para reintentar. REJECTED/FAILED salen con 1; AWAITING_APPROVAL/BLOCKED con 6; COMPLETED con 0. verify reejecuta y compara la última evidencia sin modificar la tarea. approve/reject/unblock exigen TTY y confirmación, excepto con --ci explícito y CI=true; --yes solo no permite aprobación no interactiva. unblock admite --scope para fijar el nuevo alcance. validate usa el perfil default por defecto; --checks y --packages son listas separadas por comas. --changed calcula paquetes afectados; escribe logs en .foker/runs/adhoc/ sin tocar tareas. Ambos requieren trust para ejecutar checks.

## Servidor MCP

`foker mcp --root <ruta>` atiende stdio con protocolos 2026-07-28 y 2025-11-25. stdout se reserva al protocolo incluso con --json; logs JSON Lines en stderr. Herramientas, recursos, límites y configuración de anfitriones: [docs/mcp.md](mcp.md).
