# ADR-010 · Formato de Skills: Agent Skills + `foker.skill.yaml`

- **Estado**: Aceptada (modifica V1 §9)
- **Fecha**: 2026-10-04

## Contexto
Los documentos definían campos de Skill distintos entre sí, un JSON Schema draft-07 para un archivo Markdown y nombres como `Build_Secure_React_Form`. HECHO verificado: el estándar abierto Agent Skills (agentskills.io) define `SKILL.md` con frontmatter (`name` en minúsculas y guiones igual al directorio, `description` obligatoria, `license`, `compatibility`, `metadata` string→string, `allowed-tools` experimental) y lo implementan Claude Code, OpenCode y Antigravity.

## Problema
Tener un contrato rico y versionado para Foker sin romper la portabilidad entre agentes (vendor lock-in).

## Decisión
Cada skill es un directorio con `SKILL.md` **estrictamente estándar** (solo campos portables; `metadata.foker-skill-version` y `metadata.foker-contract`) y un archivo lateral `foker.skill.yaml` validado por `schemas/foker-skill.schema.json` (triggers, inputs, constraints, required_context, tools, workflow_ref, validation, outputs, permissions). Los anfitriones ignoran el archivo lateral; Foker lo usa para contexto, validación y política. Fuente canónica en `foker/skills/`; `foker sync` materializa copias por anfitrión.

## Alternativas
1. *Todo en el frontmatter de SKILL.md*: un archivo; pero `metadata` solo admite strings y algunos destinos rechazan claves desconocidas. Descartada.
2. *Formato propio sin SKILL.md*: control total; pierde descubrimiento nativo en los tres anfitriones. Descartada.

## Consecuencias
- (+) Portabilidad inmediata; contrato versionado.
- (−) Dos archivos que mantener coherentes (validado por `foker skill validate`); posibles duplicados en OpenCode (R-10).
