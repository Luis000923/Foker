# Checklist manual de anfitriones — FKR-070 (REQ-INT-002)

Checklist ejecutable para firmar a mano la verificación por suscripción en los cuatro
anfitriones. Cubre todas las filas de [verification.md](verification.md), incluidas las
**PENDIENTE de Codex** (bloqueo de `.foker/` y de `git push`).

Cada anfitrión tiene pasos numerados con el comando exacto, el resultado esperado y dónde
mirar si falla. Al final de cada bloque, una **casilla de firma**.

> Este documento no sustituye a `verification.md`: aquel es el resumen por release, este es
> el guion de ejecución. Los pasos marcados **NO VERIFICADO** no se pudieron comprobar sin
> iniciar sesión o sin la suscripción; se dejan señalados a propósito.

## Orden recomendado

No ejecutes el checklist hasta completar la fase 0. La configuración MCP que genera
`sync` arranca el servidor con `npx --no-install foker`, que **falla si `foker` no está
instalado** (ver [Fallos previstos](#fallos-previstos)). El orden correcto es:

1. **Instalar Foker** desde el tarball local (`npm install -g <ruta>/foker-x.y.z.tgz`), de
   forma que `npx --no-install foker` resuelva el binario.
2. **Comprobar la resolución**: `npx --no-install foker --version` debe imprimir la versión
   sin tocar la red.
3. **`foker init` + `foker trust`** en el proyecto de prueba.
4. **`foker sync`** con todos los targets de una vez (ver [fallo 2](#fallo-2)).
5. **Fase 0** de este checklist (comprobaciones automáticas, sin sesión ni cuota).
6. **Checklist manual** por anfitrión, firmando cada bloque.

## Preparación del proyecto de prueba

```sh
PROY="$HOME/ruta/al/proyecto/de/prueba"     # copia de fixtures/monorepo-pnpm
cd "$PROY" && git init -q && git add -A
```

Fixture usado en la fase 0: copia de `fixtures/monorepo-pnpm` (monorepo pnpm con
`apps/web`, `packages/core`, `packages/ui`). Contiene 6 skills y 2 roles, así que ejercita
todos los adaptadores.

---

## Fase 0 — Comprobaciones automáticas previas

Ninguno de estos pasos inicia sesión ni consume cuota de modelo. Se ejecutaron con el CLI
compilado del worktree: `node <worktree>/packages/cli/dist/bin.js` (en adelante `foker`).

### 0.1 Inicializar y confiar

```sh
foker init --targets claude-code,opencode,antigravity,codex
CI=true foker trust --ci --yes
```

**Esperado**: `init` lista los 31 archivos a crear; `trust` responde
`trust: correcto` y sale con 0.

**Si falla**: `foker trust --yes` a secas devuelve `FKR-INP-001: --yes exige --ci y CI=true`
— hacen falta los tres: flag `--ci`, `--yes` y la variable `CI=true`. Sin TTY, `trust`
devuelve `FKR-POL-010: Trust requiere confirmación por TTY` (exit 6).

### 0.2 Sincronizar

```sh
foker sync                       # todos los targets de una vez
foker sync --check               # debe responder "sync: sin cambios" y salir 0
```

**Esperado**: `sync --check` sin cambios, exit 0. `sync --check` con deriva sale **1** (útil
en CI).

**Si falla**: un `FKR-SYN-001` significa que un archivo gestionado se editó a mano. Revisa
el mensaje y usa `foker sync --force` para regenerar.

### 0.3 Validar los archivos generados

```sh
cat .mcp.json                      # mcpServers.foker = npx --no-install foker mcp --root .
cat opencode.json                  # mcp.foker (type local, timeout 600000) + permission.*
cat .agents/mcp_config.json        # mcpServers.foker
cat .codex/config.toml             # bloque # foker:begin v1 … # foker:end
cat .claude/settings.json          # permissions.deny + hooks PreToolUse y Stop
cat CLAUDE.md                      # @AGENTS.md + bloque gestionado
ls .claude/skills .agents/skills .agents/rules .claude/agents .opencode/agents .codex/agents
foker skill validate --strict
```

**Esperado**: 6 skills en `.claude/skills/` y las mismas 6 en `.agents/skills/`, idénticas
byte a byte; 3 reglas en `.agents/rules/` muy por debajo del límite de 24 KB
(`foker.md` 968 B, `foker-implementer.md` 1101 B, `foker-reviewer.md` 893 B);
`skill validate --strict` sale con 0.

### 0.4 Comprobación MCP por anfitrión (solo lectura, sin sesión)

Cada anfitrión tiene un subcomando de solo lectura que lista la configuración MCP sin
iniciar sesión. Úsalos **antes** del checklist manual: acotan el fallo a la fase 0.

#### Claude Code

```sh
claude mcp get foker
claude mcp list
```

**Esperado**: `Scope: Project config (shared via .mcp.json)`, `Type: stdio`,
`Command: npx`, `Args: --no-install foker mcp --root .`. El estado será
`⏸ Pending approval (run \`claude\` to approve)` hasta que apruebes el servidor en la
primera sesión; a partir de ahí, `✔ Connected`.

**Si falla**: si no aparece, `claude` no está leyendo el `.mcp.json` del proyecto. Comprueba
que la sesión se abrió **en** `$PROY`. Para resetear: `claude mcp reset-project-choices`.

#### Codex CLI

Codex solo carga `.codex/config.toml` de proyectos de confianza. Con `CODEX_HOME` temporal
hay que marcar el proyecto como confiable primero:

```sh
export CODEX_HOME="$TMP/codex-home" && mkdir -p "$CODEX_HOME"
printf 'projects."%s".trust_level = "trusted"\n' "$(pwd)" > "$CODEX_HOME/config.toml"
codex mcp get foker --json
codex mcp list --json
codex doctor --summary --no-color
```

**Esperado**: `command: "npx"`, `args: ["--no-install","foker","mcp","--root","."]`,
`enabled: true`, `transport.type: "stdio"`, sin `env`. En `doctor`, dentro de
`Configuration`: `✓ config       loaded` y `✓ mcp          1 server (1 stdio) · 0 disabled`.

**Si falla**: `Error: No MCP server named 'foker' found` casi siempre significa que falta la
línea `trust_level` o que `CODEX_HOME` no es el que crees. Codex avisa con
`Refusing to create helper binaries under temporary dir` si `CODEX_HOME` está bajo `/tmp`;
es inocuo, pero puedes usar una ruta fuera de `/tmp` para silenciarlo.

Verificación estricta de la config (parcial, ver [fallo 6](#fallo-6)):

```sh
codex --strict-config doctor --summary --no-color   # ✓ config loaded
codex features list | grep -E 'multi_agent'
```

#### OpenCode

```sh
opencode debug config      # incluye la fuente opencode.json del proyecto
opencode debug agents      # debe listar foker-implementer y foker-reviewer
opencode mcp list          # ✓ foker connected  /  ✗ foker failed
```

**Esperado**: `debug config` devuelve una entrada por documento, entre ellas
`.../opencode.json` del proyecto, con `mcp.servers.foker.command` = el array de `npx` y
`timeout: {catalog: 600000, execution: 600000}`. `debug agents` lista ambos roles con
`mode: subagent`. `mcp list` muestra `✓ foker  connected`.

**Si falla**: `✗ foker  failed: Connection closed` casi siempre es [fallo 1](#fallo-1)
(`foker` no resoluble). `opencode mcp list` **no** acepta `--standalone` ni un directorio
posicional, y lee el proyecto del directorio de trabajo actual: ejecútalo desde `$PROY`. El
servidor en segundo plano puede.cachear; `opencode reload` fuerza la recarga de
configuración.

**Falso negativo conocido**: la **primera** ejecución de `opencode mcp list` en un directorio
recién estrenado devuelve `No MCP servers configured`, aunque el proyecto sí declare el
servidor. La segunda ejecución sí informa del estado real. Ejecuta el comando **dos veces**
antes de concluir nada; no tomes `No MCP servers configured` como prueba de que falte la
configuración. Comprobado:

```console
$ opencode mcp list
No MCP servers configured
$ opencode mcp list
✗ foker  failed: Connection closed
```

#### Antigravity (`agy`)

```sh
agy mcp list
```

**Esperado (hoy)**: `No MCP servers configured.` — ver [fallo 3](#fallo-3). La CLI `agy`
solo lee `~/.gemini/config/mcp_config.json` (global) y `plugins/<plugin>/mcp_config.json`;
`.agents/mcp_config.json` no está entre sus rutas de descubrimiento. **Anota este paso como
fallo conocido**, no como paso aprobado.

Para ver qué escribiría la CLI, en un `HOME` aislado (no toca tu configuración real):

```sh
HOME="$TMP/agy-home" agy mcp add probe -- echo hello
cat "$TMP/agy-home/.gemini/config/mcp_config.json"   # ruta real que usa agy
HOME="$TMP/agy-home" agy mcp list
```

### 0.5 Smoke del servidor MCP por stdio (sin anfitrión)

```sh
foker mcp --root .
```

Intercambio MCP esperado (protocolo `2025-11-25`, servidor `foker`, `foker_mcp_api: 1`):

1. `initialize` → `serverInfo: {name: "foker", version: "<versión>", foker_mcp_api: 1}`
2. `notifications/initialized`
3. `tools/list` → **8** herramientas: `foker_check`, `foker_context`, `foker_impact`,
   `foker_search`, `foker_status`, `foker_task_begin`, `foker_task_get`, `foker_task_submit`
4. `tools/call` `foker_status` con `{}` → `structuredContent` con `foker_version`,
   `foker_mcp_api`, `protocol`, `root_name`, `map` (`content_hash`, `files`, `symbols`,
   `stale_files`, `schema_version`), `profiles`, `active_tasks`, `trust`, `diagnostics`
5. `resources/list` → `foker://rules`, `foker://map/outline`, `foker://skills/{name}`,
   `foker://tasks/{task_id}`

**Si falla**: stdout debe quedar reservado al protocolo; los logs van a stderr como JSON
Lines. Si stdout trae texto, hay algo escribiendo en el canal equivocado.

### 0.6 `foker doctor`

```sh
foker doctor
foker doctor --json
```

**Esperado**: `ok` en `node`, `addon`, `git`, `config`, `trust`, `sync`, `rules`, `mcp`,
`gitignore`; `host:claude-code:session` y `host:codex:session` en `ok`. Advertencias
esperadas: `host:opencode:session` (PENDIENTE de verificación manual, por diseño),
`host:antigravity:session` (PENDIENTE de verificación manual, por diseño) y `sandbox` (C4, sin sandbox de SO).

---

## Claude Code (2.1.289)

Comprobado con `--help`: `claude --version`, `claude auth status [--json|--text]`,
`claude mcp list`, `claude mcp get <name>`, `claude mcp remove <name> -s project`,
`claude mcp reset-project-choices`, y los flags globales `--mcp-config`,
`--strict-mcp-config`, `--settings`, `--agents`, `--add-dir`, `--print`, `--output-format`,
`--bare`, `--agent`, `--dangerously-skip-permissions`.

```sh
cd "$PROY"
claude --version
claude auth status                       # solo estado; no volcar tokens
claude mcp get foker
```

### Pasos

1. **Sesión iniciada por suscripción, sin variables `*_API_KEY`.**
   `claude auth status` sale con 0 y muestra una sesión por suscripción.
   *Si falla*: `claude auth status --text` para detalle legible.
   *Mirar*: `foker doctor` → `host:claude-code:session`.

2. **`sync` sin conflictos.**
   `foker sync --target claude-code` y después `foker sync --check`.
   *Esperado*: `sync: sin cambios`, exit 0.
   *Mirar*: `FKR-SYN-001` y `foker/sync-manifest.json`.

3. **Servidor MCP en la lista del anfitrión.**
   `claude mcp list` desde `$PROY`.
   *Esperado*: `foker: npx --no-install foker mcp --root . - ✔ Connected`.
   *Si sale `⏸ Pending approval`*: es el primer arranque. Lanza `claude` y **aprueba el
   servidor `foker`** cuando lo pregunte; no hay subcomando CLI para aprobarlo.
   *Mirar*: `claude --debug` para trazas de MCP; `~/.claude.json` para el estado de
   aprobación por proyecto.

4. **`foker_status` responde.**
   En la sesión, pide: `llama a la herramienta foker_status y muéstrame el JSON`.
   *Esperado*: versión de Foker, `foker_mcp_api`, `map.content_hash`, `map.files`,
   `map.symbols`, `trust`.
   *Si falla*: el prefijo en Claude Code es `mcp__foker__foker_status`.

5. **La skill `foker-workflow` se descubre.**
   En la sesión: `/skills` o pide que liste las skills disponibles.
   *Esperado*: aparece `foker-workflow` y apunta a `.claude/skills/foker-workflow/SKILL.md`.
   **NO VERIFICADO**: `claude` 2.1.289 no expone un subcomando CLI para listar skills ni
   agentes; la comprobación es interactiva. Si `/skills` no existe en esta versión, pide al
   modelo que cite la ruta de la skill.

6. **Los dos roles se descubren.**
   En la sesión: `/agents`.
   *Esperado*: `foker-implementer` (con `Bash`, `Edit`, `Write` y `mcp__foker__*`) y
   `foker-reviewer` (solo lectura).
   **NO VERIFICADO**: sin equivalente CLI; `claude --agents` *define* agentes, no los lista.

7. **Flujo completo hasta `COMPLETED`.**
   Pide: `usa la skill foker-workflow para cambiar el formato de precio en
   packages/core/src/cart/cart.ts`.
   *Esperado*: `foker_task_begin` → `foker_context` → edición → `foker_task_submit`
   con `state: COMPLETED` y `gates` en verde. Solo `COMPLETED` termina.
   *Mirar*: `foker task list`; `.foker/runs/`; el mensaje del error si vuelve `REJECTED`.
   **Aviso**: `foker_task_submit` ejecuta checks; si tardan más que el timeout por defecto
   del anfitrión, sube `MCP_TOOL_TIMEOUT` a 600 s.

8. **Editar `.foker/` se bloquea.**
   En la sesión: `edita .foker/tasks.json` (o cualquier archivo bajo `.foker/`).
   *Esperado*: el hook `PreToolUse` lo niega (`permissions.deny` incluye `Edit(./.foker/**)`).
   *Mirar*: el hook escribe en stderr; `claude --debug` y `foker policy check --hook
   claude-code --path .foker/tasks.json`.

9. **`git push` se bloquea.**
   En la sesión: `haz git push`.
   *Esperado*: `permissions.deny` contiene `Bash(git push *)`; se niega antes de ejecutar.
   *Mirar*: mismo hook; comprueba que `.claude/settings.json` sigue teniendo la regla (si la
   quitaste, `sync --check` lo detecta).

### Firma Claude Code

| Campo | Valor |
|---|---|
| Fecha | |
| Versión del anfitrión (`claude --version`) | |
| Versión de Foker (`foker --version`) | |
| Resultado (pass / fail / parcial + pasos fallidos) | |
| Firma | |

---

## Codex CLI (0.159.3)

Comprobado con `--help`: `codex --version`, `codex login status`, `codex mcp list [--json]`,
`codex mcp get <NAME> [--json]`, `codex mcp add/remove/login/logout`,
`codex doctor [--json|--summary|--all|--no-color|--ascii]`, `codex debug prompt-input`,
`codex features list`, y el flag global `--strict-config`.

```sh
cd "$PROY"
export CODEX_HOME="$TMP/codex-home"     # o tu ~/.codex real si vas a usar la suscripción
codex --version
codex login status                      # solo código de salida; no volcar la salida
```

### Pasos

1. **Proyecto abierto como confiable.** Sin esto, Codex ignora `.codex/config.toml`.
   En la TUI, `/approvals` o el aviso de confianza al abrir el proyecto; para un
   `CODEX_HOME` temporal, la línea `projects."<ruta>".trust_level = "trusted"`.
   *Esperado*: `codex mcp get foker` encuentra el servidor.
   *Mirar*: `codex doctor` → sección `Configuration`.

2. **Sesión iniciada por suscripción, sin variables `*_API_KEY`.**
   `codex login status` sale con 0.
   *Si falla*: `codex login` (o `codex login --device-auth`).
   **Aviso**: no vuelques la salida de `codex login status` ni leas `~/.codex/auth.json`.

3. **`sync` sin conflictos.**
   `foker sync --target codex` y `foker sync --check`.
   *Esperado*: sin cambios, exit 0. El bloque `# foker:begin v1 … # foker:end` se conserva
   y el resto del TOML queda intacto.

4. **Servidor MCP en la lista del anfitrión.**
   `codex mcp list --json` y `codex doctor --summary --no-color`.
   *Esperado*: `foker` con `transport.type: "stdio"` y `✓ mcp  1 server (1 stdio) · 0 disabled`.
   *Si falla*: [fallo 5](#fallo-5) (`CODEX_HOME` bajo `/tmp` + confianza).

5. **`foker_status` responde.**
   En la sesión: `llama a foker_status`.
   *Esperado*: `foker_version`, `map.content_hash`, `map.files`, `map.symbols`, `trust`.
   *Si falla*: Codex nombra las herramientas MCP por su nombre simple (`foker_status`), sin
   prefijo de servidor.

6. **La skill `foker-workflow` se descubre.**
   ```sh
   codex debug prompt-input | grep -c foker-workflow     # sin sesión
   ```
   *Esperado*: en la sesión aparece en la lista de skills apuntando a
   `<proyecto>/.agents/skills/foker-workflow/SKILL.md`. Sin sesión, `debug prompt-input`
   ya debe listarla en `## Skills`.
   *Mirar*: la tabla `### Skill roots` del propio prompt (`r2` = `.agents/skills` del
   proyecto en la verificación local).

7. **`AGENTS.md` se aplica.**
   `codex debug prompt-input | grep -c foker_task_begin`.
   *Esperado*: `>= 1`. El bloque gestionado de `AGENTS.md` debe estar en el prompt.

8. **Flujo completo hasta `COMPLETED`.**
   Pide el mismo cambio de precio que en Claude Code.
   *Esperado*: `foker_task_begin` → `foker_context` → edición → `foker_task_submit` con
   `COMPLETED`.

9. **Los subagentes `foker-implementer` y `foker-reviewer` se invocan.** *(PENDIENTE)*
   Pide: `delega en foker-implementer el cambio y luego en foker-reviewer la revisión`.
   *Esperado*: los dos subagentes se invocan, resuelven `config_file` relativo a `.codex/`
   y respetan `sandbox_mode` (`workspace-write` y `read-only` respectivamente).
   *Mirar*: `codex features list` → `multi_agent` está en `stable`/`true` en 0.159.3, así
   que **no debería hacer falta habilitar nada**; `multi_agent_v2` está en `stable`/`false`.
   Si Codex no ofrece los subagentes, no fuerces flags de features desde `sync`: anótalo y
   abre incidencia.

10. **Editar `.foker/` se bloquea.** *(PENDIENTE en `verification.md`)*
    Pide al subagente implementer que edite un archivo bajo `.foker/`.
    *Esperado*: el sandbox o la política lo impiden.
    *Si se permite*: es un fallo de C1 en Codex. Anótalo con el `sandbox_mode` efectivo que
    imprimió `codex doctor`.

11. **`git push` se bloquea.** *(PENDIENTE en `verification.md`)*
    Pide: `haz git push` desde el agente.
    *Esperado*: bloqueado. Codex no recibe reglas `permissions.deny` de Foker: solo el
    `sandbox_mode` por rol, que **no** cubre `git push` a un remoto.
    *Si se ejecuta*: registra que la fila queda en fail y que C1 no está cubierta en Codex.

### Firma Codex CLI

| Campo | Valor |
|---|---|
| Fecha | |
| Versión del anfitrión (`codex --version`) | |
| Versión de Foker (`foker --version`) | |
| Resultado (pass / fail / parcial + pasos fallidos) | |
| Firma | |

---

## OpenCode (2.0.20)

Comprobado con `--help`: `opencode --version`, `opencode mcp list` (**sin flags**),
`opencode debug config`, `opencode debug agents`, `opencode debug paths`,
`opencode auth list|login|logout|export|import|switch`, `opencode reload`,
`opencode service start|restart|status|stop|get|set|unset`, `opencode run [message]
--agent <a> --format json`, `opencode session`, `opencode models`.

```sh
cd "$PROY"
opencode --version
opencode debug config
opencode debug agents
opencode mcp list
```

### Pasos

1. **`sync` sin conflictos.**
   `foker sync --target opencode` y `foker sync --check`.
   *Esperado*: sin cambios, exit 0. Si `opencode.json` tiene comentarios, `sync` lo informa
   como conflicto y no lo toca.

2. **Configuración efectiva cargada.**
   `opencode debug config`.
   *Esperado*: una entrada por documento, entre ellas `<proyecto>/opencode.json`, con
   `mcp.servers.foker` y `permissions` con los 26 `deny` de Foker (12 `edit`, 8 `read`,
   4 `shell`).
   *Si falla*: si el proyecto no aparece, OpenCode no está usando ese directorio.

3. **Roles descubiertos.**
   `opencode debug agents`.
   *Esperado*: `foker-implementer` y `foker-reviewer`, ambos `mode: subagent`.
   *Si falla*: `.opencode/agents/*.md` no se está leyendo; comprueba el frontmatter.

4. **Sesión iniciada por suscripción.**
   `opencode auth list` (lista integraciones, no claves), o abre la TUI y confirma el
   proveedor.
   *Esperado*: el proveedor de tu suscripción aparece conectado.
   *Mirar*: `foker doctor` marca `host:opencode:session` como PENDIENTE **por diseño**;
   ese aviso nunca se autocorrige.
   **Aviso**: `opencode auth export` imprime secretos; no lo ejecutes para esto.

5. **Servidor MCP conectado.**
   `opencode mcp list` **dos veces** (ver el falso negativo en la fase 0.4).
   *Esperado*: `✓ foker  connected`.
   *Si falla*: `✗ foker  failed: Connection closed` → [fallo 1](#fallo-1).

6. **`foker_status` responde.**
   En la sesión: `llama a foker_status`.
   *Esperado*: versión de Foker, mapa y `trust`.
   *Aviso*: `opencode.json` fija `timeout: 600000` para el servidor porque el default de
   OpenCode (5 s) cortaría `foker_task_submit` (RIESGO R-09). Si ves un timeout, comprueba
   que ese valor sigue ahí.

7. **La skill `foker-workflow` se descubre.**
   En la sesión, pide la lista de skills.
   *Esperado*: aparece **una sola vez**.
   **Riesgo R-10 (ABIERTO)**: OpenCode lee `.claude/skills/` además de `.agents/skills/`.
   Como `sync` con ambos targets genera las dos, **la misma skill puede aparecer
   duplicada**. En la verificación local `diff` entre `.claude/skills/foker-workflow/SKILL.md`
   y `.agents/skills/foker-workflow/SKILL.md` dio idénticos, así que el contenido no se
   duplica, pero **la cantidad de entradas en el listado está PENDIENTE de confirmar en
   sesión**.
   *Si molesta*: no generar `claude-code` cuando solo uses OpenCode. `foker sync --target
   opencode` por sí solo **no** borra `.claude/`; para retirarlo hay que quitarlo del
   manifiesto y volver a sincronizar.

8. **Flujo completo hasta `COMPLETED`.**
   Pide el mismo cambio de precio.
   *Esperado*: `foker_task_begin` → `foker_context` → edición → `foker_task_submit` con
   `COMPLETED`.
   *Opción*: `opencode run "..." --agent foker-implementer --format json`.

9. **Editar `.foker/` se bloquea.**
   En la sesión (agente principal): `edita .foker/tasks.json`.
   *Esperado*: bloqueado por `permissions` del proyecto.
   **Cuidado — ver [fallo 7](#fallo-7)**: con el subagente `foker-implementer`, el permiso
   `bash: ask` del propio rol se aplica **después** de los `deny` del proyecto y puede
   re-degradar `git push` de `deny` a `ask`. Verifica ambos casos por separado.

10. **`git push` se bloquea.**
    En la sesión: `haz git push`.
    *Esperado*: bloqueado (`deny`).
    *Atención a tu config global*: `~/.config/opencode/opencode.jsonc` tiene
    `shell: "git push *" -> "ask"`. Los `deny` del proyecto se aplican después, pero
    OpenCode evalúa **la última regla que coincide**; confirma que el resultado sigue siendo
    `deny` y no `ask` (ver [fallo 7](#fallo-7)).
    *Mirar*: `opencode debug agents` y el bloque `permissions` del agente en su `system`.

### Firma OpenCode

| Campo | Valor |
|---|---|
| Fecha | |
| Versión del anfitrión (`opencode --version`) | |
| Versión de Foker (`foker --version`) | |
| Resultado (pass / fail / parcial + pasos fallidos) | |
| Firma | |

---

## Antigravity — CLI `agy` (1.2.16)

Comprobado con `--help`: `agy --version`, `agy mcp list|add|remove|enable|disable`,
`agy agent` (alias `agy agents`), `agy models`, `agy plugin(s)`, `agy install`,
`agy changelog`, `agy update`, `agy remote-control`, `agy mic-serve`, y los flags
`--print`/`--prompt`, `--output-format`, `--input-format`, `--json-schema`, `--agent`,
`--model`, `--effort`, `--mode`, `--sandbox`, `--dangerously-skip-permissions`,
`--add-dir`, `--conversation`, `--continue`, `--new-project`, `--project`,
`--print-timeout`, `--disable-slash-commands`, `--log-file`, `--remote-control`.

```sh
cd "$PROY"
agy --version
agy mcp list
agy agent
```

> `agy` **no tiene** subcomando `auth` ni `login`. El estado de sesión de Antigravity es
> **NO VERIFICADO**: no hay comando local de solo lectura para consultarlo.

### Pasos

1. **`sync` sin conflictos.**
   `foker sync --target antigravity` y `foker sync --check`.
   *Esperado*: sin cambios, exit 0. Archivos: `AGENTS.md`, `.agents/rules/foker.md`,
   `.agents/rules/foker-{implementer,reviewer}.md`, `.agents/mcp_config.json` y
   `.agents/skills/*`.

2. **Reglas y skills descubiertas.**
   En una sesión de `agy`: pide que cite las reglas activas y las skills disponibles.
   *Esperado*: `AGENTS.md` y `.agents/rules/foker.md` (`trigger: always_on`) como reglas
   incondicionales; `.agents/rules/foker-{implementer,reviewer}.md`
   (`trigger: model_decision`) solo bajo decisión del modelo; las 6 skills de
   `.agents/skills/` bajo descubrimiento progresivo.
   *Si falla*: comprueba el frontmatter. `description` con acentos debe ir entre comillas
   dobles (así lo genera `sync`).
   **NO VERIFICADO**: `agy` no expone listar reglas ni skills por CLI. `agy agent` existe
   pero solo lista agentes incorporados; con un `HOME` aislado devolvió vacío.

3. **Servidor MCP en la lista del anfitrión.** *(bloqueante, ver [fallo 3](#fallo-3))*
   ```sh
   agy mcp list
   ```
   *Esperado hoy*: `No MCP servers configured.`
   *Cómo llegar a `foker`*:
   - **Opción A (global, no versionada)**: `agy mcp add foker -- npx --no-install foker mcp
     --root <ruta-absoluta-del-proyecto>`. Escribe `~/.gemini/config/mcp_config.json`, fuera
     del control de versiones. Nota que `--root .` **no** sirve a nivel global: no hay
     directorio de trabajo de proyecto.
   - **Opción B (en el repo)**: `.agents/plugins/<nombre>/mcp_config.json` +
     `plugin.json`, que es la única ruta de proyecto que Antigravity documenta para MCP.
     **NO VERIFICADO**: no se ha probado esta ruta.
   Registra cuál usaste. Si ninguna deja el servidor visible, la fila queda en **fail** y hay
   que corregir el adaptador.

4. **`foker_status` responde.**
   En la sesión: `llama a foker_status`.
   *Esperado*: versión de Foker, mapa y `trust`.
   *Depende del paso 3*: sin servidor visible, esta fila no puede pasar.

5. **La skill `foker-workflow` se descubre.**
   En la sesión: pide la lista de skills.
   *Esperado*: `foker-workflow` aparece **una sola vez** desde `.agents/skills/`.
   *Si aparece dos veces*: hay otro origen de skills en el workspace (`.claude/skills/` u
   `~/.gemini/config/skills/`) que también la expone; comprueba `agy` con un `HOME` limpio.

6. **Flujo completo hasta `COMPLETED`.**
   Pide el cambio de precio. Antigravity no tiene subagentes declarativos verificados: los
   roles son reglas `model_decision`, así que el rol lo elige el modelo.
   *Esperado*: `foker_task_begin` → `foker_context` → edición → `foker_task_submit` con
   `COMPLETED`.
   *Si el modelo no sigue el flujo*: cita la ruta de `foker-workflow` en el prompt.

7. **Editar `.foker/` y `git push`.** → **n/a** por decisión de diseño
   (`verification.md` los marca n/a): solo las capas C2–C4 protegen en Antigravity (R-11).
   Anota `n/a`, no `pass`.

### Firma Antigravity

| Campo | Valor |
|---|---|
| Fecha | |
| Versión del anfitrión (`agy --version`) | |
| Versión de Foker (`foker --version`) | |
| Ruta usada para el MCP (global / plugin de repo / ninguna) | |
| Resultado (pass / fail / parcial + pasos fallidos) | |
| Firma | |

---

## Resumen de firmas

Una fila por anfitrión; fecha, versión, resultado y firma. Es el registro que debe acabar en
las notas de la release.

| Anfitrión | Versión anfitrión | Versión Foker | Fecha | Resultado | Firma |
|---|---|---|---|---|---|
| Claude Code | | | | | |
| Codex CLI | | | | | |
| OpenCode | | | | | |
| Antigravity (`agy`) | | | | | |

## Matriz de cobertura de `verification.md`

| Fila de `verification.md` | Claude Code | OpenCode | Antigravity | Codex CLI |
|---|---|---|---|---|
| `sync --target` sin conflictos | §Claude 2 | §OpenCode 1 | §Antigravity 1 | §Codex 3 |
| Servidor `foker` en la lista MCP | §Claude 3 | §OpenCode 5 | §Antigravity 3 (bloqueado) | §Codex 4 |
| `foker_status` con versión y mapa | §Claude 4 | §OpenCode 6 | §Antigravity 4 | §Codex 5 |
| Skill `foker-workflow` descubierta | §Claude 5 | §OpenCode 7 | §Antigravity 5 | §Codex 6 |
| `begin → context → editar → submit` = `COMPLETED` | §Claude 7 | §OpenCode 8 | §Antigravity 6 | §Codex 8 |
| Editar `.foker/` bloqueado | §Claude 8 | §OpenCode 9 | n/a | §Codex 10 (PENDIENTE) |
| `git push` bloqueado | §Claude 9 | §OpenCode 10 | n/a | §Codex 11 (PENDIENTE) |

---

## Fallos previstos

Detectados antes de la firma, con evidencia. Ninguno se ha corregido aquí.

### Fallo 1 — `npx --no-install foker` falla si Foker no está instalado

**Severidad**: bloqueante para toda la columna MCP. Es el fallo conocido; se resuelve con la
instalación local por tarball (fase siguiente).

Evidencia (proyecto de prueba, sin `foker` en el PATH):

```console
$ npx --no-install foker mcp --root .
npm error code E404
npm error 404 Not Found - GET https://registry.npmjs.org/foker - Not found
npm error 404  'foker@*' is not in this registry.
```

```console
$ opencode mcp list
✗ foker  failed: Connection closed
```

Prueba de que **la configuración es correcta** y el único bloqueante es la instalación: con
un shim `node_modules/.bin/foker` que invoca el CLI del worktree,

```console
$ npx --no-install foker --version
0.0.0
$ opencode mcp list
✓ foker  connected
```

Además `--no-install` no evita la red: npx intenta resolver `foker` en el registro y solo
falla con 404. Sin red, el síntoma será otro error de npx, no un fallo limpio.

**Acción**: instalar desde tarball antes de la fase 0 (ver [Orden recomendado](#orden-recomendado)).

### Fallo 2 — `foker sync --target X` borra los archivos de los targets anteriores

**Severidad**: alta; destruye trabajo de configuración si se sincroniza target a target.

Cada `sync` calcula lo deseado **solo** para sus targets y retira (`-`) del manifiesto todo lo
que un sync anterior generó y ya no corresponde. Encadenar un target por cada anfitrión
deja el proyecto con el último.

Evidencia:

```console
$ foker sync --target claude-code
- .agents/mcp_config.json
- .agents/rules/foker-implementer.md
- .codex/config.toml
- opencode.json
...
$ foker sync --target opencode
~ .agents/skills/foker-workflow/SKILL.md
- .claude/agents/foker-implementer.md
- .claude/settings.json
- .mcp.json
...
$ foker sync --target codex
- .agents/mcp_config.json
- .agents/rules/foker-implementer.md
- .agents/rules/foker.md
```

Tras la secuencia solo quedaban `AGENTS.md`, `.agents/skills/`, `.codex/` y `CLAUDE.md`
(sin bloque). Un `foker sync` a secas restauró los 4 targets.

**Acción**: usar `foker sync` sin `--target` (o `init --targets a,b,c,d`) una vez. En el
checklist, `--target` solo para verificar el `--check` de un anfitrión, sabiendo que
elimina el resto.

### Fallo 3 — Antigravity no lee `.agents/mcp_config.json`

**Severidad**: bloqueante para la columna MCP de Antigravity.

La CLI `agy` 1.2.16 solo conoce dos ubicaciones para servidores MCP, y ninguna es la que
escribe el adaptador:

```console
$ agy mcp list          # desde el proyecto, con .agents/mcp_config.json presente
No MCP servers configured.
```

Con `HOME` aislado, `agy mcp add` escribe en el único sitio que la CLI gestiona:

```console
$ HOME="$TMP/agy-home" agy mcp add probe -- echo hello
Added MCP server "probe" (stdio)
$ find "$TMP/agy-home" -type f
.../agy-home/.gemini/config/mcp_config.json
```

La documentación embebida en el propio binario (`agy`) lo confirma: *"**Global
Configuration**: `~/.gemini/config/mcp_config.json`"* y *"**Plugin Configuration**:
`plugins/<plugin_name>/mcp_config.json`"*. Para el proyecto, `.agents/` se documenta solo
para reglas, skills y plugins; MCP no aparece entre las personalizaciones del proyecto.

La configuración generada sí tiene la forma correcta (`mcpServers.foker` con `command`/`args`,
igual que `.mcp.json`), pero está en una ruta que Antigravity no consulta.

Código responsable (no corregido):
`packages/integrations/src/adapters/antigravity.ts:19-24`.

**Acción**: decidir entre la ruta global (fuera de VCS) o un plugin de repo
(`.agents/plugins/<nombre>/mcp_config.json` + `plugin.json`, **NO VERIFICADO**), y corregir
el adaptador. Requiere decisión de contrato → ADR.

### Fallo 4 — `foker doctor` sondea `agy` para Antigravity (corregido en FKR-099)

El diagnóstico usa un mapa explícito de target a binario: `claude-code` → `claude`,
`codex` → `codex`, `opencode` → `opencode`, `antigravity` → `agy`.
Para Antigravity ejecuta `agy --version` y conserva el id `host:antigravity`.
Si el binario está disponible, ese check devuelve `ok`; la sesión sigue siendo
PENDIENTE de verificación manual porque `agy` no tiene subcomando `auth` ni `login`.

### Fallo 5 — Codex necesita confianza de proyecto explícita para leer `.codex/config.toml`

**Severidad**: media; parece un fallo de `sync` cuando es de configuración de Codex.

Con `CODEX_HOME` limpio y el proyecto sin marcar, Codex ignora el `.codex/config.toml` del
proyecto:

```console
$ codex mcp get foker --json
Error: No MCP server named 'foker' found.     # exit 1
```

Tras añadir `projects."<ruta>".trust_level = "trusted"` a `$CODEX_HOME/config.toml`:

```console
$ codex mcp get foker --json
{ "name": "foker", "enabled": true,
  "transport": { "type": "stdio", "command": "npx",
                 "args": ["--no-install","foker","mcp","--root","."], "env": null } }
```

Aviso adicional, inocuo pero ruidoso: si `CODEX_HOME` está bajo `/tmp`, Codex imprime
`Refusing to create helper binaries under temporary dir` en cada invocación.

**Acción**: documentado en el paso Codex 1 del checklist.

### Fallo 6 — `--strict-config` de Codex no valida el bloque `[agents.*]`

**Severidad**: baja-media; explica por qué `verification.md` no podía cerrar la validación
estricta de roles. A favor, hay una invocación que sí funciona.

`--strict-config` no es soportado por `mcp` ni por `debug`:

```console
$ codex --strict-config mcp get foker
Error: `--strict-config` is not supported for `codex mcp`
$ codex --strict-config debug prompt-input
Error: `--strict-config` is not supported for `codex debug`
```

Pero sí funciona con `doctor`, y con la config de Foker no protesta:

```console
$ codex --strict-config doctor --summary --no-color | grep config
  ✓ config       loaded
```

Alcance real de la comprobación, medido:

- Una **clave de nivel superior** inventada (`[foker_bogus_top]`) sí degrada el resultado a
  `⚠ config       config loaded`.
- Una **clave anidada** inventada, tanto dentro de `[agents."foker-reviewer"]` como dentro de
  `[mcp_servers.foker]`, deja `✓ config       loaded`: **no se detectan**.

Es decir, `--strict-config` valida el nivel superior pero **no** los campos anidados de
`agents.<rol>.config_file` ni `developer_instructions`. La invocación del checklist es útil,
pero no certifica la configuración de roles; eso sigue requiriendo la sesión del paso 9 de
Codex.

### Fallo 7 — OpenCode: el permiso `bash: ask` del rol puede re-degradar los `deny` del proyecto

**Severidad**: alta; afecta a la fila "`git push` se bloquea" con `foker-implementer`.

El adaptador escribe permisos por rol en el archivo del agente:

```ts
// packages/integrations/src/adapters/opencode.ts:6
const bash = role.native === 'edit' ? 'ask' : 'deny';
```

`opencode debug agents` muestra el orden final para `foker-implementer`:

1. config global (incluye `shell "git push *" -> ask`)
2. `permission` del proyecto (los `deny` de Foker, incluido `shell "git push *" -> deny`)
3. **el bloque del propio rol, al final**: `edit "*" -> allow`, `shell "*" -> ask`

OpenCode evalúa los permisos **recorriendo la lista en orden inverso y devuelve la primera
regla que coincide** (`for (let n = r.length - 1; n >= 0; n--) { ... return s }`). Con esa
semántica, `shell "*" -> ask` del rol coincide con `git push *` y **gana al `deny` del
proyecto**: el resultado sería *preguntar* en lugar de *negar*.

`foker-reviewer` no sufre el problema: su bloque termina en `edit "*" -> deny` y
`shell "*" -> deny`.

No se pudo confirmar en sesión (haría falta ejecutar `git push` desde el modelo). Queda
como predicción con base en el código, y los pasos 9 y 10 de OpenCode lo comprueban por
separado para el agente principal y para el subagente.

Aparte, tu `~/.config/opencode/opencode.jsonc` global tiene
`shell: "git push *" -> "ask"`, anterior en la lista pero cubierto por los `deny` del
proyecto: correcto para el agente principal, no para el subagente por lo anterior.

**Acción**: decidir si el rol debe llevar `bash: deny` (o no declarar `bash` en absoluto,
dejando heredar los `deny` del proyecto). Toca el adaptador y merece prueba de regresión.

---

## Comandos NO VERIFICADOS

No se pudieron comprobar sin iniciar sesión, sin suscripción o sin tocar credenciales. Si el
checklist los da por buenos sin ejecutarlos, la tabla de `verification.md` seguirá
pendiente.

| Comando / afirmación | Por qué no se verificó |
|---|---|
| `claude` — listar skills y agentes por CLI | 2.1.289 no expone subcomando; `--agents` define, no lista. Es interactivo (`/skills`, `/agents`). |
| `agy` — estado de sesión | `agy` no tiene subcomando `auth`, `login` ni `status`. |
| `agy` — listar reglas o skills por CLI | No existe tal subcomando; `agy agent` solo lista agentes incorporados (devolvió vacío con `HOME` aislado). |
| `agy` — descubrimiento vía `.agents/plugins/<n>/mcp_config.json` | Ruta deducida de la documentación embebida en el binario, no probada. |
| `agy models`, `agy run` | Requieren red y cuota de modelo. |
| `opencode auth list` | Lista integraciones y credenciales; no se ejecutó por política de no leer credenciales. |
| `opencode mcp list --standalone` / con directorio posicional | **Confirmado que NO existen**: `Unrecognized flag: --standalone` y `Unexpected positional argument`. Ejecutar siempre desde `$PROY`. |
| Por qué `opencode mcp list` devuelve `No MCP servers configured` en la primera llamada | Falso negativo observado dos veces (OpenCode 2.0.20 contra el servicio en segundo plano). Se documenta el síntoma y el rodeo (repetir el comando); la causa interna no se investigó. |
| Claude Code: aprobar el MCP por CLI | No hay subcomando; solo el prompt interactivo del primer `claude`. |
| Codex: invocación real de `foker-implementer` / `foker-reviewer` | Requiere sesión y modelo. `debug prompt-input` confirma que los cuerpos de rol **no** entran en el prompt base (se invoquan bajo demanda). |
| Codex: validación estricta de `agents.<rol>.config_file` | `--strict-config` no llega a campos anidados (ver [fallo 6](#fallo-6)). |
| Codex: bloqueo de `.foker/` y de `git push` | Requiere sesión; sigue PENDIENTE en `verification.md`. |
| OpenCode: `git push` bloqueado en `foker-implementer` | Requiere sesión; predicción en [fallo 7](#fallo-7). |
| OpenCode: nº de entradas de `foker-workflow` en el listado (RIESGO R-10) | Requiere sesión. En local, los `SKILL.md` de `.claude/skills` y `.agents/skills` son idénticos byte a byte. |
| `foker trust --yes` sin `--ci` | Falla por diseño: `FKR-INP-001: --yes exige --ci y CI=true`. |

## Nota sobre `biome` y Markdown

`./node_modules/.bin/biome check docs` **no aplica**: Biome 2.5.15 no procesa `.md` y
responde `Checked 0 files … These paths were provided but ignored: docs`. Los cambios en
`docs/` no pasan por el formateador; hay que revisar el formato a mano (2 espacios, líneas
de 120 como referencia, tablas Markdown bien cerradas).

## Revisión del orquestador (Claude, 2026-10-05)

| Fallo | Clasificación | Motivo |
|---|---|---|
| 1 · `npx --no-install foker` | VÁLIDO | Se resuelve con la instalación desde tarball local (fase 4, paso 9) |
| 2 · `sync --target X` borra otros targets | NO VÁLIDO como bug | FOKER-SPEC §14 («cambiar de agente = `foker sync --target <nuevo>`») define `--target` como el conjunto deseado. Para varios anfitriones: `--target claude-code,codex,opencode,antigravity`. Hay que documentarlo en `docs/cli.md` |
| 3 · Antigravity no lee `.agents/mcp_config.json` | VÁLIDO | Reproducido con `HOME` aislado y `agy` 1.2.17: `No MCP servers configured`. Cambiar la ruta exige ADR (contrato de §14.2); issue nueva |
| 4 · `doctor` busca `antigravity` | CORREGIDO (FKR-099) | Mapa explícito de binarios; Antigravity se sondea con `agy --version` y conserva `host:antigravity` |
| 5 · Codex exige confianza de proyecto | VÁLIDO (documentación) | Paso manual en el checklist |
| 6 · `--strict-config` no valida bloques anidados | VÁLIDO (limitación del anfitrión) | No depende de Foker |
| 7 · OpenCode `bash: ask` del rol frente a `deny` | PLAUSIBLE, sin reproducir | Afecta a seguridad (`git push`); se verifica con sesión real en el paso manual de OpenCode antes de firmar |
