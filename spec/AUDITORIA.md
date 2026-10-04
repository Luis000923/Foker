# Foker · Auditoría

| Campo | Valor |
|---|---|
| Fecha | 2026-10-04 |
| Documentos auditados | `Foker/Diseño Framework Web Nativo IA.txt` (en adelante **DIS**), `Foker/Especificación Técnica Framework Foker.txt` (**ESP**), `Foker/Foker_V1txt.txt` (**V1**) |
| Resultado | Especificación maestra reescrita en `FOKER-SPEC.md`. Los tres documentos originales se conservan sin modificar como historial de investigación. |
| Veredicto | La investigación original **no era implementation-ready** pese a que V1 lo declaraba. La visión y varias decisiones son correctas y se mantienen; la arquitectura de ejecución (quién controla el LLM), la seguridad de la plataforma, el Project Map, el Context Engine y el benchmark necesitaban rediseño o formalización. |

Etiquetas usadas en todo el paquete: **HECHO**, **DECISIÓN**, **REQUISITO**, **HIPÓTESIS**, **RECOMENDACIÓN**, **PENDIENTE**, **RIESGO**, **PROPUESTA NUEVA**, **TARGET**.

## 1. Qué se mantiene

| Decisión original | Dónde | Estado | Comentario |
|---|---|---|---|
| El agente no debe leer todo el proyecto; contexto seleccionado estructuralmente | DIS, ESP | **Se mantiene** | Es la tesis central. Ahora tiene algoritmo, métricas y benchmark. |
| Project Map determinista generado sin LLM (tree-sitter + grafo) | DIS, ESP, V1 | **Se mantiene** | Se añade resolución de módulos (faltaba) y esquema formal. |
| PageRank sobre el grafo de dependencias | DIS, ESP, V1 | **Se mantiene, modificada** | Se usa PageRank **personalizado** por tarea; el global queda como prior y para el "núcleo" del proyecto. |
| Sin base vectorial en el MVP | ESP, V1 | **Se mantiene** | Se sustituye por BM25 léxico determinista + grafo. Embeddings pasan a Future, condicionados al benchmark. |
| Núcleo en Rust + orquestación en TypeScript vía napi-rs | ESP, V1 | **Se mantiene, rejustificada** | Las cifras "10x–36x" provienen de fuentes secundarias y no se usan como justificación. |
| MCP como interfaz estándar hacia agentes | ESP, V1 | **Se mantiene** | Versión 2026-07-28 verificada; se añade compatibilidad con 2025-11-25. |
| Separación `foker.md` (humano) / `foker.config.yaml` (técnico) | V1 | **Se mantiene** | Se formalizan los cuatro artefactos (`foker.md`, `foker.config.yaml`, `foker/`, `.foker/`). |
| Validación determinista (tsc, lint, tests) como árbitro, no el LLM | DIS, ESP, V1 | **Se mantiene, reforzada** | Ahora es la única vía hacia `COMPLETED`. |
| pnpm workspaces + Turborepo para el proyecto generado | DIS, ESP, V1 | **Se mantiene** | Solo para la plantilla generada. El repo de Foker no necesita Turborepo en el MVP. |
| Topología mínima de agentes, sin enjambres | DIS, ESP, V1 | **Se mantiene** | Los roles se redefinen como definiciones exportables a cada agente anfitrión. |
| Exclusiones del MVP: DAST, Kubernetes, UI gráfica, vector DB, cloud autónomo | ESP | **Se mantiene** | Se añaden más exclusiones (deploy, runner LLM propio). |

## 2. Problemas encontrados

Formato de cada problema: **ORIGINAL → PROBLEMA → CAMBIO → JUSTIFICACIÓN → IMPACTO**. Severidad: **Crítico** (impide implementar o es inseguro), **Alto** (implementación divergente o tesis no demostrable), **Medio** (ambigüedad o error corregible), **Bajo** (calidad documental).

### A. Arquitectura y alcance

**AUD-001 · Crítico · Autodeclaración de "IMPLEMENTATION READY"**
- ORIGINAL: V1 §0 y §19 marcan los 23 elementos como listos ("Ningún punto permanece bloqueado").
- PROBLEMA: La API de Rust devuelve `Promise` sin tipo, el Context Engine no tiene algoritmo reproducible, no hay definición de "COMPLETED", ni criterios de aceptación, ni modelo de amenazas contra Foker. La checklist no verificaba nada.
- CAMBIO: Nueva Implementation Ready Check con READY/PARTIAL/MISSING/BLOCKED y motivo.
- JUSTIFICACIÓN: Un equipo no podría implementar sin reinterpretar la investigación.
- IMPACTO: Cambia el estado del proyecto de "listo" a "listo para empezar el MVP, con pendientes explícitos".

