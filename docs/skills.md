# Skills de Foker

El catálogo combina las skills incluidas con las de `foker/skills/<name>/`.
La versión del proyecto sombrea a la incluida; `skills.disabled` en la configuración
oculta ambos orígenes. No se ejecutan scripts de skills.

Cada directorio contiene `SKILL.md` con frontmatter Agent Skills y
`foker.skill.yaml` conforme a `packages/schemas/schemas/foker-skill.schema.json`.
El nombre (1–64 caracteres, minúsculas ASCII, números y guiones simples internos)
debe coincidir en directorio, frontmatter y contrato. La descripción tiene 1–1024
caracteres. Los campos portables son name, description, license, compatibility,
metadata y allowed-tools; otros campos producen avisos.

El contrato declara triggers, constraints, tools, outputs, permissions y checks
existentes del perfil (las incluidas usan typecheck, lint y test).
`workflow_ref` apunta a un encabezado, por ejemplo `SKILL.md#procedimiento`.
El slug usa minúsculas, quita puntuación y convierte espacios en guiones.
`required_context.files/symbols` aporta anclas débiles al contexto.
Los permisos de escritura se intersecan con el alcance y la política: nunca
amplían la autorización. Omitir write_paths conserva el alcance; una lista vacía
no permite escrituras. network: false no habilita red.

`foker skill new mi-skill` crea una plantilla válida sin sobrescribir.
`--dry-run` lista los dos archivos sin escribir. Edita el procedimiento y errores
comunes y ejecuta `foker skill validate mi-skill --strict`.
Sin nombre, validate revisa todo el catálogo visible y sale con 3 si hay errores
(FKR-SKL-002). list muestra orígenes y show entrega SKILL.md.

Se avisa al superar 500 líneas o 5000 tokens (estimador nativo), ante campos no
estándar y patrones sospechosos de descarga con shell, instrucciones anteriores,
URLs externas, borrado recursivo o base64 largo. --strict convierte avisos en errores.
La detección es conservadora y puede señalar ejemplos legítimos; no es una auditoría.

Las seis skills incluidas son foker-workflow, ts-strict-change, react-component,
next-route, secure-form y write-tests. Su fuente es `skills/` en este repositorio.
El build de engine ejecuta `scripts/copy-skills.mjs` y copia esas fuentes a
`packages/engine/skills/`, incluido en files del paquete npm. La resolución usa
import.meta.url tanto desde src como desde dist; en desarrollo sin copia usa
la carpeta raíz. Tras editar las fuentes, vuelve a ejecutar el build si hay copia.

Según §13.3, Claude Code recibe `.claude/skills/<name>/` e ignora el contrato;
OpenCode y Antigravity reciben `.agents/skills/<name>/`. La materialización por
sync corresponde a su integración; no edites las copias generadas. La posible
duplicación en OpenCode sigue pendiente de verificación. Para anfitriones sin
skills, MCP ofrece `foker://skills/{name}` y devuelve FKR-SKL-001 si no está visible.

`workflow_ref: SKILL.md` referencia el documento completo. Si se indica un fragmento,
el encabezado correspondiente debe existir. Los assets binarios conservan sus bytes al sincronizar.

## Instalación sin configuración (ADR-039)

`foker.md` puede declarar `architecture` (`stack`, `orm`, `auth`, `security.owasp_asvs`).
`foker skill install --yes` resuelve con una tabla fija las skills incluidas necesarias y las **copia**
a `foker/skills/` (no enlaza: las skills no admiten symlinks, ADR-010). No sobrescribe las del
proyecto. `foker init` hace lo mismo si `foker.md` declara `architecture`. `--dry-run` solo lista.
Sin `--yes` y en modo no interactivo, el comando falla en lugar de preguntar.

Las skills cargadas viajan en las secciones `static` del Context Pack (`rules`, `skill`), antes de
`session` y `task`: es el prefijo estable que favorece el caché del anfitrión (ADR-016). El ahorro se
mide, no se supone.
