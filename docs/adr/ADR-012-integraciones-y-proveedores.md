# ADR-012 · Abstracción de proveedor e integraciones mediante `foker sync`

- **Estado**: Aceptada
- **Fecha**: 2026-10-04

## Contexto
V1 integraba Claude Code solo con `CLAUDE.md`, OpenCode con un inexistente `opencode.yaml` y Antigravity "usando los agentes Planner como sub-rutinas". HECHO verificado (docs oficiales, 2026-10-04): Claude Code usa `.mcp.json`, `.claude/skills|agents|settings.json`; OpenCode `opencode.json(c)`, `.opencode/agents`, `.agents/skills`, `AGENTS.md`; Antigravity `.agents/skills`, `.agents/rules`, `.agents/mcp_config.json`, `AGENTS.md`/`GEMINI.md`.

## Problema
Funcionar con varios anfitriones y modelos sin acoplar el núcleo a ninguno.

## Decisión
El núcleo no conoce anfitriones ni proveedores. `@foker/integrations` contiene un adaptador por anfitrión (`HostAdapter`) que genera, de forma determinista e idempotente, la configuración nativa (instrucciones, MCP, skills, roles, permisos, hooks) dentro de bloques gestionados. Matriz en FOKER-SPEC §14.2. Niveles MVP: Claude Code completo, OpenCode completo sin hooks, Antigravity básico.

## Alternativas
1. *Pedir al usuario que configure cada anfitrión a mano*: frágil y propenso a deriva.
2. *Plugin/extension específica por anfitrión*: más potente (p. ej. plugins de Claude Code u OpenCode); V0.2 si aporta valor medible.

## Consecuencias
- (+) Cambiar de agente o modelo no toca el núcleo.
- (−) Mantener adaptadores ante cambios de los anfitriones (R-15): tests de contrato + checklist por release.
