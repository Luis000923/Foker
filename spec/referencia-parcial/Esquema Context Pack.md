# Esquema Context Pack

> Resumen parcial recuperado de la bóveda. El archivo canónico `spec/schemas/context-pack.schema.json` NO se ha podido recuperar.

Archivo canónico: `foker-spec/schemas/context-pack.schema.json` (no se copia a la bóveda).

## Descripción
Salida determinista del Context Engine (FOKER-SPEC §9). Las claves usan snake_case en JSON; la API nativa expone camelCase.

- `$id`: `https://foker.dev/schemas/context-pack/v1.json`
- Título: Foker Context Pack
- Obligatorios: `pack_version`, `pack_hash`, `map_hash`, `request`, `intent`, `intent_source`, `budget`, `sections`, `files`, `excluded`, `diagnostics`

## Propiedades de primer nivel
| Propiedad | Tipo | Descripción |
|---|---|---|
| `pack_version` | `1` |  |
| `pack_hash` | `#/$defs/hash` | BLAKE3 de rendered + files canónicos. |
| `map_hash` | `#/$defs/hash` |  |
| `request` | `#/$defs/request` |  |
| `intent` | `#/$defs/intent` |  |
| `intent_source` | `` |  |
| `budget` | `object` |  |
| `sections` | `array` |  |
| `files` | `array` |  |
| `excluded` | `array` |  |
| `diagnostics` | `array` |  |
| `rendered` | `string` | Markdown estable→dinámico. Omitido en structuredContent MCP salvo explain=true (va en content[0]). |

## Definiciones (`$defs`)
`hash`, `intent`, `request`
