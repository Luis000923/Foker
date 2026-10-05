# Architecture Decision Records

Copia de `spec/adr/`. Una decisión nueva o modificada exige un ADR nuevo con número siguiente; no se editan ADRs aceptados salvo su estado.

| ADR | Título | Estado |
|---|---|---|
| [ADR-001](ADR-001-alcance-y-frontera-de-foker.md) | Alcance de Foker y frontera con el agente anfitrión | Aceptada (confirmada por el usuario el 2026-10-04, PREGUNTA-1). |
| [ADR-002](ADR-002-rust-typescript.md) | Arquitectura políglota Rust + TypeScript | Aceptada (ratifica la decisión original con nueva justificación) |
| [ADR-003](ADR-003-napi-rs.md) | Puente Rust ↔ Node.js con napi-rs v3 | Aceptada |
| [ADR-004](ADR-004-parseo-y-resolucion.md) | Parseo con tree-sitter y resolución con oxc_resolver | Aceptada (tree-sitter ratificado; resolución nueva) |
| [ADR-005](ADR-005-almacenamiento-project-map.md) | Almacenamiento del Project Map: JSON canónico como caché reconstruible | Aceptada (con criterio de revisión) |
| [ADR-006](ADR-006-ranking.md) | Ranking: PageRank personalizado + BM25, sin base vectorial | Aceptada (pesos = HIPÓTESIS a calibrar) |
| [ADR-007](ADR-007-context-pack.md) | Context Pack determinista con niveles de renderizado | Aceptada |
| [ADR-008](ADR-008-mcp.md) | Servidor MCP: stdio, 8 herramientas deterministas, 2026-07-28 + 2025-11-25 | Aceptada |
| [ADR-009](ADR-009-modelo-de-seguridad.md) | Modelo de seguridad de la plataforma: capas, workspace trust y gates | Aceptada |
| [ADR-010](ADR-010-formato-de-skills.md) | Formato de Skills: Agent Skills + `foker.skill.yaml` | Aceptada (modifica V1 §9) |
| [ADR-011](ADR-011-agentes-y-fsm.md) | Roles como definiciones, FSM de tareas en Foker y COMPLETED determinista | Aceptada (modifica V1 §8) |
| [ADR-012](ADR-012-integraciones-y-proveedores.md) | Abstracción de proveedor e integraciones mediante `foker sync` | Aceptada |
| [ADR-013](ADR-013-versionado.md) | Versionado independiente por artefacto y paquetes en lockstep | Aceptada |
| [ADR-014](ADR-014-distribucion-y-ci.md) | Distribución npm con binarios por plataforma y CI en GitHub Actions | Aceptada (modifica V1 §15) |
| [ADR-015](ADR-015-herramientas-de-monorepo.md) | pnpm para el repo de Foker; pnpm + Turborepo solo para la plantilla | Aceptada (modifica ADR-001 original) |
| [ADR-016](ADR-016-prompt-caching.md) | Prompt caching: estabilidad de secciones en el MVP, control explícito en el runner | Experimental |
| [ADR-017](ADR-017-seguridad-proyecto-generado.md) | Seguridad del proyecto generado alineada con OWASP ASVS 5.0 (sin afirmar cumplimiento) | Aceptada (modifica ADR-005 original) |
| [ADR-018](ADR-018-benchmark.md) | Metodología de benchmark: experimento pareado con agente headless | Aceptada (diseño); repos y presupuesto PENDIENTES |
| [ADR-019](ADR-019-reconstruccion-de-contratos.md) | Contratos reconstruidos: JSON Schemas y API nativa | Aceptada (decisión del usuario, 2026-10-03) |
| [ADR-020](ADR-020-extraccion-por-recorrido.md) | Extracción de símbolos por recorrido del árbol, no por queries `.scm` | Aceptada |
| [ADR-021](ADR-021-contrato-nativo-engine.md) | Contrato nativo del motor | Aceptada |
| [ADR-022](ADR-022-checks-windows-cmd.md) | Checks mediante shims de Windows | Aceptada |
| [ADR-023](ADR-023-estimacion-tokens-skills.md) | `estimateTokens` en la API nativa para validar Skills | Aceptada |
| [ADR-024](ADR-024-calibracion-context-engine.md) | Calibración del Context Engine con ctx-gold | Rechazada (cambio de defaults) |
| [ADR-025](ADR-025-benchmark-metricas-desconocidas.md) | Null para métricas no observadas del benchmark | Aceptada (amplía ADR-018) |
| [ADR-026](ADR-026-aislamiento-ci-multiplataforma.md) | Aislamiento multiplataforma en GitHub Actions | Aceptado |
| [ADR-027](ADR-027-codex-paridad-sin-claves-api.md) | Codex y paridad por suscripción sin claves API | Aceptado |
| [ADR-028](ADR-028-expansion-lexica-context-engine.md) | Expansión léxica es/en y corte relativo del ranking | Aceptada |
| [ADR-029](ADR-029-benchmark-suscripciones.md) | Benchmark con autenticación por suscripción | Aceptada |
| [ADR-030](ADR-030-respuestas-mcp-compactas.md) | Respuestas MCP compactas | Aceptada |
| [ADR-031](ADR-031-pack-compacto-y-flujo-corto.md) | Context Pack compacto (v2) y flujo corto | Fases 1–2b aceptadas |
| [ADR-032](ADR-032-recall-en-el-flujo-begin.md) | Recall en el flujo `foker_task_begin` | Aceptada (plegado rechazado como default) |