**AUD-002 · Crítico · Confusión sobre quién controla el bucle del LLM**
- ORIGINAL: V1 §6 "Foker actuará como un Host (Orquestador) y expondrá sus módulos como un MCP Server"; ESP "El Context Engine ... intercepta y transforma las llamadas antes de tocar la API del proveedor"; V1 §10 integra con Claude Code, OpenCode y Antigravity.
- PROBLEMA: Son tres arquitecturas incompatibles. Si Claude Code/OpenCode/Antigravity ejecutan el bucle, Foker **no puede interceptar** sus llamadas al proveedor ni construir su prompt; solo puede responder herramientas MCP y aportar archivos de instrucciones. Si Foker es el host, necesita SDKs de proveedores, gestión de claves, bucle de herramientas, streaming y reintentos (un agente completo), lo que duplica lo que ya hacen los agentes externos.
- CAMBIO: **DECISIÓN** (ADR-001): en el MVP Foker es **infraestructura determinista** (Project Map, Context Engine, políticas, validación, ledger de tareas, Skills, generación de integraciones) consumida por agentes externos vía MCP + archivos nativos. Un *runner* propio (`foker run`) con adaptadores de proveedor pasa a V0.2 como componente opcional. Confirmada por el usuario el 2026-10-04 (PREGUNTA-1).
- JUSTIFICACIÓN: Es la única forma de cumplir a la vez "independiente del proveedor" y "funciona con Claude Code/OpenCode/Antigravity" sin construir un agente propio antes de demostrar la tesis.
- IMPACTO: Elimina `foker execute` del MVP, cambia la estrategia de prompt caching (AUD-011) y el diseño del benchmark (usa el agente externo en modo headless).

**AUD-003 · Alto · Contradicción TypeScript-only vs Rust + TypeScript**
- ORIGINAL: DIS "La combinación más apropiada ... es TypeScript en su totalidad". ESP y V1 introducen Rust.
- PROBLEMA: Contradicción no resuelta; además ESP afirma que la CLI es "un binario nativo rápido a través de napi-rs", lo cual es falso: napi-rs produce un *addon* `.node` cargado por Node.js, no un ejecutable.
- CAMBIO: Rust para el núcleo determinista (parseo, resolución, grafo, ranking, selección), TypeScript para CLI, MCP, políticas, validación e integraciones. La CLI es un paquete Node con `bin`. Alternativa evaluada y descartada: TypeScript-only con `web-tree-sitter` (WASM) — viable, más simple de distribuir, pero con peor paralelismo y doble implementación si más adelante se quiere un binario/LSP. Ver ADR-002.
- JUSTIFICACIÓN: La justificación real de Rust es determinismo y rendimiento paralelo en un único lugar, no las cifras "10x–36x" de blogs.
- IMPACTO: Requiere matriz de compilación nativa (AUD-030).

**AUD-004 · Alto · Mezcla entre "Foker Framework" y "proyecto generado"**
- ORIGINAL: ESP mezcla la estructura del repo generado (`foker-workspace/`) con decisiones del framework; DIS habla de `cli/` dentro del proyecto generado; V1 pone `templates/` en el repo de Foker.
- PROBLEMA: No queda claro qué vive en el repo de Foker, qué se instala como dependencia y qué se escribe en el proyecto del usuario. ADR-001 original (pnpm + Turborepo) mezcla los dos ámbitos.
- CAMBIO: Dos estructuras separadas y normativas: repo oficial de Foker y proyecto gestionado por Foker. Foker funciona sobre **cualquier** monorepo TypeScript existente; la plantilla Next.js es opcional.
- JUSTIFICACIÓN: Foker no aporta runtime web: Next.js, pnpm y Turborepo ya existen. Su valor está en el contexto y la validación.
- IMPACTO: `foker init` no requiere plantilla; el benchmark puede usar repos reales.

**AUD-005 · Medio · Foker presentado como "framework web full-stack"**
- ORIGINAL: Título y visión de ESP/V1.
- PROBLEMA: Foker no define runtime, routing, renderizado ni ORM; delega en Next.js/Drizzle/Prisma. Llamarlo framework web fija expectativas que el MVP no cumple.
- CAMBIO: Definición: "framework de desarrollo asistido por IA para monorepos TypeScript, con una plantilla full-stack opcional".
- IMPACTO: Documentación y posicionamiento. **PENDIENTE** confirmar con el humano (PREGUNTA-7).

**AUD-006 · Medio · Componentes con responsabilidades difusas o circulares**
- ORIGINAL: V1 `crates/foker-core` ("Orquestador principal Rust (I/O, AST, Graph)") + `foker-parser` + `foker-context`; `packages/agents` ("Definiciones topológicas").
- PROBLEMA: `foker-core` orquesta y a la vez contiene AST/grafo, que también están en `foker-parser`; dependencia potencialmente circular core↔context. "Definiciones topológicas" no especifica nada.
- CAMBIO: Crates `foker-map` → `foker-context` → `foker-napi` (grafo acíclico); paquetes TS `schemas → policy → engine → {mcp, cli}`. Ver §4.
- IMPACTO: Límites de módulo verificables con `cargo` y con reglas de dependencias en CI.

**AUD-007 · Medio · "Documentation Agent" y "Knowledge System auto-actualizado"**
- ORIGINAL: ESP "un agente especializado (Documentation Agent) enmienda de forma asíncrona los archivos Markdown de arquitectura, garantizando la inmutabilidad de la verdad técnica"; en otra sección se excluyen agentes de documentación del MVP.
- PROBLEMA: Contradicción interna y lógica: un LLM editando la documentación no garantiza nada determinista.
- CAMBIO: Lo generado automáticamente es solo `.foker/` (determinista). `foker/` (conocimiento curado) lo editan humanos o agentes **bajo tarea validada y con aprobación**. Documentation Agent → Future.
- IMPACTO: Elimina una fuente de *context rot* inducida por el propio sistema.

### B. Project Map

