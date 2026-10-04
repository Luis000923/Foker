# ADR-002 · Arquitectura políglota Rust + TypeScript

- **Estado**: Aceptada (ratifica la decisión original con nueva justificación)
- **Fecha**: 2026-10-04

## Contexto
DIS proponía TypeScript en su totalidad; ESP y V1 introducían un núcleo Rust justificado con cifras de rendimiento (10x–36x) de fuentes secundarias.

## Problema
Decidir dónde vive el procesamiento del repositorio y por qué, sin depender de cifras no verificadas.

## Decisión
Rust (`foker-map`, `foker-context`) para todo lo que recorre el árbol completo o debe ser determinista bit a bit (parseo, resolución, grafo, PageRank, BM25, selección, hash, persistencia, normalización de rutas). TypeScript para lo que habla con humanos, procesos y protocolos (CLI, MCP, políticas, validación, ledger, integraciones). Reparto detallado en FOKER-SPEC §7.1.

## Alternativas
1. *TypeScript-only con `web-tree-sitter` (WASM)*: distribución trivial (sin binarios por plataforma), un solo lenguaje. Contras: paralelismo limitado (workers), memoria del GC con grafos grandes, determinismo numérico más difícil de garantizar entre motores. Viable; descartada porque el coste de la matriz de binarios es asumible y se prefiere un núcleo reutilizable (futuro LSP/binario).
2. *Rust-only (CLI y MCP en Rust)*: un binario; pero el SDK MCP de referencia, los generadores y el ecosistema de los proyectos objetivo son TypeScript. Descartada.
3. *Go*: buen binario único; sin ventaja frente a Rust para tree-sitter y peor integración con Node. Descartada.

## Consecuencias
- (+) Algoritmos deterministas en un único lugar.
- (−) Matriz de compilación nativa (ADR-014) y contribuidores necesitan Rust para tocar el núcleo.
- Las cifras de rendimiento son TARGET a medir (REQ-MAP-003, REQ-CTX-004), no justificación.
