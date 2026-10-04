# Esquema Project Map

> Resumen parcial recuperado de la bóveda. El archivo canónico `spec/schemas/project-map.schema.json` NO se ha podido recuperar.

Archivo canónico: `foker-spec/schemas/project-map.schema.json` (no se copia a la bóveda).

## Descripción
Estado estructural derivado del proyecto gestionado. Caché reconstruible; ver FOKER-SPEC §8. Todas las colecciones van ordenadas por id para serialización canónica.

- `$id`: `https://foker.dev/schemas/project-map/v1.json`
- Título: Foker Project Map
- Obligatorios: `schema_version`, `foker_version`, `generator`, `generated_at`, `content_hash`, `config_hash`, `project`, `files`, `symbols`, `edges`, `external_modules`, `diagnostics`, `stats`

## Propiedades de primer nivel
| Propiedad | Tipo | Descripción |
|---|---|---|
| `$schema` | `string` |  |
| `schema_version` | `1` |  |
| `foker_version` | `#/$defs/semver` |  |
| `generator` | `object` |  |
| `generated_at` | `string` | Informativo; excluido de content_hash. |
| `content_hash` | `#/$defs/hash` | BLAKE3 del JSON canónico sin generated_at, content_hash, stats.duration_ms ni files[].mtime_ns. |
| `config_hash` | `#/$defs/hash` |  |
| `project` | `object` |  |
| `files` | `array` |  |
| `symbols` | `array` |  |
| `edges` | `array` |  |
| `external_modules` | `array` |  |
| `diagnostics` | `array` |  |
| `stats` | `object` |  |

## Definiciones (`$defs`)
`semver`, `hash`, `fileId`, `position`, `file`, `symbol`, `edge`
