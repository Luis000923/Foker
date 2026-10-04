# ADR-027 · Codex y paridad por suscripción sin claves API

- **Estado**: Aceptado
- **Fecha**: 2026-10-04
- **Amplía**: ADR-011 (roles), ADR-012 (integraciones), ADR-013 (versionado) y FOKER-SPEC §14

## Contexto

Foker aporta infraestructura determinista; el anfitrión posee el bucle del LLM.
Una suscripción a Claude Code, Codex/ChatGPT o Antigravity debe permitir utilizar
las mismas reglas, contexto, skills, roles y validaciones sin contratar una API de IA.
La lista cerrada de `integrations.targets` del contrato de configuración v1 no incluye Codex.

## Decisión

Añadir `codex` al enum de targets y a los tipos derivados como ampliación aditiva de v1.
Los lectores antiguos rechazarán este nuevo valor: se requiere una versión de Foker
que incluya este adaptador para consumir una configuración con `codex`.

Principio **sin claves API: paridad por suscripción**. Foker no llama a LLMs ni exige
variables `*_API_KEY`. La sesión y ejecución del modelo pertenecen al anfitrión.
Los cuatro adaptadores conectan el mismo servidor MCP local, sin filtros del catálogo,
y exportan el mismo bloque normativo y los mismos cuerpos de skills y roles.
La paridad de infraestructura no demuestra resultados idénticos entre modelos,
ni iguala límites de suscripción o mecanismos de permisos propios del anfitrión.

Codex recibe el bloque gestionado en `AGENTS.md`, skills en `.agents/skills/` y
`[mcp_servers.foker]` con `command`/`args` en `.codex/config.toml` del proyecto.
Los roles se registran como `[agents."foker-implementer"]` y `[agents."foker-reviewer"]`,
con `description` y `config_file` relativo a ese TOML; sus archivos en `.codex/agents/`
contienen `developer_instructions` y `sandbox_mode` según su capacidad de edición.
No se fija modelo ni se activa una feature global automáticamente.

El TOML usa comentarios `# foker:begin v1` y `# foker:end`; el manifiesto existente
registra un bloque y su hash, sin modificar el contrato de manifiesto v1. Sync conserva
el texto externo byte a byte. Una tabla de Foker fuera del bloque es conflicto, incluso
con `--force`, para evitar apropiarse de configuración del usuario.
Doctor consulta disponibilidad y estado local de sesión cuando existe un comando
conocido, sin mostrar salida de autenticación ni errores que pudieran contener secretos.
Si no puede comprobar la sesión, informa una advertencia y verificación manual.

## Consecuencias

La conformidad automatizada compara los cuatro targets sobre un repositorio de prueba:
configuración del servidor y catálogo MCP mediante `tools/list` en memoria, hash normativo, bytes de skills y cuerpos
canónicos de roles, y ausencia de requisitos de claves API.

Codex CLI 0.159.3 confirmó localmente el TOML MCP de proyecto y el descubrimiento de
reglas y skills. La instalación no contiene README ni documentación. La ejecución de
roles y el flujo real con cada suscripción siguen **PENDIENTES FKR-070** en
[verification.md](../integrations/verification.md). No se sustituye esta evidencia por
una afirmación de igualdad de calidad entre modelos.
