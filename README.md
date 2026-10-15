# Foker

<p align="center">
  <img src="assets/foker-logo.png" width="520" alt="Foker — infraestructura determinista para agentes de IA">
</p>

Foker es infraestructura determinista para que agentes de IA (Claude Code, OpenCode, Google
Antigravity, Codex u otro cliente MCP) desarrollen software en monorepos TypeScript con menos
contexto y más seguridad.

> **Estado**: beta `0.1.0-beta.0`, publicada en npm como [`@foker/cli`](https://www.npmjs.com/package/@foker/cli)
> (el comando se llama `foker`). Las cifras de ahorro de tokens aún no están medidas con un
> benchmark; no las des por ciertas.

## Empieza aquí

Instala Foker **desde la carpeta del proyecto que quieres gestionar**, no desde tu directorio
personal. No necesita claves de API de IA. Si aún no tienes un proyecto, créalo primero con
`npm init -y`. Después inicialízalo, revisa los comandos que autorizarás y crea el mapa:

```sh
npm install -D @foker/cli@beta
npx foker init --targets codex
npx foker trust
npx foker map
npx foker sync --target codex
npx foker doctor
```

Abre luego el proyecto en tu agente anfitrión. Para realizar una tarea, el flujo es siempre:

1. Crear una tarea con un alcance pequeño y explícito.
2. Pedir a Foker el contexto mínimo de esa tarea.
3. Modificar solo los archivos incluidos en el alcance.
4. Enviar la tarea para que Foker ejecute los checks y registre evidencia.

```sh
npx foker task begin "Corregir el cálculo" --scope 'src/**' --profile default --json
npx foker context --task <task_id> --anchor src/calculo.ts
# Realiza los cambios dentro del alcance indicado.
npx foker task submit <task_id> --summary "Cálculo corregido"
```

Una tarea solo está terminada cuando `submit` devuelve `COMPLETED` o cuando Foker solicita la
aprobación humana correspondiente. Consulta [Primeros pasos](docs/getting-started.md) para el
flujo completo y [Agentes](docs/agents.md) para las instrucciones que debe seguir el agente.

## Plataformas soportadas

Foker funciona en **macOS** (Intel y Apple Silicon), **Linux** (x64 y ARM64, glibc) y **Windows**
(x64). El núcleo nativo llega como un paquete por plataforma (`@foker/core-<plataforma>`) instalado
como `optionalDependencies`: cada sistema descarga solo el suyo y nada se descarga en tiempo de
ejecución. Alpine (musl), FreeBSD y Windows ARM64 no tienen binario en la beta; ahí `@foker/core`
lanza `FKR-INT-003` y se puede compilar desde el código fuente (`pnpm build:native`, requiere Rust).

## Instalación

Requisitos: Node.js 22.14 o superior y Git. No hace falta ninguna clave de API: Foker no llama a LLMs;
el agente anfitrión (Claude Code, OpenCode, Antigravity o Codex) usa su propia sesión.

Instálalo como dependencia de desarrollo **desde la raíz del proyecto**, porque los archivos que
genera `foker sync` invocan `npx --no-install foker`. La guía usa npm para evitar que una
configuración global de otro gestor (como Yarn) interfiera; si el proyecto ya usa pnpm, sustituye
`npm install -D` por `pnpm add -D` y `npx foker` por `pnpm exec foker`:

```sh
npm install -D @foker/cli@beta
npx foker --version             # 0.1.0-beta.0
npx foker doctor                # comprueba Node, addon nativo, git e integraciones
```

El paquete se llama `@foker/cli`, no `foker`: npm rechazó ese nombre por parecerse a `faker` y `bower`.
Instalar la CLI trae solo el addon nativo de tu plataforma. Si `doctor` indica que falta, consulta
[Plataformas soportadas](#plataformas-soportadas).

## Uso rápido

En un repositorio existente (dentro de él, con la CLI instalada):

```sh
npx foker init --targets claude-code    # config, reglas y archivos del anfitrión; --dry-run para revisar
npx foker trust                         # muestra los comandos y pide confirmación (terminal interactiva)
npx foker map                           # construye el Project Map
npx foker doctor                        # diagnóstico final
```

`--targets` acepta `claude-code`, `opencode`, `antigravity` y `codex`, separados por comas; sin él usa los
detectados. Tras `init`, abre el proyecto en el agente: este llama a Foker por MCP (`foker mcp`) y por los
archivos generados. Si cambias la configuración, ejecuta `npx foker sync`.

Para un proyecto nuevo con la plantilla `nextjs-turbo`:

```sh
pnpm exec foker init mi-proyecto --template nextjs-turbo --targets claude-code
cd mi-proyecto && pnpm install
```

Flujo de una tarea desde la CLI (el agente usa las mismas operaciones por MCP):

```sh
npx foker task begin "Corregir el cálculo" --scope 'src/**' --json    # devuelve el task_id
npx foker context --task <task_id> --anchor src/calculo.ts            # contexto mínimo para el agente
# ...el agente edita dentro del alcance...
npx foker task submit <task_id> --summary "Cálculo corregido"         # ejecuta los checks
npx foker check-security                                              # reglas defensivas estáticas
```

Una tarea solo termina cuando pasan los checks; las aprobaciones humanas (`foker task approve`) exigen
terminal interactiva. Guía completa: [Primeros pasos](docs/getting-started.md).

## Qué aporta

1. **Conocimiento estructural**: un Project Map (qué existe, dónde y qué depende de qué), calculado
   con tree-sitter y PageRank, sin gastar tokens.
2. **Contexto mínimo suficiente**: un Context Engine que decide de forma reproducible qué ve el agente.
3. **Verdad determinista**: gates y checks deciden si una tarea está terminada; el LLM nunca lo decide.
4. **Gobierno**: Skills, roles y políticas versionados en el repo y exportados al formato nativo de
   cada agente.
5. **Seguridad por defecto**: `foker check-security` aplica 15 reglas estáticas inspiradas en OWASP
   ASVS Nivel 2 y la plantilla incluye CSP, HSTS y Design Tokens. No equivale a cumplir ASVS.

Foker no ejecuta un bucle LLM propio: el agente anfitrión usa Foker a través de su servidor MCP y de
los archivos que genera `foker sync`.

## Comandos

| Comando | Función |
|---|---|
| `foker init` | Inicializa Foker en un repo o crea uno desde la plantilla `nextjs-turbo` |
| `foker map` | Construye o refresca el Project Map |
| `foker context "<tarea>"` | Construye un Context Pack |
| `foker mcp` | Arranca el servidor MCP stdio |
| `foker validate` | Ejecuta un perfil de checks |
| `foker task <sub>` | Gestiona tareas (`begin`, `submit`, `approve`…) |
| `foker skill <sub>` | Lista, valida, crea e instala Skills (`foker skill install --yes`) |
| `foker check-security` | Reglas defensivas estáticas (OWASP ASVS Nivel 2) |
| `foker sync` | Genera la configuración de cada agente anfitrión |
| `foker doctor` | Diagnóstico del entorno |

Detalle completo: [referencia CLI](docs/cli.md).

## Documentación

- [Primeros pasos](docs/getting-started.md)
- [Arquitectura](docs/architecture.md)
- [Configuración](docs/configuration.md) y [trust/checks](docs/config-trust-exec.md)
- [CLI](docs/cli.md)
- [Project Map](docs/project-map.md) y [Context Engine](docs/context-engine.md)
- [Agentes](docs/agents.md), [tareas](docs/tasks.md) y [skills](docs/skills.md)
- [MCP](docs/mcp.md)
- [Integraciones](docs/integrations/README.md)
- [Plantilla nextjs-turbo](docs/templates.md)
- [Seguridad](docs/security.md), [hallazgos y secretos](docs/findings-secrets.md) y [divulgación](SECURITY.md)
- [Decisiones de arquitectura (ADR)](docs/adr/README.md)
- [Contribuir](CONTRIBUTING.md) y [desarrollo](docs/development.md)

## Créditos

Ver [COLLABORATORS.md](COLLABORATORS.md) y [NOTICE](NOTICE).
