# ADR-019 · Contratos reconstruidos: JSON Schemas y API nativa

- **Estado**: Aceptada (decisión del usuario, 2026-10-03)
- **Fecha**: 2026-10-03

## Contexto
La copia original de `foker-spec/` no se recuperó (spec/RECONSTRUCCION.md). Faltaban
`schemas/*.json` (8 esquemas) y `api/foker-core.d.ts`, de los que dependen FKR-004 y FKR-005.

## Problema
Sin esos contratos no se puede validar configuración, mapa, packs, tareas ni herramientas MCP.

## Decisión
- Se reescriben desde FOKER-SPEC (§8.2, §9, §10.3, §11.3, §12, §13, §15, §16.3, §18, §20) y los
  resúmenes de `spec/referencia-parcial/`.
- Fuente normativa: `packages/schemas/schemas/*.json` (JSON Schema 2020-12) y
  `packages/schemas/data/error-codes.json`. `spec/api/foker-core.d.ts` es el contrato de la API nativa.
- Se añaden dos documentos no listados en el original: `common.schema.json` (definiciones compartidas:
  hash, fileId, finding, gateResult, checkResult…) y `foker-md.schema.json` (frontmatter de `foker.md`, §15.1).
- Decisiones de detalle que la especificación no fijaba:
  - Razón `SKILL_CONTEXT` en el Context Pack para las anclas débiles de `required_context` (§13.2).
  - `next_action` de TaskRecord: `work_and_submit | fix_and_resubmit | await_human_approval |
    blocked_contact_human | done | failed | cancelled`.
  - Campo `parser` (`tsc | eslint | vitest | generic`) en checks de `foker.config.yaml` (FKR-043).
  - `policy.overrides`: lista de `{ remove_secret_globs?, remove_protected_paths?, remove_approval_paths?, justification }`.
  - `map.kinds` (globs por `files[].kind`) y `context.core_files` en `foker.config.yaml`.
  - Diagnósticos `FKR-MAP-102` (archivo omitido por tamaño) y `FKR-MAP-103` (entrada omitida: symlink
    fuera del root, nombre no UTF-8), que §8.2 describe sin código.
  - Semántica de globs (`matchGlobs`): un glob sin `/` casa con el nombre a cualquier profundidad.
  - Herramientas MCP con `title` y salidas con `diagnostics` opcional para avisos de truncado (§10.5).
- Si aparece el original, se compara campo a campo y cualquier diferencia se resuelve con un ADR nuevo.

## Alternativas
1. *Esperar al original*: bloquea M0 sin plazo.
2. *Saltar FKR-004*: M2–M4 avanzarían sin contratos verificables.

## Consecuencias
- (+) M0 se cierra; todo el código valida contra esquemas versionados.
- (−) Riesgo de divergencia con el diseño original perdido; mitigado por la regla anterior.
