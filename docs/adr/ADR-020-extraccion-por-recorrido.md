# ADR-020 · Extracción de símbolos por recorrido del árbol, no por queries `.scm`

- **Estado**: Aceptada
- **Fecha**: 2026-10-03

## Contexto
FOKER-SPEC §8.3 (paso 4) indica extraer símbolos e imports con *queries* tree-sitter versionadas en
`crates/foker-map/queries/<lang>/*.scm`.

## Problema
Los campos de `symbols[]` (nombre calificado con padre, sufijos `~n` por orden de aparición, estado de
exportación que depende de `export { x }` posteriores, firma sin cuerpo, JSDoc adyacente) requieren
lógica sobre el árbol que las queries no expresan; habría que combinar queries con código igualmente.

## Decisión
`foker_map::parse` recorre el árbol sintáctico en Rust de forma explícita, en orden de documento.
La versión de las gramáticas forma parte de `generator.parsers` y un test comprueba que coincide con
`Cargo.lock`; un cambio de gramática o de extractor invalida el mapa (reconstrucción completa, §8.4).
Los snapshots de `crates/foker-map/tests/snapshots/` son el contrato de la extracción.

## Alternativas
1. *Queries `.scm` + post-proceso*: dos lugares que mantener sincronizados; sin ventaja de rendimiento.
2. *oxc_parser*: AST completo de TS, pero sin tolerancia a errores equivalente (§ADR-004).

## Consecuencias
- (+) Un solo lugar con la lógica; determinista; probado con snapshots.
- (−) Añadir un lenguaje exige código Rust, no solo queries (fuera del MVP).
