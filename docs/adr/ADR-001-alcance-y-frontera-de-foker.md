# ADR-001 · Alcance de Foker y frontera con el agente anfitrión

- **Estado**: Aceptada (confirmada por el usuario el 2026-10-04, PREGUNTA-1).
- **Fecha**: 2026-10-04
- **Sustituye**: V1 §6 ("Foker actuará como un Host (Orquestador)") y ESP ("el Context Engine intercepta las llamadas antes de la API del proveedor").

## Contexto
La investigación describía a Foker a la vez como orquestador del LLM, como servidor MCP y como interceptor de llamadas al proveedor, y además exigía integrarse con Claude Code, OpenCode y Google Antigravity, que ejecutan su propio bucle LLM.

## Problema
Las tres posturas son incompatibles. Un servidor MCP no controla el prompt del anfitrión; un orquestador propio exige construir un agente completo (SDKs, claves, bucle de herramientas, streaming) antes de demostrar la tesis.

## Decisión
En el MVP Foker es **infraestructura determinista** consumida por agentes externos: Project Map, Context Engine, políticas, gates, ledger de tareas, Skills/roles y generación de integraciones. El bucle LLM pertenece al anfitrión. Un runner propio (`foker run`) con adaptadores de proveedor se especifica como componente **opcional de V0.2**.

## Alternativas
1. *Foker como host/orquestador desde el MVP*: control total del prompt y del caching; coste alto, duplica a los anfitriones y retrasa la validación de la tesis. Descartada para el MVP.
2. *Foker como proxy HTTP del proveedor*: intercepta llamadas reales; frágil (cada anfitrión usa endpoints y autenticación distintos), riesgo de seguridad (maneja claves), viola términos de algunos productos. Descartada.
3. *Solo archivos de instrucciones (sin MCP)*: muy simple; sin validación determinista ni contexto calculado. Insuficiente.

## Consecuencias
- (+) Independencia del proveedor y del anfitrión; cambiar de agente = `foker sync --target`.
- (+) El benchmark puede usar anfitriones reales en modo headless.
- (−) Foker no controla el prompt caching ni el aislamiento de contexto en el MVP (ver ADR-016).
- (−) La seguridad depende parcialmente de los permisos del anfitrión (ver ADR-009).
