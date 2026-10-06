# ADR-038 · Paquetes nombrados en el alcance derivado

- **Estado**: Propuesta. Criterio fijado antes de implementar y de medir.
- **Fecha**: 2026-10-05
- **Issue**: FKR-106
- **Modifica (si se acepta)**: FOKER-SPEC, `foker_task_begin` (alcance derivado sin `scope`;
  ADR-031 2b, ADR-032, ADR-036 D5). Sin cambios en esquemas, N-API ni CLI.

## Contexto (OBSERVACIÓN)

Web piloto (`~/Documentos/foker-web-piloto`, plantilla `nextjs-turbo`), tarea real con Claude Code:
«Añade al paquete @repo/ui un componente Badge … y úsalo en la página de inicio de apps/web».
`foker_task_begin` sin `scope` derivó `apps/web/app/**`: el pack solo contiene archivos existentes
y `badge.tsx` era nuevo. G1 rechazó la tarea (`packages/ui/**` fuera de alcance); el agente abrió
una segunda tarea con alcance explícito (+turnos, una tarea huérfana en `RUNNING`). Es la categoría
«archivos nuevos» del diagnóstico de ADR-036, ahora en el flujo.

## Decisión (HIPÓTESIS)

**D6**: sin `scope` explícito, el alcance derivado añade `<path>/**` de cada paquete del workspace
cuyo `name` aparece en la descripción de la tarea, con la misma regla de límites que D4
(`package_mentions`, ADR-036: `@scope/name-extra` no nombra `@scope/name`). Restricciones:

- Nunca el paquete raíz (`path: '.'`): equivaldría a `**` y `begin` lo rechazaría (ADR-032).
- Como máximo **2** paquetes nombrados; si hay más, ninguno (la tarea es ambigua y el alcance se
  inflaría).
- Se aplica `assertUnprotectedScope` como hoy; el resultado se deduplica y ordena.
- Solo alcance derivado: un `scope` explícito no cambia.

## Umbrales (fijados a priori)

Base medida el 2026-10-05 antes de implementar. Medidos con `fixture_b_eval` (modo flujo, 45 casos) y `fixture_a_barrier`, frente a `main`
(`97ed1d4` y posteriores sin cambios del motor):

| Métrica | Base `main` | Exigido |
|---|---|---|
| Cobertura de alcance B, todos | 0,6222 | **≥ 0,6722** (base + 0,05; criterio principal) |
| Cobertura de alcance B, calibration y validation | 0,5417 / 0,7143 | ninguna baja |
| Recall del flujo B, calibration y validation | 0,7604 / 0,9111 (ADR-036) | ninguna baja |
| Errores de alcance B | 0 | 0 |
| Fixture A cobertura y recall del flujo | 0,8222 / 0,7444 | ninguna baja |
| Tamaño del alcance (globs por caso, B) | mediana 2, máximo 3 | mediana ≤ 3 |
| Caso de la web piloto (test unitario) | — | `packages/ui/**` en el alcance |

No hay parámetros que ajustar: no se usa calibration para elegir nada; los dos splits se miden una
vez. Si no se cumple el criterio principal, el ADR se publica como rechazado con las cifras.

## Riesgos

- Un alcance más amplio relaja G1. Se limita a paquetes **nombrados explícitamente** y a 2.
- Nombres de paquete que son palabras comunes (`ui`, `web`) no cuentan: solo el `name` completo del
  `package.json` (en la plantilla, `@repo/ui`).