**AUD-008 · Alto · Ruta del mapa inconsistente**
- ORIGINAL: `vault/project_map.json` (DIS), `docs/vault/` (DIS), `foker/.project_map.json` (ESP), `.foker/project-map.json` (V1), `docs/project_map/map_index.json` (ESP).
- CAMBIO: **DECISIÓN**: `.foker/project-map.json`, dentro de `.foker/` (estado generado, en `.gitignore`). `foker/` queda para conocimiento curado versionado.
- JUSTIFICACIÓN: Separar estado derivado (reconstruible, no se versiona) de conocimiento humano (se versiona) evita conflictos de merge y *context rot*.
- IMPACTO: Todas las referencias de la especificación usan la nueva ruta.

**AUD-009 · Alto · Esquema del mapa insuficiente**
- ORIGINAL: V1 §4: `files` como objeto con `hash` de 8 hex, `page_rank` 0.85 y 4.2, `symbols` sin ubicación, `imports` con especificador sin resolver, `dependents` duplicado, `kind: "component"`.
- PROBLEMA: Sin identificadores estables, sin rangos de código, sin paquete, sin estado de parseo, sin resolución de imports, sin aristas tipadas, sin `schema_version` separada de `foker_version`, valores de PageRank incoherentes (no normalizados), hash truncado propenso a colisiones, `dependents` desnormalizado (puede divergir), "component" es una heurística de React, no un tipo de símbolo.
- CAMBIO: Esquema formal JSON Schema 2020-12 `schemas/project-map.schema.json` con IDs, aristas tipadas con confianza, BLAKE3 completo, rango normalizado y reglas de compatibilidad. Ver §8.
- IMPACTO: El Context Engine y el benchmark pueden auditar por qué se eligió cada archivo.

**AUD-010 · Alto · Falta resolución de módulos**
- ORIGINAL: Ningún documento la menciona; V1 guarda `"source": "@/components/ui/button"`.
- PROBLEMA: tree-sitter solo parsea; no sabe a qué archivo apunta `@/…` (paths de tsconfig), `@acme/ui` (workspace), `exports` de package.json, `index.ts` implícito o extensiones `.js`→`.ts`. Sin resolución no hay grafo útil en un monorepo.
- CAMBIO: **DECISIÓN** (ADR-004): `oxc_resolver` (crate Rust, resolución compatible con Node y tsconfig paths). Imports no resueltos se registran como diagnóstico, no se inventan aristas.
- IMPACTO: Nuevo requisito REQ-MAP-004 con fixtures específicos.

**AUD-011 · Medio · Disparadores de actualización contradictorios**
- ORIGINAL: "tras cada commit" (DIS), "milisegundos tras cualquier alteración" (ESP), "tras cada compilación local" (ESP MVP), `foker map` manual (V1).
- CAMBIO: Actualización **incremental bajo demanda**: cada consulta (CLI o MCP) verifica frescura (mtime+tamaño, y hash si cambian) y re-parsea solo lo modificado. Watcher (`notify`) pasa a V0.2. Hook de git opcional.
- IMPACTO: Sin daemon en el MVP; frescura garantizada en cada consulta.

**AUD-012 · Medio · Determinismo, concurrencia y corrupción del mapa no definidos**
- PROBLEMA: Timestamps dentro del contenido, orden de iteración paralela, PageRank en coma flotante, varios procesos (CLI + servidor MCP) escribiendo el mismo archivo.
- CAMBIO: Serialización canónica (claves y arrays ordenados), `content_hash` que excluye `generated_at`, PageRank con orden fijo y redondeo, escritura atómica (temporal + rename), lock de archivo, verificación de hash al cargar y reconstrucción completa si falla. Ver §8.6.

**AUD-013 · Medio · ¿JSON es el formato correcto?**
- CAMBIO: **DECISIÓN** (ADR-005): JSON canónico en el MVP como formato de persistencia e intercambio; el estado de trabajo vive en memoria en Rust. SQLite se reevalúa con criterio objetivo (mapa > 25 MB o carga p95 > 500 ms en el fixture grande).
- JUSTIFICACIÓN: El mapa es caché reconstruible; JSON es inspeccionable, diffeable y validable con JSON Schema. SQLite añade migraciones y bloqueo sin beneficio demostrado en repos de ≤ 10k archivos.

### C. Context Engine y caching

**AUD-014 · Alto · Algoritmo de ranking no implementable de forma reproducible**
- ORIGINAL: V1 §5 "se multiplica el grado de proximidad topológica ... por el valor precalculado de PageRank"; "Archivos con PageRank > Umbral_Base se insertan SIEMPRE".
- PROBLEMA: (1) El PageRank global favorece *hubs* (utils, tipos) aunque no tengan relación con la tarea; (2) sin archivo activo no hay semillas; (3) el umbral fijo consume presupuesto en todos los prompts; (4) no hay señal léxica, así que "arreglar el bug del checkout" no encuentra `checkout.ts` si el agente no lo indica; (5) no hay estimación de tokens ni desempate determinista; (6) no explica por qué se eligió cada archivo.
- CAMBIO: Algoritmo de 19 pasos en §9: semillas = anclas explícitas + BM25 sobre símbolos/rutas + archivos modificados; **PageRank personalizado** con aristas en ambos sentidos ponderadas según intención; niveles de renderizado L0–L3; mochila voraz con degradación; contexto obligatorio que nunca se trunca en silencio; traza de explicación por archivo.
- JUSTIFICACIÓN: El PageRank personalizado es la técnica que usa Aider para su repo map (lo cita DIS) y combina relevancia estructural y centralidad en un único modelo, evitando sumar señales heterogéneas sin normalizar.
- IMPACTO: Se descarta la fórmula aditiva de 6 términos propuesta como ejemplo; ver justificación en §9.5.

