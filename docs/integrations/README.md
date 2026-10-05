# Integraciones con agentes anfitriones

Resumen de FOKER-SPEC §14. `foker sync` genera la configuración nativa de cada anfitrión de forma
determinista; `foker sync --check` falla (exit 1) si algo difiere, útil en CI.

Ninguna clave API de IA es obligatoria. Usa la sesión de tu suscripción del anfitrión;
Foker no llama a LLMs. La paridad cubre infraestructura y contenido normativo;
los resultados y límites del modelo dependen del anfitrión y la suscripción.

```sh
pnpm exec foker init --targets codex
pnpm exec foker sync --target codex
pnpm exec foker doctor
```

| Elemento | Claude Code | OpenCode | Google Antigravity | Codex CLI |
|---|---|---|---|---|
| Reglas normativas | bloque `AGENTS.md`, importado por `CLAUDE.md` | bloque `AGENTS.md` | bloque `AGENTS.md` y regla always_on | bloque `AGENTS.md` |
| MCP: mismo catálogo completo de Foker | `.mcp.json` | `opencode.json` | `.agents/mcp_config.json` | `.codex/config.toml`, `[mcp_servers.foker]` |
| Mismas skills | `.claude/skills/` | `.agents/skills/` | `.agents/skills/` | `.agents/skills/` |
| Mismos cuerpos de roles | `.claude/agents/` | `.opencode/agents/` | reglas model_decision | `.codex/agents/*.toml`, registrados en `[agents."<rol>"]` |
| Claves API exigidas por Foker | ninguna | ninguna | ninguna | ninguna |
| Sesión en doctor | `claude auth status` si disponible | manual | manual | `codex login status` |
| Permisos C1 | permissions.deny | permission | sin mecanismo verificado | sandbox por rol; ejecución pendiente |
| Hooks | PreToolUse y Stop | — | — | — |
| Flujo real por suscripción | PENDIENTE FKR-070 | PENDIENTE FKR-070 | PENDIENTE FKR-070 | PENDIENTE FKR-070 |

## Flujo corto (ADR-031 fase 2)

`foker_task_begin` con descripción, alcance y `context: true` (defaults) u objeto
`{budget_tokens?, anchors?, intent?}` → editar → `foker_task_submit`.
Submit ejecuta checks y gates: dos llamadas MCP obligatorias. `foker_check` es opcional
para feedback intermedio y `foker_search` cuando el pack no basta.

El pack ya contiene el código objetivo: no releas esos archivos salvo aviso de omisión.
`structuredContent` incluye `rendered`; `content[0]` entrega el mismo código en texto.
`foker_context` devuelve la proyección compacta por defecto; `explain=true` devuelve el pack
completo. Si begin devuelve `context_error`, la tarea existe: conserva `task_id` y recupera
el contexto con `foker_context` o reintenta begin con el mismo `client_token` y otras opciones
`context`. Esas opciones no cambian la identidad de la tarea ni el ledger.

Los cuatro targets comparten instrucciones y rol Implementer. El cuerpo incluido se
proyecta en `packages/integrations` para actualizar los bloques sin modificar `roles/`.

## Qué toca `sync` y qué no

- Markdown: solo el contenido entre `<!-- foker:begin v1 -->` y `<!-- foker:end -->`; el resto del
  archivo se conserva byte a byte (REQ-PRJ-002).
- TOML de Codex: solo el bloque `# foker:begin v1` … `# foker:end`; conserva el texto externo.
  Las tablas de Foker fuera del bloque producen conflicto incluso con `--force`.
- JSON: solo las claves y elementos de lista que generó; el resto se conserva. Las reescribe con
  formato estable (2 espacios). `opencode.json` con comentarios no se toca: se informa conflicto.
- Archivos generados (skills, roles, reglas): llevan `<!-- generado por foker sync; no editar -->`.
- `foker/sync-manifest.json` (versionado) registra qué generó cada vez, para actualizar o retirar sus
  entradas sin tocar las del usuario. No contiene fechas.
- Si una parte gestionada se editó a mano, `sync` no escribe nada y devuelve `FKR-SYN-001`;
  `foker sync --force` la regenera.

## Notas por anfitrión

- **Codex**: CLI 0.159.3 comprobado sin red. Abre el proyecto como confiable para cargar
  `.codex/config.toml`. Los roles usan `description`/`config_file`, con `developer_instructions`
  y `sandbox_mode` en cada archivo. No se fija modelo ni se habilitan features automáticamente.
  La invocación real de subagentes sigue pendiente; consulta el checklist.
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
