# Verificación manual de anfitriones (REQ-INT-002)

Checklist por release (FKR-070). Proyecto de prueba: copia de `fixtures/monorepo-pnpm` con
`foker init` y `foker trust`.

| Paso | Claude Code | OpenCode | Antigravity |
|---|---|---|---|
| `foker sync --target <anfitrión>` sin conflictos | ☐ | ☐ | ☐ |
| El servidor `foker` aparece en la lista de MCP del anfitrión | ☐ | ☐ | ☐ |
| `foker_status` responde con la versión y el mapa | ☐ | ☐ | ☐ |
| La skill `foker-workflow` se descubre | ☐ | ☐ | ☐ |
| Una tarea `begin → context → editar → submit` llega a `COMPLETED` | ☐ | ☐ | ☐ |
| Editar `.foker/` desde el agente se bloquea (hook o permiso) | ☐ | ☐ | n/a |
| `git push` desde el agente se bloquea | ☐ | ☐ | n/a |

Registra versión del anfitrión, versión de Foker, fecha y resultado en las notas de la release.
