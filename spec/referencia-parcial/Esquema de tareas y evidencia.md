# Esquema de tareas y evidencia

> Resumen parcial recuperado de la bóveda. El archivo canónico `spec/schemas/task.schema.json` NO se ha podido recuperar.

Archivo canónico: `foker-spec/schemas/task.schema.json` (no se copia a la bóveda).

## Descripción
Registro de tarea en .foker/tasks/<task_id>.json y salida de foker_task_get (FOKER-SPEC §12). Los eventos van en <task_id>.events.jsonl (cada línea = $defs/event). La evidencia de cada intento en .foker/runs/<task_id>/<attempt>/evidence.json (= $defs/evidence).

- `$id`: `https://foker.dev/schemas/task/v1.json`
- Título: Foker TaskRecord
- Obligatorios: `schema_version`, `task_id`, `state`, `description`, `scope`, `profile`, `attempt`, `max_attempts`, `created_at`, `updated_at`, `created_by`, `baseline`, `approvals`, `last_gates`, `next_action`

## Propiedades de primer nivel
| Propiedad | Tipo | Descripción |
|---|---|---|
| `schema_version` | `1` |  |
| `task_id` | `string` | tsk_ + ULID |
| `state` | `#/$defs/state` |  |
| `description` | `string` |  |
| `scope` | `object` |  |
| `profile` | `string` |  |
| `skill` | `string / null` |  |
| `attempt` | `integer` |  |
| `max_attempts` | `integer` |  |
| `client_token` | `string / null` |  |
| `created_at` | `string` |  |
| `updated_at` | `string` |  |
| `last_activity_at` | `string` |  |
| `created_by` | `string` | mcp:<clientInfo.name> \| cli:<usuario> |
| `baseline` | `object` |  |
| `approvals` | `array` |  |
| `last_gates` | `array` |  |
| `next_action` | `` |  |
| `blocked_reason` | `string / null` |  |

## Definiciones (`$defs`)
`state`, `event`, `evidence`
