# Colaboradores / Collaborators

## Español

### Creador y arquitecto principal

- **Luis** ([@Luis000923](https://github.com/Luis000923), [Foker](https://github.com/Luis000923/Foker.git)):
  arquitectura central, motor de contexto AST, orquestación sin configuración y seguridad coercitiva por
  diseño (OWASP ASVS Nivel 2).

### Agradecimientos a proyectos upstream

Foker reimplementa de forma independiente ideas de estos proyectos (ver [NOTICE](NOTICE) y
[ADR-039](docs/adr/ADR-039-integracion-proyectos-upstream.md)).

| Proyecto | Autoría | Licencia | Papel en Foker |
|---|---|---|---|
| [vercel-labs/skills](https://github.com/vercel-labs/skills.git) | Vercel Labs Team y colaboradores | MIT | Base del modelo de `foker skill`: resolución sin configuración, instalación y carga no interactiva (`--yes`). |
| [JuliusBrussee/caveman](https://github.com/JuliusBrussee/caveman.git) | Julius Brussee ([@JuliusBrussee](https://github.com/JuliusBrussee)) y colaboradores | Apache-2.0 / MIT | Directiva de salida ASD-STE100 y compresión determinista de cargas (JSON, YAML, CSV, logs) en `@foker/engine`. |
| [mukul975/Anthropic-Cybersecurity-Skills](https://github.com/mukul975/Anthropic-Cybersecurity-Skills.git) | Mukul Jangra ([@mukul975](https://github.com/mukul975)) y colaboradores | Apache-2.0 | Referencia para las reglas defensivas de `foker check-security` (OWASP ASVS Nivel 2, seguridad de agentes de IA) en `@foker/policy`. |
| [nexu-io/open-design](https://github.com/nexu-io/open-design.git) | Nexu-io / OpenDesign Team ([@nexu-io](https://github.com/nexu-io), [@nettee](https://github.com/nettee)) y colaboradores | Apache-2.0 | Inspiración de los esquemas de Design Tokens estáticos (tipografía, color, modo oscuro). Sin el demonio gráfico. |

## English

### Creator and lead architect

- **Luis** ([@Luis000923](https://github.com/Luis000923), [Foker](https://github.com/Luis000923/Foker.git)):
  core architecture, AST context engine, zero-config orchestration and coercive security by design
  (OWASP ASVS Level 2).

### Upstream acknowledgments

Foker independently reimplements ideas from these projects (see [NOTICE](NOTICE) and
[ADR-039](docs/adr/ADR-039-integracion-proyectos-upstream.md)).

| Project | Authors | License | Role in Foker |
|---|---|---|---|
| [vercel-labs/skills](https://github.com/vercel-labs/skills.git) | Vercel Labs Team and contributors | MIT | Basis of the `foker skill` model: zero-config resolution, install and non-interactive loading (`--yes`). |
| [JuliusBrussee/caveman](https://github.com/JuliusBrussee/caveman.git) | Julius Brussee ([@JuliusBrussee](https://github.com/JuliusBrussee)) and contributors | Apache-2.0 / MIT | ASD-STE100 output directive and deterministic payload compression (JSON, YAML, CSV, logs) in `@foker/engine`. |
| [mukul975/Anthropic-Cybersecurity-Skills](https://github.com/mukul975/Anthropic-Cybersecurity-Skills.git) | Mukul Jangra ([@mukul975](https://github.com/mukul975)) and contributors | Apache-2.0 | Reference for the defensive rules of `foker check-security` (OWASP ASVS Level 2, AI agent security) in `@foker/policy`. |
| [nexu-io/open-design](https://github.com/nexu-io/open-design.git) | Nexu-io / OpenDesign Team ([@nexu-io](https://github.com/nexu-io), [@nettee](https://github.com/nettee)) and contributors | Apache-2.0 | Inspiration for the static Design Tokens schemas (typography, color, dark mode). No graphical daemon. |