**AUD-015 · Crítico · Estrategia de prompt caching inaplicable en modo MCP y con datos desactualizados**
- ORIGINAL: V1 §5 "La porción estática debe superar el mínimo del modelo (ej. 1024 tokens)", "descuento del 90%"; ESP "Un marcador de control de caché (cache_control) sella esta sección".
- PROBLEMA: (1) Cuando Foker actúa como servidor MCP, sus resultados se añaden al final de la conversación del agente anfitrión; **Foker no coloca `cache_control` ni ordena el prompt**. (2) **HECHO verificado** en la documentación oficial de Anthropic (2026-10-04): el mínimo cacheable depende del modelo (512, 1.024, 2.048 o 4.096 tokens) y la lectura de caché no siempre cuesta 0,1×: es 0,05× en Claude Opus 5.5 y 0,025× en Claude Fable 5.1 / Mythos 5.1; la escritura cuesta 1,25× (TTL 5 min) o 2× (TTL 1 h); hay como máximo 4 *breakpoints* y existe caché automático. (3) Las fuentes citadas eran blogs secundarios.
- CAMBIO: En el MVP, el Context Engine produce secciones con **clase de estabilidad** (`static`, `session`, `task`) en orden estable→dinámico y sin datos volátiles, lo que ayuda al caché del anfitrión sin depender de él. El control explícito de `cache_control` pasa al runner V0.2 (ADR-016, Experimental). El benchmark mide `cache_read_input_tokens` y `cache_creation_input_tokens` en lugar de suponer descuentos.
- IMPACTO: Se elimina la promesa de ahorro del 90% como requisito del MVP.

**AUD-016 · Alto · "18:1" presentado como hecho y como objetivo del MVP**
- ORIGINAL: DIS "logrando ratios de compresión documentados de hasta 18:1"; ESP MVP "demostrar inequívocamente la compresión de contexto 18:1".
- PROBLEMA: Es la cifra de un trabajo externo (Stingy Context) con su propio corpus y definición; no es transferible y no estaba definida para Foker. "Demostrar inequívocamente" un número fijo es un objetivo infalsable.
- CAMBIO: **TARGET / HYPOTHESIS**. Se definen dos métricas distintas (CCR_relevante y reducción de tokens de entrada por tarea exitosa), la hipótesis primaria (H1) y criterios de no inferioridad en §20.
- IMPACTO: El MVP se considera exitoso si H1 se confirma, no si se alcanza 18:1.

**AUD-017 · Medio · Límite de tamaño de resultados MCP no considerado**
- HECHO verificado: Claude Code limita por defecto los resultados de herramientas MCP a 25.000 tokens (`MAX_MCP_OUTPUT_TOKENS`) y advierte a partir de 10.000.
- CAMBIO: Presupuesto por defecto 8.000 tokens y máximo 20.000 en MCP; la CLI no tiene ese tope.

### D. Frontera Rust-TypeScript

**AUD-018 · Alto · API nativa sin tipos ni contrato**
- ORIGINAL: V1 §3 `parseWorkspace(...): Promise;`, `updateFile(filePath, content)`, `getProjectMap(): Promise`, `calculateRanking(): Promise`, "referencias opacas u objetos serializados a nivel de búfer".
- PROBLEMA: Tipos de retorno inexistentes; `updateFile` cruza contenido completo por la frontera aunque Rust puede leer el disco; `calculateRanking` como paso separado crea acoplamiento temporal (resultado incorrecto si se olvida llamarlo); "referencias opacas" no se especifica.
- CAMBIO: Clase `FokerEngine` con 10 métodos tipados, errores con `code` estable, versión de ABI interna y reglas de concurrencia. Contrato completo en `api/foker-core.d.ts` y §7.
- JUSTIFICACIÓN: **HECHO verificado** (docs napi-rs): `Error<S: AsRef<str>>` fija `error.code` en JS; las `async fn` rechazan la Promise con el error convertido.

### E. MCP

**AUD-019 · Alto · Herramientas MCP que duplican capacidades del anfitrión y amplían la superficie de ataque**
- ORIGINAL: V1 §6 `read_file`, `apply_patch`, `run_typecheck {package_name}`, `run_security_check {scope}`.
- PROBLEMA: Claude Code, OpenCode y Antigravity ya leen y editan archivos con sus propios permisos; duplicarlo crea una segunda vía de escritura con otra política. Faltan `outputSchema`, timeouts, idempotencia, anotaciones y permisos por herramienta. "Protocol Error si el JSON es corrupto" usa mal la categoría (es un fallo de ejecución recuperable por reconstrucción).
- CAMBIO: 8 herramientas deterministas (`foker_status`, `foker_search`, `foker_context`, `foker_impact`, `foker_check`, `foker_task_begin`, `foker_task_submit`, `foker_task_get`), 4 recursos, 0 prompts en el MVP. Ninguna escribe código fuente. Ver §10 y `schemas/mcp-tools.json`.

