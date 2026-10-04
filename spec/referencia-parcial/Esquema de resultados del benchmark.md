# Esquema de resultados del benchmark

> Resumen parcial recuperado de la bóveda. El archivo canónico `spec/schemas/benchmark-result.schema.json` NO se ha podido recuperar.

Archivo canónico: `foker-spec/schemas/benchmark-result.schema.json` (no se copia a la bóveda).

## Descripción
Una línea JSONL por ejecución (tarea × brazo × repetición). FOKER-SPEC §20.

- `$id`: `https://foker.dev/schemas/benchmark-result/v1.json`
- Título: Resultado de una ejecución del benchmark
- Obligatorios: `schema_version`, `run_id`, `manifest_hash`, `task_id`, `repo`, `arm`, `repetition`, `host`, `model`, `foker_version`, `started_at`, `metrics`, `success`, `success_breakdown`

## Propiedades de primer nivel
| Propiedad | Tipo | Descripción |
|---|---|---|
| `schema_version` | `1` |  |
| `run_id` | `string` |  |
| `manifest_hash` | `string` |  |
| `task_id` | `string` |  |
| `task_type` | `` |  |
| `repo` | `object` |  |
| `arm` | `` |  |
| `repetition` | `integer` |  |
| `host` | `object` |  |
| `model` | `string` | Id exacto del modelo (no alias). |
| `foker_version` | `string / null` |  |
| `started_at` | `string` |  |
| `limits` | `object` |  |
| `metrics` | `object` |  |
| `success` | `boolean` |  |
| `success_breakdown` | `object` |  |
| `notes` | `string` |  |
