# Integraciones con agentes anfitriones

Resumen de FOKER-SPEC §14. `foker sync` genera la configuración nativa de cada anfitrión de forma
determinista; `foker sync --check` falla (exit 1) si algo difiere, útil en CI.

| Elemento | Claude Code | OpenCode | Google Antigravity |
|---|---|---|---|
| Instrucciones | `CLAUDE.md` (`@AGENTS.md` + bloque) y bloque en `AGENTS.md` | bloque en `AGENTS.md` | bloque en `AGENTS.md` + `.agents/rules/foker.md` (`trigger: always_on`) |
| MCP | `.mcp.json` → `mcpServers.foker` | `opencode.json` → `mcp.foker` (timeout 600 s) | `.agents/mcp_config.json` → `mcpServers.foker` |
| Skills | `.claude/skills/<name>/` | `.agents/skills/<name>/` | `.agents/skills/<name>/` |
| Roles | `.claude/agents/foker-implementer.md`, `foker-reviewer.md` | `.opencode/agents/…` (`mode: subagent`) | reglas `trigger: model_decision` en `.agents/rules/` |
| Permisos (C1) | `.claude/settings.json` `permissions.deny` | `opencode.json` `permission` | no hay mecanismo declarativo verificado (R-11) |
| Hooks | `PreToolUse` (Edit/Write/Bash) y `Stop` → `foker policy check --hook claude-code` | — | — |
| Soporte MVP | completo | completo sin hooks | básico |

## Qué toca `sync` y qué no

- Markdown: solo el contenido entre `<!-- foker:begin v1 -->` y `<!-- foker:end -->`; el resto del
  archivo se conserva byte a byte (REQ-PRJ-002).
- JSON: solo las claves y elementos de lista que generó; el resto se conserva. Las reescribe con
  formato estable (2 espacios). `opencode.json` con comentarios no se toca: se informa conflicto.
- Archivos generados (skills, roles, reglas): llevan `<!-- generado por foker sync; no editar -->`.
- `foker/sync-manifest.json` (versionado) registra qué generó cada vez, para actualizar o retirar sus
  entradas sin tocar las del usuario. No contiene fechas.
- Si una parte gestionada se editó a mano, `sync` no escribe nada y devuelve `FKR-SYN-001`;
  `foker sync --force` la regenera.

## Notas por anfitrión

- **Claude Code**: los hooks llaman a `npx --no-install foker policy check --hook claude-code`; con
  `PreToolUse` niega ediciones de rutas protegidas, rutas fuera del proyecto y comandos git
  destructivos; con `Stop` recuerda enviar las tareas `RUNNING` (una sola vez por parada).
- **OpenCode**: lee también `.claude/skills/`; si se generan ambos anfitriones puede ver skills
  duplicadas (RIESGO R-10, pendiente de verificar). Un permiso escrito como acción (`"edit": "ask"`) se
  convierte en `{"*": "ask", …}` sin cambiar su efecto. Validado contra `https://opencode.ai/config.json`.
- **Antigravity**: solo las capas C2–C4 protegen (R-11). La regla `foker.md` cabe en 24 KB.

Verificación manual por release: [verification.md](verification.md).

Los assets de skills se copian y comparan por bytes; solo `SKILL.md` recibe la nota de generado.
Las listas JSON registran únicamente los elementos añadidos por Foker o ya gestionados.
Una propiedad intermedia incompatible produce un conflicto y no se aplica el plan.

`doctor` respeta `--config` en todo el diagnóstico. Con `--fix --dry-run` devuelve
`proposed` sin aplicar reparaciones; verifica las reglas efectivas de Git (o las líneas
en orden con sus negaciones cuando Git no puede consultarlas).
`init` deduplica los targets y planifica `--dry-run` con la configuración propuesta,
incluso al reemplazar una configuración existente mediante `--force`.
