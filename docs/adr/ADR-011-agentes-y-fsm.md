# ADR-011 · Roles como definiciones, FSM de tareas en Foker y COMPLETED determinista

- **Estado**: Aceptada (modifica V1 §8)
- **Fecha**: 2026-10-04

## Contexto
V1 definía Architect, Planner, Specialist y Review como agentes con estados `PENDING → … → COMPLETED` sin transiciones formales ni definición de éxito; el Review Agent "aprobaba" con reglas SAST.

## Problema
Con anfitriones externos (ADR-001), Foker no ejecuta agentes; aun así debe garantizar que una tarea no se da por terminada solo porque el LLM lo diga.

## Decisión
- Un **rol** es una definición (instrucciones + herramientas + política de contexto) que `foker sync` exporta al formato nativo. MVP: Implementer y Reviewer (consultivo). V0.2: Planner y Architect.
- El estado vive en la **tarea** (ledger en `.foker/tasks/`), con FSM de 10 estados (FOKER-SPEC §12.3). `RETRYING` → `REJECTED` + `attempt`; se añaden `AWAITING_APPROVAL` y `BLOCKED`.
- `COMPLETED` solo lo asigna el validador cuando pasan G1–G5 (REQ-TSK-001) y, si aplica, tras aprobación humana por CLI.

## Alternativas
1. *Agentes de Foker como procesos propios*: requiere runner (V0.2).
2. *Dejar el estado al anfitrión (todo lists del agente)*: no auditable ni determinista.
3. *Review LLM como gate obligatorio*: no determinista; queda consultivo.

## Consecuencias
- (+) "Hecho" significa verificado; handoff entre roles por `task_id`.
- (−) Depende de que el agente use `task_begin/submit` (R-02); se mitiga con skill `foker-workflow`, hooks y medición en el benchmark.