**AUD-020 · Medio · Versión MCP 2026-07-28: correcta pero sin plan de compatibilidad**
- HECHO verificado (modelcontextprotocol.io, changelog oficial): la revisión 2026-07-28 existe y elimina el handshake `initialize`, añade `server/discover`, introduce Multi Round-Trip Requests (`resultType: "input_required"`), exige `resultType` en todos los resultados, mueve *tasks* a una extensión oficial y depreca Roots, Sampling y Logging. Los SDK con soporte (TypeScript v2: `@modelcontextprotocol/server`) mantienen compatibilidad con 2025-11-25.
- PROBLEMA: El documento asumía que todos los anfitriones hablarían 2026-07-28; es una revisión de hace ~2 meses.
- CAMBIO: **REQUISITO**: el servidor sirve 2026-07-28 y acepta clientes 2025-11-25 (handshake legado). No se usan Roots, Sampling ni Logging (deprecados): el root se pasa por argumento de arranque y los logs van a `stderr`.

### F. Seguridad de la plataforma

**AUD-021 · Crítico · El modelo de seguridad prometía controles imposibles**
- ORIGINAL: V1 §14 "El servidor MCP aislará las variables de entorno de la máquina anfitrión mediante sandboxing rudimentario o lista blanca en napi-rs"; §7 YAML con `shell.allowlist`, `network.enabled: false`.
- PROBLEMA: Foker no ejecuta las herramientas del anfitrión; un agente en Claude Code puede ejecutar `cat .env` con su propio Bash sin pasar por Foker. **HECHO verificado** (docs de permisos de Claude Code): las reglas *deny* de `Read` no cubren subprocesos que abren archivos por su cuenta; para aplicación a nivel de SO se necesita el sandbox. La allowlist "pnpm turbo" por prefijo permite `pnpm turbo run <cualquier cosa>`; `network: false` es incompatible con `pnpm audit`.
- CAMBIO: Modelo en capas (§11, ADR-009): (1) configuración nativa de permisos del anfitrión generada por `foker sync`; (2) default-deny en las herramientas propias de Foker; (3) *gates* deterministas a posteriori sobre el diff antes de `COMPLETED`; (4) sandbox de SO recomendado y obligatorio en CI/benchmark. Se documenta el riesgo residual.

**AUD-022 · Crítico · Ejecución arbitraria de comandos vía configuración del repositorio**
- PROBLEMA: No se analizó. Si `foker.config.yaml` define comandos de validación y el repositorio es de terceros (clonado), `foker validate` o el MCP ejecutarían código del atacante.
- CAMBIO: **PROPUESTA NUEVA**: *workspace trust*. Foker guarda en el directorio del usuario (fuera del repo) el hash del conjunto de comandos aprobado; si cambia, se niega a ejecutar en modo no interactivo (exit 6) y pregunta en modo interactivo. El servidor MCP nunca concede confianza.

**AUD-023 · Alto · Amenazas sin analizar**
- PROBLEMA: Faltaban path traversal (incluido Windows), symlinks fuera del root, exfiltración vía contexto, manipulación del ledger por el agente, escalada vía edición de la propia configuración de Foker, skills maliciosas, otros servidores MCP, dependencias envenenadas del propio Foker, ejecución de tests generados por IA.
- CAMBIO: Modelo de amenazas con 18 amenazas, controles MVP y riesgo residual en §11.2.

**AUD-024 · Alto · Ejecutar tests de código generado es ejecución de código arbitrario**
- PROBLEMA: Los "bucles de auto-sanación" ejecutan código escrito por el LLM en la máquina del desarrollador.
- CAMBIO: **RIESGO** explícito; **REQUISITO** de sandbox/contenedor en CI y benchmark; **RECOMENDACIÓN** de sandbox local.

### G. Agentes, Skills, integraciones

**AUD-025 · Alto · Máquina de estados incompleta y "COMPLETED" sin definición**
- ORIGINAL: V1 §8 "PENDING -> PLANNED -> RUNNING -> VALIDATING -> FAILED / RETRYING -> COMPLETED".
- PROBLEMA: Sin tabla de transiciones, sin BLOCKED, CANCELLED ni aprobación humana; FAILED y RETRYING ambiguos (¿terminal o transitorio?); nada impide que el agente declare éxito.
- CAMBIO: FSM de 10 estados con transiciones, actores autorizados y guardas en §12.3. `RETRYING` se sustituye por `REJECTED` + contador de intentos; `COMPLETED` solo lo asigna el validador determinista (y, si aplica, un humano por CLI).

**AUD-026 · Alto · Review Agent confundido con validación determinista**
- ORIGINAL: V1 "Review Agent ... Aprobación o rechazo técnico basado en reglas SAST locales".
- CAMBIO: Las reglas SAST son un *gate* determinista; el Reviewer (LLM) es consultivo: puede pedir cambios pero no puede aprobar si un gate falla ni bloquear de forma definitiva.

