# Primeros pasos

Foker aporta contexto y validación; el bucle LLM pertenece al anfitrión. Necesita Node ≥ 22.14
y el addon nativo de la plataforma. Ninguna clave API de IA es obligatoria: usa la sesión
de tu suscripción del anfitrión (Claude Code, Codex/ChatGPT o Antigravity). Foker no llama a LLMs. **PENDIENTE FKR-080**: publicación npm y reserva de nombres
(PREGUNTA-3). La instalación prevista en el proyecto es `pnpm add -D foker`; los comandos de esta
guía usan ese paquete local. Hoy, para desarrollar Foker, sigue [development.md](development.md)
y compila TS y el addon; la CLI compilada está en `packages/cli/dist/bin.js`.

## Instalación local (sin npm)

Sin publicar Foker en el registro npm, con las dependencias instaladas y TypeScript y
el addon nativo ya compilados, ejecuta desde la raíz de este repositorio:

```sh
node scripts/pack-local.mjs
# Otra salida: node scripts/pack-local.mjs --out /ruta/al/lote
```

Genera ocho tarballs en `dist-local/` (ignorado por git): la CLI, sus seis paquetes
`@foker/*` y el paquete nativo del host actual. El empaquetado es offline y no modifica
los manifiestos originales; solo las dependencias workspace de los manifiestos raíz de los
paquetes quedan con versiones exactas. Los manifiestos anidados, incluidas las plantillas
de la CLI, se conservan byte a byte con sus referencias `workspace:*`.
El lote es específico del sistema, arquitectura y libc del host; Linux musl no está soportado.

Instala en otro proyecto, nunca dentro del repositorio de Foker. npm puede fallar con
`Cannot read properties of null (reading 'edgesOut')` sobre el `node_modules` de pnpm
del repositorio de Foker.

En un proyecto limpio con npm:

1. Ejecuta `npm init -y`.
2. Copia el bloque `overrides` de `dist-local/install-local.json` al `package.json`
   del proyecto: contiene solo los seis paquetes `@foker/*` y el paquete de plataforma,
   sin entrada para `foker`. Sus rutas absolutas apuntan a los tarballs locales.
3. Instala directamente el tarball cuya ruta absoluta figura en el campo `foker` de
   `install-local.json`, fuera de `overrides` (sustituye la ruta del ejemplo por esa ruta):

   ```sh
   npm install "/ruta/al/lote/foker-0.0.0.tgz"
   npx foker --version
   npx foker doctor
   ```

Para proyectos pnpm, como los creados con `nextjs-turbo`, añade los siete overrides de
`install-local.json` a un mapa `overrides` en el `pnpm-workspace.yaml` de la raíz del
proyecto. Conserva sus campos existentes (incluidos `packages` y los controles de instalación).
Usa las rutas reales del lote para todas las entradas; por ejemplo:

```yaml
overrides:
  '@foker/core': 'file:/ruta/al/lote/foker-core-0.0.0.tgz'
  # Añade también las otras seis entradas de install-local.json.
```

Desde la raíz de ese proyecto instala Foker como dependencia de desarrollo del workspace:

```sh
pnpm add -D -w file:/ruta/al/lote/foker-0.0.0.tgz
pnpm exec foker --version
pnpm exec foker doctor
```

Si mueves el lote, actualiza las rutas de `foker` y de `overrides`.
El README del lote incluye el comando con su ruta y versión reales. No se publica nada;
la instalación puede requerir red o caché para dependencias externas como YAML, Ajv y
el SDK MCP. El empaquetador no las descarga ni prueba la instalación contra el registro.

## Inicializar

En un repositorio existente, con el paquete disponible:

```sh
pnpm exec foker init --targets codex
```

Crea `foker.config.yaml` y `foker/rules.md`, añade `.foker/` al gitignore y ejecuta sync (que
genera la configuración, skills y roles de cada anfitrión). No instala dependencias. Revisa el plan con `--dry-run`; los conflictos requieren intervención.
Los checks se derivan de los scripts `typecheck`, `lint` y `test` del `package.json` raíz (más el
escáner de secretos); init no inventa comandos que tu repo no tenga. Revísalos antes de `foker trust`. Consulta [configuration.md](configuration.md).

Para crear otro proyecto:

```sh
pnpm exec foker init mi-proyecto --template nextjs-turbo --targets codex
cd mi-proyecto
pnpm install
```

El destino debe estar vacío o no existir. Revisa y versiona el lockfile tras instalar.
Consulta [templates.md](templates.md) para límites y comprobaciones de la plantilla.

## Confiar, mapear y conectar

```sh
pnpm exec foker trust
pnpm exec foker map
pnpm exec foker sync --target codex
pnpm exec foker doctor
```

Lee los argv que muestra trust antes de confirmar en TTY. Cambiar comandos, perfiles o allowlist
invalida la confianza; MCP no puede otorgarla. Sync admite también claude-code, opencode y antigravity;
configura el cliente y vuelve a cargarlo según su interfaz. La verificación manual de los cuatro
anfitriones es **PENDIENTE FKR-070**: [integrations/verification.md](integrations/verification.md).
En Codex, inicia sesión con `codex login`, abre el proyecto y revisa que sea confiable
para cargar `.codex/config.toml`. Las skills se generan en `.agents/skills/`; los roles
se registran en el TOML y sus definiciones viven en `.codex/agents/`. Su ejecución
real sigue pendiente de la comprobación manual.
Doctor comprueba CLI y sesión del anfitrión cuando puede, además de entorno, addon, confianza, integraciones y avisa sobre sandbox; no certifica aislamiento.

## Primera tarea desde el anfitrión

Pide al Implementer que use las herramientas MCP en este orden (ejemplo con `src/**`):

1. `foker_task_begin` con `description: "Corregir el cálculo"`, `scope: {paths: ["src/**"]}`
   y `profile: "default"`. Conserva el `task_id` de la respuesta.
2. `foker_context` con `task: "Corregir el cálculo"` y `task_id` obtenido. El anfitrión edita
   con sus herramientas nativas dentro del alcance; puede llamar a `foker_check` para feedback.
3. `foker_task_submit` con ese `task_id`. Atiende `next_action` y los hallazgos; repara y reenvía
   si corresponde. Una aprobación o desbloqueo se hace desde la CLI humana.

Los campos completos están en [mcp.md](mcp.md). No basta con que el agente diga «terminado».

## El mismo flujo desde la CLI

```sh
pnpm exec foker task begin "Corregir el cálculo" --scope 'src/**' --profile default --json
pnpm exec foker context --task <task_id> --anchor src/calculo.ts
# Editar y guardar los archivos del alcance con el editor o anfitrión.
pnpm exec foker task submit <task_id> --summary "Cálculo corregido"
pnpm exec foker task status <task_id>
pnpm exec foker doctor
```

Sustituye `<task_id>` y la ruta por los valores reales. Con `--task`, el pack usa la descripción y
el alcance de la tarea (sección `task_scope`). COMPLETED sale con 0; REJECTED/FAILED con 1;
AWAITING_APPROVAL/BLOCKED con 6. Revisa la evidencia antes de `foker task approve <task_id>`;
las acciones humanas exigen TTY y confirmación (excepción de CI explícito documentada en [cli.md](cli.md)).
Más detalle: [agents.md](agents.md), [tasks.md](tasks.md) y [security.md](security.md).
