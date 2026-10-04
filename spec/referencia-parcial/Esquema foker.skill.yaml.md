# Esquema foker.skill.yaml

> Resumen parcial recuperado de la bóveda. El archivo canónico `spec/schemas/foker-skill.schema.json` NO se ha podido recuperar.

Archivo canónico: `foker-spec/schemas/foker-skill.schema.json` (no se copia a la bóveda).

## Descripción
Contrato de Foker para una Skill (FOKER-SPEC §13). Acompaña a un SKILL.md compatible con el estándar Agent Skills (agentskills.io). 'permissions' solo puede restringir.

- `$id`: `https://foker.dev/schemas/foker-skill/v1.json`
- Título: foker.skill.yaml
- Obligatorios: `schema_version`, `name`, `version`, `purpose`, `triggers`, `constraints`, `tools`, `workflow_ref`, `validation`, `outputs`, `permissions`

## Propiedades de primer nivel
| Propiedad | Tipo | Descripción |
|---|---|---|
| `schema_version` | `1` |  |
| `name` | `string` | Igual al 'name' de SKILL.md y al nombre del directorio. |
| `version` | `string` |  |
| `purpose` | `string` |  |
| `triggers` | `object` |  |
| `inputs` | `array` |  |
| `constraints` | `array` |  |
| `required_context` | `object` |  |
| `tools` | `array` |  |
| `workflow_ref` | `string` |  |
| `validation` | `object` |  |
| `outputs` | `array` |  |
| `permissions` | `object` |  |
| `compatibility` | `object` |  |
