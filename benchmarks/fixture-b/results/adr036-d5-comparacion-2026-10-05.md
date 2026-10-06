# FKR-097 · Comparación del flujo D5 por caso

Defaults congelados, presupuesto 8000, 45 casos. Main: binario aislado de e749daa conservado de la prueba de identidad; sus recalls, cobertura y errores por split reproducen `offline-eval-2026-10-05.json` (que solo publica agregados). Validation: `adr036-validation-2026-10-05.json`.

Cada triple sigue el orden **main / D1–D4 (validation) / D5**. La columna de alcance muestra las rutas que entran (+) o salen (−) con D5 frente a validation; se comparan también las rutas frente a main en el JSON adjunto.

| Caso | Recall flujo | Cobertura | Error de alcance | Cambio de alcance frente a validation |
|---|---|---|---|---|
| b-query-01 | 0 / 1 / 1 | 0 / 0 / 0 | no / no / no | sin cambios |
| b-query-02 | 0 / 1 / 1 | 1 / 1 / 1 | no / no / no | + `packages/query-core/src/**`; − `packages/query-test-utils/src/**` |
| b-query-03 | 0.5 / 0.5 / 0.5 | 1 / 1 / 1 | no / no / no | sin cambios |
| b-query-04 | 1 / 1 / 1 | 1 / 1 / 1 | no / no / no | sin cambios |
| b-query-05 | 1 / 1 / 1 | 0 / 0 / 0 | no / no / no | sin cambios |
| b-query-06 | 0.5 / 1 / 1 | 1 / 1 / 1 | no / no / no | sin cambios |
| b-query-07 | 1 / 1 / 1 | 1 / 1 / 1 | no / no / no | + `packages/query-persist-client-core/src/**`; − `packages/query-test-utils/src/**` |
| b-query-08 | 0 / 1 / 1 | 0 / 1 / 1 | no / no / no | sin cambios |
| b-query-09 | 1 / 1 / 1 | 1 / 1 / 1 | no / no / no | sin cambios |
| b-query-10 | 1 / 0 / 1 | 0 / 0 / 1 | no / no / no | + `packages/query-core/src/**`; − `packages/preact-query-devtools/src/**` |
| b-query-11 | 1 / 1 / 1 | 1 / 1 / 1 | no / no / no | sin cambios |
| b-query-12 | 0 / 0.333333 / 0.333333 | 1 / 1 / 1 | no / no / no | sin cambios |
| b-query-13 | 0 / 1 / 1 | 1 / 1 / 0 | no / no / no | − `packages/query-devtools/src/**` |
| b-query-14 | 1 / 1 / 1 | 1 / 1 / 1 | no / no / no | sin cambios |
| b-query-15 | 0 / 1 / 1 | 0 / 0 / 0 | no / no / no | sin cambios |
| b-vite-01 | 0 / 1 / 1 | 1 / 0 / 1 | no / no / no | + `packages/vite/src/node/**`; − `playground/ssr-deps/src/**` |
| b-vite-02 | 0.5 / 1 / 1 | 0 / 0 / 0 | no / no / no | − `playground/assets/**` |
| b-vite-03 | 0 / 0.5 / 0.5 | 0 / 0 / 0 | no / no / no | sin cambios |
| b-vite-04 | 0 / 0 / 0 | 0 / 0 / 0 | no / no / no | sin cambios |
| b-vite-05 | 1 / 1 / 1 | 0 / 0 / 0 | no / no / no | sin cambios |
| b-vite-06 | 0 / 0 / 0 | 0 / 0 / 0 | no / no / no | sin cambios |
| b-vite-07 | 0 / 0 / 0 | 1 / 0 / 1 | no / no / no | + `packages/vite/src/node/**`, `packages/vite/src/node/server/**`, `playground/optimize-deps/dep-with-dynamic-import/**`; − `playground/**` |
| b-vite-08 | 1 / 1 / 1 | 1 / 0 / 1 | no / no / no | + `packages/vite/src/node/**`; − `playground/css/**` |
| b-vite-09 | 1 / 1 / 1 | 1 / 1 / 1 | no / no / no | + `packages/plugin-legacy/src/__tests__/**` |
| b-vite-10 | 0 / 0 / 0 | 0 / 0 / 0 | no / no / no | + `playground/ssr-resolve/**` |
| b-vite-11 | 0.4 / 0.8 / 0.8 | 1 / 1 / 1 | no / no / no | + `packages/vite/src/node/server/middlewares/**`; − `playground/**` |
| b-vite-12 | 0 / 1 / 1 | 0 / 0 / 0 | no / no / no | + `playground/fs-serve/root/**`; − `playground/**` |
| b-vite-13 | 1 / 1 / 1 | 0 / 0 / 0 | no / no / no | + `packages/vite/src/client/**`; − `playground/**` |
| b-vite-14 | 1 / 1 / 1 | 0 / 0 / 0 | no / no / no | sin cambios |
| b-vite-15 | 0.5 / 0.5 / 0.5 | 0 / 0 / 0 | no / no / no | sin cambios |
| b-zod-01 | 0 / 1 / 1 | 1 / 0 / 1 | no / no / no | + `packages/zod/src/v3/**`, `packages/zod/src/v4/core/**`, `packages/zod/src/v4/mini/**`; − `packages/zod/src/v3/helpers/**` |
| b-zod-02 | 0 / 1 / 1 | 0 / 0 / 1 | no / no / no | + `packages/zod/src/v3/**`, `packages/zod/src/v4/core/**` |
| b-zod-03 | 0.666667 / 1 / 1 | 1 / 1 / 1 | no / no / no | sin cambios |
| b-zod-04 | 0.25 / 0 / 0.25 | 0.5 / 0 / 1 | no / sí / no | + `packages/zod/src/v4/classic/**`, `packages/zod/src/v4/core/**`, `packages/zod/src/v4/mini/**` |
| b-zod-05 | 0 / 1 / 1 | 1 / 1 / 1 | no / no / no | + `packages/zod/src/v3/**` |
| b-zod-06 | 1 / 1 / 1 | 1 / 0 / 1 | no / no / no | + `packages/zod/src/v4/core/**`; − `packages/zod/src/v3/benchmarks/**` |
| b-zod-07 | 0 / 0.5 / 0.5 | 0 / 0 / 0 | no / no / no | + `packages/zod/src/v3/**`, `packages/zod/src/v4/core/**`; − `packages/zod/src/v3/helpers/**` |
| b-zod-08 | 0 / 0 / 1 | 1 / 0 / 1 | no / sí / no | + `packages/zod/src/v4/classic/**`, `packages/zod/src/v4/core/**`, `packages/zod/src/v4/mini/**` |
| b-zod-09 | 0 / 1 / 1 | 1 / 0 / 1 | no / no / no | + `packages/zod/src/v4/core/**`; − `packages/zod/src/v3/benchmarks/**` |
| b-zod-10 | 0.5 / 1 / 1 | 1 / 0 / 1 | no / no / no | + `packages/zod/**`, `packages/zod/src/v4/core/**`, `vitest.root.mjs`; − `packages/zod/src/v3/benchmarks/**` |
| b-zod-11 | 0 / 0 / 1 | 0 / 0 / 1 | no / sí / no | + `packages/zod/src/v4/classic/**`, `packages/zod/src/v4/core/**`, `packages/zod/src/v4/mini/**` |
| b-zod-12 | 0 / 0 / 1 | 0 / 0 / 0 | no / sí / no | + `packages/zod/src/v3/**`, `packages/zod/src/v4/core/**` |
| b-zod-13 | 1 / 1 / 1 | 0 / 0 / 0 | no / no / no | + `packages/zod/src/v4/core/**`; − `packages/zod/src/v3/benchmarks/**` |
| b-zod-14 | 0 / 1 / 1 | 1 / 1 / 1 | no / no / no | sin cambios |
| b-zod-15 | 0 / 0 / 1 | 1 / 0 / 1 | no / sí / no | + `packages/tsc/**`, `packages/zod/src/v4/classic/**`, `packages/zod/src/v4/core/**` |
