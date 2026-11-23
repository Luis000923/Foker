# Asistente de requisitos

`foker init` (salvo `--skip-spec`) y `foker spec` convierten la idea de una app o sitio web en una
especificación que el agente anfitrión puede ejecutar con pocas preguntas. Decisión: [ADR-042](adr/ADR-042-asistente-de-requisitos.md).

## Archivos generados

| Archivo | Contenido |
|---|---|
| `REQUIREMENTS.md` | Documento maestro, secciones fijas (abajo) |
| `foker/requirements.answers.json` | Respuestas canónicas (`requirements-answers/v1`); regeneran el Markdown byte a byte |
| `foker/design-tokens.json` | Design Tokens v1 |
| `apps/web/app/tokens.css` (plantilla) o `foker/tokens.css` | Variables CSS claro/oscuro |

Foker no modifica un `README.md` existente: crea el enlace solo en el README nuevo de la plantilla y,
si no, avisa.

## Modos

| Situación | Comportamiento |
|---|---|
| TTY | Entrevista en 4 bloques: propósito y alcance, arquitectura, identidad visual, restricciones. Enter acepta el default; un valor inválido se repite hasta 3 veces |
| `--answers <archivo>` | JSON o YAML (≤ 256 KiB, sin alias). No pregunta |
| Sin TTY, `--ci`, `--non-interactive` o `CI=true` sin `--answers` | No pregunta: omite con aviso y exit 0 |
| `--skip-spec` (init) | No ejecuta el asistente |
| Ctrl+C / EOF | Cancela (exit 130 en la CLI); no se escribe ningún archivo, tampoco los de `init` |
| Archivo existente distinto | TTY: pregunta. Si no: FKR-INP-001. `--force` sobrescribe y guarda copia en `.foker/backups/<fecha>/` |

Todas las escrituras son atómicas (temporal + `fsync` + `rename`) y rechazan symlinks en la ruta.

## Respuestas mínimas

```json
{ "schema_version": 1, "idea": "Tienda de café de especialidad con suscripción", "product": { "type": "ecommerce" } }
```

Esquema completo: `packages/schemas/schemas/requirements-answers.schema.json`. Tipos: `landing`, `saas`,
`ecommerce`, `dashboard`, `blog`, `portfolio`, `other`; cada uno trae rutas, entidades, auth e
integraciones por defecto. Estilos: `minimal`, `corporate`, `editorial`, `creative`, `playful`, con
paleta y par tipográfico recomendados.

## Secciones de REQUIREMENTS.md

| Id (`--spec`) | Encabezado |
|---|---|
| `summary` | `## Resumen` |
| `scope` | `## Alcance` |
| `routes` | `## Rutas` |
| `data` | `## Modelo de datos` |
| `auth` | `## Autenticación e integraciones` |
| `design` | `## Design Tokens` |
| `rules` | `## Reglas de negocio y calidad` |
| `backlog` | `## Backlog de tareas` |
| `acceptance` | `## Criterios de aceptación` |

`foker context "<tarea>" --spec routes,design` añade a las reglas solo esas secciones. Cada fila del
backlog indica sus ids en la columna **Spec**, su alcance para `--scope` y sus criterios binarios
(`AC-Tnn-m`) con la verificación (`foker validate`, test concreto o `grep`).

## Contraste

Pares comprobados por modo: `foreground` sobre `background` y `surface`, `muted_foreground` sobre
`background` y `muted`, cada `*_foreground` sobre su color, y `danger` sobre `background` (≥ 4,5:1);
`primary` sobre `background` (≥ 3:1, componente de interfaz). Si un color del usuario no cumple, se
aclara u oscurece en pasos del 5 % hasta cumplir y el cambio aparece en la tabla de ajustes y como aviso.
El modo oscuro se deriva con fondos neutros y colores de marca aclarados.

## Seguridad

- Las respuestas se validan con el esquema: rutas con patrón estricto, tipografías limitadas a
  `[A-Za-z0-9 ,'"-]` (sin inyección CSS), colores `#rrggbb`, longitudes y número de elementos acotados.
- Cada texto libre se normaliza a una línea, sin caracteres de control ni marcas bidi; `<`, `>` y `&`
  pasan a entidades y `` ` `` `*` `_` `[` `]` `|` `~` `\` (más `#`, `-`, `+` iniciales) se escapan.
  No puede abrir bloques, encabezados, celdas, enlaces ni comentarios HTML.
- El documento declara que los valores son datos de producto. Los textos con forma de instrucción
  («ignore previous instructions»…) se marcan con ⚠ para revisión humana; no se bloquean.
- Los comandos `foker task begin` del backlog usan comillas simples y un título filtrado.
