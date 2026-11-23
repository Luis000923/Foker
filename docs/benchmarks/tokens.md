# Benchmark de tokens y latencia

- Fecha: 2026-11-23
- baseline: `bfca7de`
- candidato: `3869b1f`
- Fixtures: árbol de `bfca7de` (repo Foker) y `examples/aurora-analytics` + `REQUIREMENTS.md`
- Repeticiones: 7 (p50/p95 por percentil de rango); Node v22.23.2, linux
- Tokens: estimador `bytes-lf/3.2@1` = ceil(bytes UTF-8 tras CRLF→LF × 5/16), determinista

## Tokens por superficie

| Superficie | baseline | candidato | Δ |
|---|---:|---:|---:|
| Project Map (recurso `foker://map/outline`) | 75 | 1714 | 2185.3 % |
| MCP `tools/list` (cada turno) | 25039 | 8351 | -66.6 % |
| Context Pack CLI · Exploración inicial (sin anclas) | 7551 | 5685 | -24.7 % |
| Context Pack CLI · Edición focalizada de 1 archivo | 7531 | 5594 | -25.7 % |
| Context Pack CLI · Cambio cross-módulo (mcp + engine) | 7501 | 5904 | -21.3 % |
| Context Pack CLI · aurora-analytics: ruta webhook con HMAC | 1154 | 1333 | 15.5 % |
| MCP `foker_context` · exploracion (contenido) | 7551 | 5685 | -24.7 % |
| MCP `foker_context` · exploracion (JSON-RPC completo) | 15373 | 11593 | -24.6 % |
| MCP `foker_context` · exploracion repetido con `task_id` | 7559 | 641 | -91.5 % |
| MCP `foker_context` · focal (contenido) | 7531 | 5594 | -25.7 % |
| MCP `foker_context` · focal (JSON-RPC completo) | 15397 | 11476 | -25.5 % |
| MCP `foker_context` · focal repetido con `task_id` | 7528 | 896 | -88.1 % |
| MCP `foker_context` · cross (contenido) | 7501 | 5904 | -21.3 % |
| MCP `foker_context` · cross (JSON-RPC completo) | 15354 | 12152 | -20.9 % |
| MCP `foker_context` · cross repetido con `task_id` | 7507 | 950 | -87.3 % |
| `foker sync`: AGENTS.md + CLAUDE.md (siempre cargados) | 343 | 343 | 0.0 % |
| `foker sync`: total generado | 8166 | 8119 | -0.6 % |
| `foker validate` en éxito | 5 | 11 | 120.0 % |
| `foker validate` en fallo (salida humana) | 5 | 51 | 920.0 % |
| `foker validate` en fallo: tokens hasta tener archivo:línea | 233 | 51 | -78.1 % |

## Latencia (ms)

| Medida | baseline | candidato | Δ |
|---|---:|---:|---:|
| cli_context_exploracion_p50 | 361 | 196 | -45.6 % |
| cli_context_focal_p50 | 357 | 194 | -45.8 % |
| cli_context_cross_p50 | 355 | 202 | -43.1 % |
| cli_context_aurora_p50 | 318 | 161 | -49.5 % |
| mcp_context_warm_p50 | 59 | 32 | -44.7 % |
| mcp_context_warm_p95 | 67 | 35 | -47.9 % |
| mcp_context_cold_p50 | 374 | 329 | -11.9 % |
| cli_version_p50 | 282 | 82 | -70.8 % |
| cli_version_p95 | 311 | 88 | -71.7 % |
| cli_map_cold_p50 | 338 | 177 | -47.6 % |
| cli_map_warm_p50 | 333 | 175 | -47.5 % |
| cli_map_warm_p95 | 358 | 194 | -45.8 % |

## Retención (Zero-Degradation Check)

Cada escenario exige que el contexto contenga lo necesario para completar la tarea sin lecturas extra.

| Escenario | baseline | candidato |
|---|---|---|
| exploracion | completo | completo |
| focal | falta: export function shrinkPayload | completo |
| cross | completo | completo |
| aurora | falta: x-signature | completo |
| validacion | falta: archivo:línea + TS2322 en la salida humana | completo |

Determinismo (candidato, dos ejecuciones byte a byte): exploracion idéntico, focal idéntico, cross idéntico, aurora idéntico.

## Reproducir

```sh
pnpm build:native && pnpm build
pnpm bench:tokens -- --baseline-ref bfca7de --runs 7
```
