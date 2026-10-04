# Esquema de salida de la CLI

> Resumen parcial recuperado de la bóveda. El archivo canónico `spec/schemas/cli-output.schema.json` NO se ha podido recuperar.

Archivo canónico: `foker-spec/schemas/cli-output.schema.json` (no se copia a la bóveda).

## Descripción
Sobre único para todos los comandos (FOKER-SPEC §16.3). 'data' es específico de cada comando y se documenta en docs/cli.md (generado).

- `$id`: `https://foker.dev/schemas/cli-output/v1.json`
- Título: Salida --json de la CLI de Foker
- Obligatorios: `schema`, `command`, `ok`, `data`, `warnings`, `errors`, `duration_ms`

## Propiedades de primer nivel
| Propiedad | Tipo | Descripción |
|---|---|---|
| `schema` | `foker.cli/v1` |  |
| `command` | `string` |  |
| `ok` | `boolean` |  |
| `exit_code` | `` |  |
| `data` | `` |  |
| `warnings` | `array` |  |
| `errors` | `array` |  |
| `duration_ms` | `integer` |  |

## Definiciones (`$defs`)
`message`