**AUD-027 · Alto · Formato de Skills incompatible con el estándar del ecosistema**
- ORIGINAL: V1 §9 JSON Schema draft-07 (`allowed_tools`); ESP tabla con `tools`, `inputs`, `validation`, `output`; ejemplo `name: Build_Secure_React_Form`.
- PROBLEMA: Campos distintos entre documentos; sin versión; el esquema JSON no encaja con un archivo Markdown. **HECHO verificado**: existe el estándar abierto Agent Skills (agentskills.io) con `SKILL.md` + frontmatter (`name` en minúsculas con guiones y igual al directorio, `description` obligatoria); Claude Code, OpenCode y Antigravity lo implementan. `Build_Secure_React_Form` es un nombre inválido en ese estándar.
- CAMBIO: ADR-010: `SKILL.md` estándar + archivo lateral `foker.skill.yaml` (contrato versionado de Foker). Esquema en `schemas/foker-skill.schema.json`.

**AUD-028 · Medio · Integraciones con agentes basadas en archivos inexistentes o mecanismos inventados**
- ORIGINAL: V1 "opencode.yaml expone las herramientas MCP"; "Antigravity: se configura el workspace para que utilice los agentes Planner de Foker como sub-rutinas"; Claude Code solo vía `CLAUDE.md`.
- HECHO verificado: OpenCode usa `opencode.json`/`opencode.jsonc` (clave `mcp`, `type: "local"`, `command` como array), agentes en `.opencode/agents/`, skills en `.opencode/skills/`, `.claude/skills/` o `.agents/skills/`, y lee `AGENTS.md` (con `CLAUDE.md` como respaldo). Antigravity usa `.agents/skills/`, `.agents/rules/*.md`, `AGENTS.md`/`GEMINI.md` y `.agents/mcp_config.json` (`mcpServers`). Claude Code usa `.mcp.json`, `.claude/skills/`, `.claude/agents/`, `.claude/settings.json` (permisos y hooks `PreToolUse`/`Stop`/`SubagentStop`/`TaskCompleted`).
- CAMBIO: Matriz de integración por anfitrión en §14 y generador `foker sync`.

**AUD-029 · Medio · "Specialists con Zero Memory Retention / purga de contexto"**
- PROBLEMA: Depende del anfitrión; Foker no lo controla.
- CAMBIO: Se reformula como RECOMENDACIÓN de integración (subagentes con contexto aislado donde el anfitrión los soporte) y como propiedad del runner V0.2.

### H. CLI, configuración, distribución, versionado

**AUD-030 · Medio · Matriz de compilación incompleta y sin estrategia de glibc**
- ORIGINAL: V1 §15 cinco *targets*.
- HECHO verificado (docs napi-rs): un binario hereda como mínimo la glibc del host de compilación; `--use-napi-cross` fija un suelo glibc 2.17. GitHub ofrece runners `ubuntu-24.04-arm`, `windows-11-arm`, `macos-15` (arm64) y `macos-15-intel`.
- CAMBIO: 6 targets en el MVP (se añade `aarch64-pc-windows-msvc`), Linux con `--use-napi-cross`, *smoke test* de cada artefacto en su runner nativo, musl en V0.2. Ver §21.

**AUD-031 · Medio · Publicación sin cadena de suministro segura**
- CAMBIO: npm *trusted publishing* (OIDC, `id-token: write`, npm ≥ 11.5.1 y Node ≥ 22.14 en el job de publicación; HECHO verificado), procedencia automática, Actions fijadas por SHA, `cargo-deny`, `minimumReleaseAge` y `allowBuilds` de pnpm.

**AUD-032 · Medio · CLI con comandos sin función real en el MVP y sin contrato**
- ORIGINAL: `init, map, execute, skill, check-security, test, deploy`.
- PROBLEMA: `execute` requiere runner LLM (AUD-002); `deploy` es responsabilidad del CI del proyecto; `test` y `check-security` son perfiles de validación; faltan `mcp` (¿cómo arranca el servidor?), `context`, `task`, `sync`, `doctor`; no había exit codes, salida JSON, modo CI ni dry-run.
- CAMBIO: CLI MVP de 9 comandos con contrato completo en §16.

**AUD-033 · Medio · Versionado solo "SemVer + JSON Schemas"**
- CAMBIO: Tabla de 9 artefactos versionados de forma independiente con reglas de compatibilidad en §17.

**AUD-034 · Medio · Turborepo en el repo de Foker sin necesidad**
- CAMBIO: El repo de Foker usa pnpm workspaces + cargo; Turborepo solo en la plantilla generada (ADR-015). Se reevalúa si el tiempo de CI lo justifica.

### I. Seguridad de los proyectos generados

**AUD-035 · Medio · OWASP ASVS: versión y alcance**
- ORIGINAL: "forzar el cumplimiento algorítmico del Nivel 2 del ASVS".
- HECHO verificado: la versión estable actual es **ASVS 5.0.0** (owasp.org), que redefine niveles y numeración respecto a 4.0.x.
- PROBLEMA: Gran parte de L2 (lógica de negocio, autorización, gestión de sesiones) no es verificable automáticamente; afirmar cumplimiento sería falso.
- CAMBIO: Objetivo "controles por defecto alineados con ASVS 5.0, nivel L1 completo automatizable + subconjunto L2", con matriz de trazabilidad control→mecanismo→verificación y la etiqueta "no constituye certificación". Ver §22.

**AUD-036 · Medio · AISVS aplicado al objeto equivocado**
- ORIGINAL: V1 "Foker implementará ... OWASP AISVS ... sumado al nivel 2 de ASVS para la aplicación generada".
- HECHO verificado: AISVS 1.0 es la versión estable y cubre sistemas con IA, incluida la orquestación agéntica.
- CAMBIO: AISVS se usa como referencia para **la seguridad de Foker** (es un sistema agéntico), no para la app web generada (salvo que esta incluya funciones de IA).

