# Project Map

Resumen de FOKER-SPEC §8. Esquema normativo: `packages/schemas/schemas/project-map.schema.json`.

## Qué es

Grafo determinista de archivos, símbolos, paquetes y dependencias del proyecto gestionado, guardado
en `.foker/project-map.json`. Es estado derivado: siempre se puede reconstruir desde el código.

## Construcción (`crates/foker-map`)

| Paso | Módulo | Notas |
|---|---|---|
| Descubrimiento | `discover` | `.gitignore` del árbol (no el global), include/exclude, `max_file_bytes`, `max_files`. Nunca entra en `node_modules`, `.git`, `.foker`; los secretos se descartan por id antes de leer |
| Parseo | `parse` | tree-sitter, recorrido explícito del árbol (ADR-020). Símbolos, imports, exports, herencia, referencias |
| Workspace | `project` | pnpm / npm / yarn / single; paquetes con `name` |
| Resolución | `resolve` | `oxc_resolver`, un resolutor por tsconfig con caché propia; alias de paquetes del workspace |
| Grafo y PageRank | `build`, `pagerank` | Aristas tipadas de §8.2; PageRank §8.5 con `libm` en Rust puro |
| Serialización | `model`, `canonical` | JSON canónico (claves ordenadas); `content_hash` BLAKE3 sin campos volátiles |
| Persistencia | `store` | Escritura atómica, lock `.foker/map.lock`, corrupción → `.foker/cache/corrupt-*.json` |
| Motor | `engine` | Refresco incremental; sin cambios no recalcula |
| Consultas | `query` | `search`, `fileInfo`, `symbolInfo`, `impact` |

## Semántica de globs

`*` no cruza `/`; `**` sí; un glob sin `/` casa con el nombre del archivo a cualquier profundidad
(`.env` casa con `apps/web/.env`). Es la misma semántica para `include`, `exclude`, secretos,
rutas protegidas y `matchGlobs` desde TypeScript.

## Diagnósticos

| Código | Significado |
|---|---|
| `FKR-MAP-101` | Archivo con errores de sintaxis (`parse_status: partial`) |
| `FKR-MAP-102` | Archivo omitido por tamaño (`parse_status: skipped`) |
| `FKR-MAP-103` | Entrada omitida: symlink fuera del root, nombre no UTF-8 |
| `FKR-MAP-104` | Import no resuelto |
| `FKR-MAP-005` | Mapa persistido corrupto o incompatible: se aparta y se reconstruye |

## Rendimiento medido (REQ-MAP-003)

`large-10k` (10.000 archivos, 20 paquetes, semilla 42), `cargo nextest run -p foker-map --release
--run-ignored only --test perf_large`. Medición local 2026-10-03, Linux x64:

| Operación | Tiempo |
|---|---|
| Build completo | 416 ms |
| Comprobación sin cambios | 24 ms (TARGET < 100 ms) |
| Refresco tras cambiar 1 archivo | 337 ms |
| Guardado | 221 ms |
| Tamaño del mapa | 13,8 MB (criterio de revisión de ADR-005: 25 MB) |

## Uso desde TypeScript

```ts
import { openEngine } from '@foker/core';

const engine = await openEngine('/ruta/absoluta/al/proyecto');
await engine.refresh();
engine.search({ query: 'Button' });
engine.impact({ files: ['packages/ui/src/button.tsx'], direction: 'dependents', depth: 2 });
await engine.save();
```

## Consultas

`search` separa los subtérminos del texto original, conservando los límites camelCase;
la comparación literal ignora mayúsculas. Así, `getUserById` encuentra `get-user-by-id.ts`.

En `impact`, un símbolo de origen siembra también su archivo contenedor a distancia 0,
con `via: "declares"` y `kind: "file"`, para `dependencies` y `both`. En `dependents`,
el origen símbolo recorre sus usuarios sin sembrar su archivo. Un archivo indicado
explícitamente como origen conserva `via: null`.

Los ajustes del contrato nativo del motor respecto a ADR-019 se documentan en
[ADR-021](adr/ADR-021-contrato-nativo-engine.md).
