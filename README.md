# Foker

Foker es infraestructura determinista para que agentes de IA (Claude Code, OpenCode, Google
Antigravity, Codex u otro cliente MCP) desarrollen software en monorepos TypeScript con menos
contexto y más seguridad.

> **Estado**: versión previa, sin publicar en npm. Las cifras de ahorro de tokens aún no están
> medidas con un benchmark; no las des por ciertas.

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
