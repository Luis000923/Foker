# ADR-003 · Puente Rust ↔ Node.js con napi-rs v3

- **Estado**: Aceptada
- **Fecha**: 2026-10-04

## Contexto
El núcleo Rust debe usarse desde la CLI y el servidor MCP en Node.js sin exigir toolchains al usuario.

## Problema
Elegir mecanismo de enlace, contrato, errores, concurrencia y distribución.

## Decisión
Addon Node-API con **napi-rs v3** (`napi` 3.x, `@napi-rs/cli` 3.x). Clase `FokerEngine` + funciones utilitarias con contrato en `api/foker-core.d.ts`. Errores con `napi::Error<FokerCode>` (fija `error.code`, HECHO verificado). Trabajo pesado en `async fn` (runtime Tokio de napi-rs) con `spawn_blocking`. Binarios precompilados por plataforma como `optionalDependencies` (patrón estándar de napi-rs), sin `postinstall`.

## Alternativas
1. *Proceso hijo Rust con JSON-RPC por stdio*: aislamiento de fallos, sin ABI; coste de serialización y gestión de procesos, dos binarios. Reserva si el addon resultara inestable.
2. *WASM (wasm-bindgen / WASI)*: portable; tree-sitter con C en WASM complica el build y el rendimiento multihilo. Future como fallback de plataformas sin binario.
3. *node-gyp / N-API en C++*: más frágil y sin ventaja.

## Consecuencias
- (+) Llamadas in-process, tipos generados, sin compilación en la máquina del usuario.
- (−) Un pánico en Rust puede abortar el proceso Node: `panic = "unwind"` en el addon y `catch_unwind` en cada frontera, convertido a `FKR-INT-001`.
- (−) Versiones en lockstep obligatorias (REQ-NAPI-003).