**AUD-037 · Medio · Afirmaciones de seguridad incorrectas**
- ORIGINAL: "Inyecciones SQL y SSRF anuladas algorítmicamente mediante el ORM"; "XSS y CSRF: el motor Web impone codificación automática".
- PROBLEMA: Un ORM no evita SSRF (peticiones salientes) y los ORMs tienen APIs de SQL crudo; el *output encoding* no evita CSRF.
- CAMBIO: Controles separados por amenaza (§22).

### J. Testing, benchmark, roadmap, fuentes

**AUD-038 · Medio · Benchmark no reproducible**
- ORIGINAL: "Claude 3.5 Sonnet", "50 tareas SWE-bench-style", sin definición de éxito, sin repeticiones ni estadística, control "grep" indefinido.
- CAMBIO: Diseño completo en §20: arnés headless, modelo fijado por ID, repeticiones, *Task Success* automático, pruebas pareadas e IC 95 %.

**AUD-039 · Medio · Estrategia de testing sin fixtures ni pruebas de seguridad o cross-platform**
- CAMBIO: Pirámide completa con fixtures deterministas y corpus maliciosos en §19.

**AUD-040 · Medio · Roadmap de 6 semanas con el benchmark al final**
- PROBLEMA: Si el benchmark llega al final, la tesis central se valida cuando ya se ha construido todo. La duración de 6 semanas no estaba justificada.
- CAMBIO: Hitos con criterios de salida y el arnés de benchmark en el segundo hito (*baseline* de control antes de construir el Context Engine). Sin estimaciones de calendario.

**AUD-041 · Medio · Error model con recuperaciones incoherentes**
- ORIGINAL: "FKR-CORE-001: Invalidez del AST ... Recovery: Retry (1x)".
- PROBLEMA: El parseo es determinista; reintentar produce el mismo resultado.
- CAMBIO: Catálogo de errores por área con `recoverable`, acción y exit code en §18.

**AUD-042 · Bajo · Fuentes no fiables o no relacionadas**
- ORIGINAL: V1/ESP citan `yes1am/README.md`, `github-university/README.md`, "Node.js interview questions" (GoodSpace) para justificar napi-rs; Reddit y Medium para rendimiento; numeración de citas inconsistente.
- CAMBIO: Las decisiones se apoyan en documentación oficial (registro en §4 de este documento). Las cifras de densidad de tokens por lenguaje (Python 1,0×, TS 1,17×…) quedan como **dato no verificado**, dependiente del tokenizador, sin impacto en decisiones.

**AUD-043 · Medio · `foker.md` descrito como "matemáticamente determinista para el Architect Agent"**
- PROBLEMA: Un LLM que consume Markdown no es determinista. Además había dos ejemplos de frontmatter diferentes.
- CAMBIO: Frontmatter con esquema validado (lo determinista); cuerpo Markdown libre (lo interpreta el agente). Ver §15.1.

**AUD-044 · Medio · Plataformas: Windows y rutas ignoradas**
- CAMBIO: Requisitos explícitos de rutas (separadores, mayúsculas/minúsculas, CRLF, rutas largas, nombres reservados, ADS) y CI en Windows x64/ARM64 (§7.6, §11).

**AUD-045 · Bajo · Turborepo remote cache en el proyecto generado**
- PROBLEMA: Requiere token de Vercel o servidor propio (secreto en CI).
- CAMBIO: Desactivado por defecto en la plantilla; documentado como opcional.

## 3. Decisiones nuevas o modificadas

| ID | Decisión | Tipo | ADR |
|---|---|---|---|
| D-01 | Foker MVP = infraestructura determinista; el bucle LLM es del agente externo; runner propio en V0.2 | Modificada | ADR-001 |
| D-02 | Rust (map, context) + TS (cli, mcp, policy, engine) con napi-rs v3 | Mantenida, rejustificada | ADR-002, ADR-003 |
| D-03 | tree-sitter + `oxc_resolver` para resolución de módulos | Nueva | ADR-004 |
| D-04 | `.foker/project-map.json` canónico, caché reconstruible, no versionado | Modificada | ADR-005 |
| D-05 | PageRank personalizado + BM25; sin vectores | Modificada | ADR-006 |
| D-06 | Context Pack determinista con niveles L0–L3 y traza | Nueva | ADR-007 |
| D-07 | MCP stdio, 8 herramientas, sin escritura de código, 2026-07-28 + compat 2025-11-25 | Modificada | ADR-008 |
| D-08 | Seguridad en capas + workspace trust + gates deterministas + aprobación humana | Nueva | ADR-009 |
| D-09 | Agent Skills estándar + `foker.skill.yaml` | Modificada | ADR-010 |
| D-10 | Roles exportados al anfitrión + FSM de tareas en Foker; COMPLETED solo por validador | Modificada | ADR-011 |
| D-11 | Integraciones generadas por `foker sync` (Claude Code, OpenCode, Antigravity) | Nueva | ADR-012 |
| D-12 | Versionado independiente por artefacto; paquetes npm en *lockstep* | Nueva | ADR-013 |
| D-13 | npm + paquetes por plataforma, 6 targets, trusted publishing | Modificada | ADR-014 |
| D-14 | pnpm para el repo de Foker; pnpm + Turborepo solo en la plantilla | Modificada | ADR-015 |
| D-15 | Prompt caching explícito solo en el runner V0.2 | Modificada | ADR-016 |
| D-16 | Seguridad del proyecto generado alineada con ASVS 5.0 sin afirmar cumplimiento | Modificada | ADR-017 |
| D-17 | Benchmark pareado con agente headless, H1 en lugar de 18:1 | Modificada | ADR-018 |
| D-18 | CLI MVP: `init, map, context, mcp, validate, task, skill, sync, doctor` | Modificada | — (§16) |

