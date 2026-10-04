# Roadmap de Foker

Copia operativa de `spec/ROADMAP-BACKLOG.md` §2 y §3. El estado de cada issue está en [`ESTADO.md`](ESTADO.md).

## Hitos

| Hito | Objetivo | Criterios de salida |
|---|---|---|
| **M0 · Fundaciones y riesgo de distribución** | Repo, CI, contratos y addon "hola mundo" publicado en las 6 plataformas | CI verde en 3 SO; `versionInfo()` funciona instalando un tarball prerelease en los 6 runners; `@foker/schemas` valida los ejemplos de la especificación; ADRs en `docs/adr/` |
| **M1 · Línea base del benchmark** | Medir el control **antes** de construir el motor | Arnés ejecuta la suite `smoke` (3 tareas) y ≥ 10 tareas del Fixture A en el brazo control, 3 repeticiones, resultados válidos contra `benchmark-result.schema.json`; primeros 30 casos de `ctx-gold` |
| **M2 · Project Map** | `foker map` completo | REQ-MAP-001…004, REQ-XPLAT-001…004 en CI; `content_hash` idéntico en 3 SO; TARGET de rendimiento medido y publicado (cumpla o no) |
| **M3 · Context Engine** | `foker context` completo | REQ-CTX-001…002 en CI; recall@pack sobre `ctx-gold` medido y publicado (REQ-CTX-003 como TARGET; < 0,6 bloquea el hito) |
| **M4 · MCP, política, tareas, skills** | Flujo `begin → context → submit` | 8 herramientas + 4 recursos con E2E en clientes 2026-07-28 y 2025-11-25; REQ-TSK-001, REQ-POL-001…002, REQ-SKL-001…002; suite `tests/security` verde |
| **M5 · Integraciones, plantilla y release** | 0.1.0 publicado y H1 evaluada | REQ-PRJ-001…003, REQ-INT-001…002; checklist manual de los 3 anfitriones completada; `foker` 0.1.0 publicado con procedencia; benchmark completo ejecutado e informe publicado (H1 confirmada o no) |

## Fases posteriores al MVP

**V0.2**
- Runner `foker run` con adaptador Anthropic y prompt caching explícito (ADR-016); segundo adaptador para validar la abstracción.
- Roles Planner (tareas `PENDING` con revisión humana) y Architect (desde `foker.md`).
- Grafo de llamadas (`calls`, heurístico) y aristas a nivel de símbolo en el PageRank.
- Watcher opcional; extensión MCP *Tasks* para `task_submit` largos; prompts MCP para skills.
- Targets musl; OpenCode como segundo anfitrión del benchmark; plugin de OpenCode para hooks si aporta.
- Plantilla: BD + ORM (decisión PREGUNTA-4), autenticación, rate limiting, `secure-fetch`.
- `foker skill add` con hash fijado; adaptador gitleaks; `scripts/fetch-prebuilt.mjs`.

**V1.0**
- Formatos v1 congelados con política de deprecación; API MCP estable.
- Benchmark reproducible por terceros con resultados publicados.
- Auditoría de seguridad externa; documentación completa; aprobaciones vía revisión de PR.

**Future**
- Recuperación híbrida con embeddings; otros lenguajes; UI; despliegue; DAST; Kubernetes/cloud; observabilidad distribuida; multi-proveedor gestionado; agente de documentación; registro público de skills; fallback WASM.

