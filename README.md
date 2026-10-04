# Foker

Foker es infraestructura determinista para que agentes de IA (Claude Code, OpenCode, Google
Antigravity u otro cliente MCP) desarrollen software en monorepos TypeScript con menos contexto y
más seguridad.

> **Estado**: MVP implementado en local: mapa, contexto, políticas, tareas, MCP, CLI,
> integraciones y plantilla. No hay versión publicada (PENDIENTE FKR-080); faltan benchmark
> (FKR-010…018/037) y verificación manual de anfitriones (FKR-070). La especificación normativa está en
> [`spec/FOKER-SPEC.md`](spec/FOKER-SPEC.md).

## Qué aporta

1. **Conocimiento estructural**: un Project Map (qué existe, dónde y qué depende de qué), calculado
   con tree-sitter y PageRank, sin gastar tokens.
2. **Contexto mínimo suficiente**: un Context Engine que decide de forma reproducible qué ve el agente.
3. **Verdad determinista**: gates y checks deciden si una tarea está terminada; el LLM nunca lo decide.
4. **Gobierno**: Skills, roles y políticas versionados en el repo y exportados al formato nativo de
   cada agente.

Foker no ejecuta un bucle LLM propio en el MVP: el agente anfitrión usa Foker a través de su
servidor MCP y de los archivos que genera `foker sync`.

## Hipótesis que el MVP debe demostrar

- **H1**: el mismo agente y modelo consume al menos un 30 % menos de tokens de entrada por tarea
  exitosa con Foker, sin perder más de 5 puntos de tasa de éxito.
- **H2**: con Foker, la precisión del contexto es mayor y se modifican menos archivos fuera de alcance.

El benchmark (FOKER-SPEC §20) confirma o refuta ambas. La cifra "18:1" de la investigación previa
es una hipótesis informativa de compresión, no un criterio de éxito.

## CLI implementada (MVP)

| Comando | Función |
|---|---|
| `foker init` | Inicializa Foker en un repo o crea uno desde la plantilla `nextjs-turbo` |
| `foker map` | Construye o refresca el Project Map |
| `foker context "<tarea>"` | Construye un Context Pack |
| `foker mcp` | Arranca el servidor MCP stdio |
| `foker validate` | Ejecuta un perfil de checks |
| `foker task <sub>` | Gestiona tareas (`begin`, `submit`, `approve`…) |
| `foker skill <sub>` | Lista, valida y crea Skills |
| `foker sync` | Genera la configuración de cada agente anfitrión |
| `foker doctor` | Diagnóstico del entorno |

Detalle completo: [referencia CLI](docs/cli.md) y FOKER-SPEC §16.

## Documentación

- [Primeros pasos](docs/getting-started.md)
- [Arquitectura](docs/architecture.md)
- [Configuración (generada)](docs/configuration.md) y [trust/checks](docs/config-trust-exec.md)
- [CLI (generada)](docs/cli.md)
- [Project Map](docs/project-map.md) y [Context Engine](docs/context-engine.md)
- [Agentes](docs/agents.md), [tareas](docs/tasks.md) y [skills](docs/skills.md)
- [MCP](docs/mcp.md)
- [Integraciones](docs/integrations/README.md) y [verificación manual](docs/integrations/verification.md)
- [Plantilla nextjs-turbo](docs/templates.md)
- [Seguridad](docs/security.md), [hallazgos y secretos](docs/findings-secrets.md) y [divulgación](SECURITY.md)
- [Tests](docs/testing.md) y [benchmark (diseño y pendientes)](docs/benchmark.md)
- [Desarrollo](docs/development.md)
- [Roadmap](docs/roadmap.md)
- [ADRs](docs/adr/README.md)
- [Contribuir](CONTRIBUTING.md)
- [Estado actual](docs/ESTADO.md)
