# ADR-013 · Versionado independiente por artefacto y paquetes en lockstep

- **Estado**: Aceptada
- **Fecha**: 2026-10-04

## Contexto
V1 solo indicaba "SemVer + JSON Schemas".

## Problema
Foker publica código (npm), un addon nativo, varios formatos de datos y una API MCP con ciclos de cambio distintos.

## Decisión
- Paquetes `foker` y `@foker/*` (incluidos los binarios por plataforma) en **lockstep** con Changesets en modo *fixed*; el addon exige coincidencia exacta de versión.
- Formatos con versión propia entera: `schema_version` (mapa), `pack_version`, `foker_mcp_api`, `schema_version` de `foker.skill.yaml`, `version` de `foker.config.yaml`, `foker_spec` de `foker.md`.
- Reglas: mapa = caché (versión distinta → reconstruir); config/skills/spec: Foker N lee N y N-1; API MCP: cambios aditivos sin incremento, rupturas con incremento y deprecación durante un minor. Tabla completa en FOKER-SPEC §17.
- Pre-1.0: un minor puede romper (documentado en changelog). En 1.0 se congelan los formatos v1.

## Alternativas
1. *Versionado independiente por paquete npm*: flexible, pero multiplica combinaciones incompatibles con el addon.
2. *Un único número para todo*: oculta qué rompe qué.

## Consecuencias
- (+) Compatibilidad explícita y verificable.
- (−) Releases de todos los paquetes aunque solo cambie uno.