## 4. Registro de validación externa

| Tema | Fuente oficial | Resultado | Decisión afectada |
|---|---|---|---|
| MCP 2026-07-28 | modelcontextprotocol.io/specification/2026-07-28 y /changelog | Existe; sin estado, `server/discover`, MRTR, `resultType`, Roots/Sampling/Logging deprecados, orden determinista de `tools/list` recomendado | D-07: compatibilidad dual, sin Roots/Logging, orden estable |
| MCP tools | …/2026-07-28/server/tools y schema.ts | `inputSchema`/`outputSchema` JSON Schema 2020-12; `structuredContent`; `isError`; anotaciones `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint` (no confiables salvo servidor de confianza); estado entre llamadas mediante *handles* explícitos | Diseño de `foker_task_*` con `task_id` como handle |
| SDKs MCP | blog.modelcontextprotocol.io (SDK) + npm | TS v2 (`@modelcontextprotocol/server` 2.3.0 en npm) soporta 2026-07-28 y atiende 2025-11-25 | Se usa el SDK oficial v2 |
| Agent Skills | agentskills.io/specification | `name` (≤64, minúsculas, guiones, igual al directorio), `description` (≤1024), `license`, `compatibility`, `metadata` (string→string), `allowed-tools` (experimental) | D-09 |
| Claude Code | code.claude.com/docs (skills, sub-agents, hooks, mcp, permissions) | Skills en `.claude/skills/`; subagentes en `.claude/agents/`; `.mcp.json`; hooks con bloqueo (exit 2 / `permissionDecision`); deny no cubre subprocesos; límite MCP 25k tokens; en `claude -p` los servidores de `.mcp.json` cargan sin preguntar | D-08, D-11, AUD-017, benchmark con `--strict-mcp-config` |
| OpenCode | opencode.ai/docs (config, mcp-servers, skills, agents, rules) | `opencode.json(c)`; `mcp.<name>.type=local`, `command` array; skills en `.opencode/skills`, `.claude/skills`, `.agents/skills`; agentes en `.opencode/agents/`; `permission` allow/ask/deny; AGENTS.md | D-11 |
| Antigravity | antigravity.google/docs (skills, mcp, rules) | Skills en `.agents/skills/`; MCP en `.agents/mcp_config.json`; reglas en `.agents/rules/*.md` con `trigger`; lee `AGENTS.md`/`GEMINI.md`; límite 24 KB por regla y 20k tokens agregados | D-11 |
| Prompt caching | platform.claude.com/docs/en/build-with-claude/prompt-caching | Orden tools→system→messages; ≤4 breakpoints; mínimos 512–4096 según modelo; TTL 5 min/1 h; escritura 1,25×/2×; lectura 0,1× salvo excepciones (0,05×, 0,025×) | D-15 |
| napi-rs | napi.rs/docs (cross-build, error-handling, async-fn) | `Error<S>` → `error.code`; `async fn` sobre Tokio rechaza la Promise; `--use-napi-cross` (glibc 2.17); `-x` con zig/xwin | D-02, D-13 |
| Runners GitHub | docs.github.com (github-hosted runners) | `ubuntu-24.04-arm`, `windows-11-arm`, `macos-15`, `macos-15-intel` disponibles | D-13 |
| npm trusted publishing | docs.npmjs.com/trusted-publishers | OIDC, `id-token: write`, npm ≥ 11.5.1, Node ≥ 22.14, procedencia automática | D-13 |
| pnpm | pnpm.io/supply-chain-security | Scripts de dependencias bloqueados por defecto (`allowBuilds`), `minimumReleaseAge` (1.440 min por defecto), `trustPolicy`, `blockExoticSubdeps` | Plantilla y repo de Foker |
| Node.js | github.com/nodejs/Release schedule.json | 22 en mantenimiento hasta 2027-04-30; 24 LTS (mantenimiento desde 2026-10-20); 26 LTS desde 2026-10-28 | Soporte Node 22.14+, 24, 26 |
| OWASP | owasp.org (ASVS, AISVS) | ASVS 5.0.0 estable; AISVS 1.0 estable (1.01 en desarrollo) | D-16, AUD-036 |
| Versiones actuales | crates.io / npm (2026-10-04) | tree-sitter 0.27.0; tree-sitter-typescript 0.23.2 (publicado 2024-11); oxc_resolver 11.24.3; napi 3.14.0; @napi-rs/cli 3.10.6; pnpm 12.9.1; turbo 2.11.7; vitest 5.0.3; typescript 7.0.2; blake3 1.8.7 | Riesgos R-07 (gramática) y R-12 (TS 7) |

Fuentes **no** usadas para decidir: blogs, Medium, Reddit, READMEs no relacionados citados en los originales.
