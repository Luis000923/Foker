# spec/ reconstruida (no es la copia original)

`foker-spec/` original no existe en el equipo. Este directorio se reconstruyó el 2026-10-03
invirtiendo `foker-vault/.tools/generar_boveda.py` sobre las notas de `foker-vault/`.

## Contenido recuperado
- `FOKER-SPEC.md`: secciones 1–26 (texto íntegro de las notas; formato puede diferir del original).
- `ROADMAP-BACKLOG.md`: §1 justificación, §2 hitos, §3 fases, §4 backlog (épicas E0–E7), §5 trazabilidad.
- `AUDITORIA.md` y `adr/ADR-001..018`.

## NO recuperado (la bóveda solo guarda resúmenes)
- `api/foker-core.d.ts` (contrato normativo de la API nativa).
- `schemas/*.json` (8 esquemas).
- `referencia-parcial/` contiene únicamente los resúmenes de la bóveda: NO son normativos.

Hasta recuperar el original, cualquier detalle que dependa de esos archivos es PENDIENTE
(ver docs/ESTADO.md). Si aparece `foker-spec/`, sustituir este directorio por la copia exacta.

## Actualización 2026-10-03 (ADR-019)
Por decisión del usuario, los contratos que faltaban se reescribieron desde esta especificación:
- `schemas/*.json` → `packages/schemas/schemas/` (8 documentos + `common` + `foker-md`) y
  `packages/schemas/data/error-codes.json`.
- `api/foker-core.d.ts` → `spec/api/foker-core.d.ts` (reconstruido).
Son normativos hasta que aparezca el original (ver `adr/ADR-019-reconstruccion-de-contratos.md`).
