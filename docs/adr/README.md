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
