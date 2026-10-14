# ADR-040 · Compresor de catálogos de herramientas derivado de caveman

- **Estado**: Aceptada (decisión de la persona, 2026-10-14). Efecto medido: ver Resultados.
- **Fecha**: 2026-10-14
- **Issue**: FKR-108
- **Modifica**: ADR-039 punto 2 («ningún código upstream se redistribuye»).

## Contexto
La persona pidió integrar código real de JuliusBrussee/caveman (Apache-2.0 desde 3.0.0, commit
`d262ab3`). El código es Go (`engine/`, `shrink/`) y Python (`caveman-compress`); Foker es Rust y
TypeScript. Se evaluó portar `toolschema` (compresor de catálogos MCP), portar todos los
`compressors/` (unas 3.000 líneas) o ejecutar el binario `caveman-shrink` (descarga en ejecución,
choca con la ejecución segura de Foker). La persona eligió portar `toolschema`.

## Decisión
`packages/engine/src/compressor/toolschema.ts` es una obra derivada con cambios de
`engine/compressors/toolschema.go`: `shrinkToolCatalog` y `reduceDescription`. Cumple Apache-2.0
§4: texto de la licencia en `LICENSES/Apache-2.0.txt`, aviso de derivación y de cambios en la
cabecera del archivo y en `NOTICE`. No se usa el nombre ni el logotipo «Caveman» como marca.
No se porta el quitador de anotaciones por bytes: aquí el JSON se reserializa, de modo que no
conserva `cache_control`; no aplicarlo a catálogos con puntos de caché.

## Comportamiento
Quita `examples`, `example`, `$comment`, `title` y `$schema` (no cuando son nombres de propiedad).
Conserva `enum`, `required`, `default`, `const` y `$ref`. Descripciones de hasta 160 caracteres
enteras; las largas quedan en la primera frase sin restricción (80 caracteres) más cada frase con
marcador de restricción. Con pérdida y visible para el modelo; falla abierto.

## Resultados
HECHO: sobre `mcp-tools.json` de Foker, 14.227 → 13.865 caracteres (2,5 %). El catálogo propio ya es
compacto; el valor está en catálogos MCP de terceros. No se mide efecto en tokens ni en elección de
herramienta. No está conectado al servidor MCP de Foker.

## Consecuencias
- (+) Primer código upstream real, con licencia y atribución trazables.
- (−) Sin tests propios (eliminados en 0.0.0); verificado con humo manual.
- (−) Deriva respecto a upstream: no se sincroniza.
