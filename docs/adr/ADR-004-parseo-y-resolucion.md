# ADR-004 · Parseo con tree-sitter y resolución con oxc_resolver

- **Estado**: Aceptada (tree-sitter ratificado; resolución nueva)
- **Fecha**: 2026-10-04

## Contexto
El Project Map necesita símbolos e imports de TS/TSX/JS/JSX y, sobre todo, saber a qué archivo apunta cada import en monorepos con `tsconfig` paths, paquetes `workspace:` y `exports` condicionales. La investigación no trataba la resolución.

## Problema
Sin resolución no hay grafo útil; sin parser tolerante a errores, un archivo a medio editar rompe el mapa.

## Decisión
- **Parseo**: tree-sitter (crate `tree-sitter` 0.27 y gramática `tree-sitter-typescript`, que aporta `typescript` y `tsx`), con *queries* `.scm` versionadas en el repo. Archivos con nodos ERROR → `parse_status: partial` (se extrae lo posible).
- **Resolución**: `oxc_resolver` (11.x), algoritmo compatible con Node y con soporte de tsconfig paths, configurado según FOKER-SPEC §8.3. Imports no resueltos → diagnóstico, nunca aristas inventadas.

## Alternativas
1. *`oxc_parser` para parsear*: AST completo y muy rápido, precisión total para TS; pierde la tolerancia a errores de tree-sitter y el camino multi-lenguaje. **Alternativa principal** si la gramática de tree-sitter se queda atrás (RIESGO R-07; la versión publicada de la gramática es de 2024-11).
2. *TypeScript Compiler API* (desde TS): precisión semántica máxima (tipos), pero lento, en JS, y TypeScript 7 cambia su implementación a nativa; demasiado acoplado.
3. *Resolución propia*: reimplementar el algoritmo de Node/TS es una fuente conocida de errores. Descartada.

## Consecuencias
- (+) Grafo correcto en monorepos reales; tolerancia a errores.
- (−) Dos dependencias críticas que seguir; fixtures `resolution-cases` y `edge-cases` obligatorios.
