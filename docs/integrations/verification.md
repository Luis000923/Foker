# Verificación manual de anfitriones (REQ-INT-002)

Checklist por release (FKR-070). Proyecto de prueba: copia de `fixtures/monorepo-pnpm` con
`foker init` y `foker trust`.

| Paso | Claude Code | OpenCode | Antigravity | Codex CLI |
|---|---|---|---|---|
| `foker sync --target <anfitrión>` sin conflictos | ☐ | ☐ | ☐ | ☐ |
| El servidor `foker` aparece en la lista de MCP del anfitrión | ☐ | ☐ | ☐ | ☐ |
| `foker_status` responde con la versión y el mapa | ☐ | ☐ | ☐ | ☐ |
| La skill `foker-workflow` se descubre | ☐ | ☐ | ☐ | ☐ |
| Una tarea `begin → context → editar → submit` llega a `COMPLETED` | ☐ | ☐ | ☐ | ☐ |
| Editar `.foker/` desde el agente se bloquea (hook o permiso) | ☐ | ☐ | n/a | PENDIENTE |
| `git push` desde el agente se bloquea | ☐ | ☐ | n/a | PENDIENTE |

Registra versión del anfitrión, versión de Foker, fecha y resultado en las notas de la release.

Checklist ejecutable por anfitrión, con comandos, resultados esperados y casillas de firma:
[checklist-fkr-070.md](checklist-fkr-070.md).

## Evidencia local de Codex y pendientes (FKR-070)

Fecha: 2026-10-04. Codex CLI 0.159.3, sin red. Se ejecutaron `codex --help`,
`codex mcp --help`, `codex mcp add --help`, `codex doctor --help` y
`codex login status --help`. `codex login status` devolvió 0; se descartó
su salida sin imprimirla. `claude auth status --help` confirmó ese subcomando. La instalación `/usr/lib/openai-codex` no incluye README/docs.
`~/.codex/config.toml` se consultó solo como referencia de estructura, sin imprimir valores.

Con `CODEX_HOME` temporal y un proyecto temporal confiable, `codex mcp get foker`
ejecutado desde el proyecto confirmó `[mcp_servers.foker]`, `command = "npx"` y
`args = ["--no-install", "foker", "mcp", "--root", "."]`, sin variables de entorno.
`codex debug prompt-input` descubrió `AGENTS.md` y `.agents/skills/foker-test/SKILL.md`.
El binario contiene referencias a `agents.<rol>.config_file` y `developer_instructions`;
la configuración con esos campos no produjo error al cargar el prompt local.
`--strict-config` no está soportado por `mcp` ni `debug` en esta instalación;
no se presenta esta comprobación como validación estricta de roles.

**PENDIENTE de verificación manual FKR-070**:

- Iniciar sesión por suscripción, sin variables `*_API_KEY`, y confirmar `foker_status`
  y el catálogo completo de tools en los cuatro anfitriones.
- Confirmar la invocación de `foker-implementer` y `foker-reviewer` en Codex, la resolución
  relativa de `config_file` y el sandbox efectivo. Determinar si la versión exige habilitar
  subagentes; sync no inventa ni fuerza flags de features.
- Ejecutar el flujo completo hasta `COMPLETED` con cada suscripción y registrar evidencias.
- Comprobar manualmente sesiones de OpenCode y Antigravity; su comando local de estado
  no está verificado. Claude Code usa `auth status` si existe; un fallo indica verificación manual.
- Verificar descubrimiento sin duplicados cuando varios targets comparten `.agents/skills/`.

Los tests de paridad consultan `tools/list` al servidor en memoria para cada target y
prueban igualdad de infraestructura; no certifican calidad idéntica
entre modelos ni compatibilidad efectiva de un cliente que no se ha ejecutado.

## ADR-031 fase 2

Los tests locales comprueban el flujo corto y la paridad de reglas, skills, roles y catálogo
MCP entre los cuatro targets. En la próxima prueba por suscripción, registra:

- `foker_task_begin` con `context`: el modelo recibe el código de los objetivos en structured.
- Ausencia de relecturas de objetivos salvo aviso de omisión; search/check opcionales.
- `foker_task_submit` ejecuta checks y gates; solo `COMPLETED` termina.
- Si falla el pack, se conserva `task_id` y se recupera contexto sin duplicar la tarea.

Estos tests y las medidas UTF-8 locales no certifican tokens ni llamadas reales del anfitrión.
El smoke por suscripción queda pendiente; esta fase se verifica sin red ni recompilar el addon.
