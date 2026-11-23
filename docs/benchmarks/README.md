# Benchmarks

`tokens.md` y `tokens.json` los genera `scripts/bench-tokens.ts`; no se editan a mano.

```sh
pnpm build:native && pnpm build
pnpm bench:tokens -- --baseline-ref <ref> --runs 7 --out docs/benchmarks/tokens.md --json docs/benchmarks/tokens.json
```

`--baseline-ref` compila esa referencia en un worktree temporal (con su propio `CARGO_TARGET_DIR`) y
lo borra al terminar; `--baseline-bin` usa una CLI ya compilada. El script sale con código 1 si el
candidato pierde retención que el baseline tenía o si una salida no es determinista.

## Cómo leer `tokens.md` (sesión 2, baseline `bfca7de`)

- **Project Map (`foker://map/outline`) sube de 75 a 1714 tokens: corrige un bug, no es una
  regresión.** El recurso trataba `project.files` (un array) como objeto y listaba índices
  (`0: `, `1: `…) sin rutas ni símbolos. Ahora da las 50 rutas de mayor PageRank con hasta 12
  nombres exportados cada una. El mismo error dejaba sin archivos la comprobación de rutas
  protegidas de `foker_task_begin` y `task begin` (solo quedaba la heurística por glob).
- **aurora sube un 15,5 %** porque el pack incluye ahora las secciones relevantes de
  `REQUIREMENTS.md` (la cabecera `x-signature` que pide el escenario). Sin ellas, el agente tendría
  que leer el documento entero aparte.
- **`validate` en éxito pasa de 5 a 11 tokens** (añade checks y tiempo). En fallo, la salida humana
  ya basta para actuar: 51 tokens frente a 233 del baseline, que exigía repetir con `--json`.
- **JSON-RPC completo** cuenta `content` y `structuredContent`: el texto del pack va en ambos por
  compatibilidad con clientes que leen solo uno de los dos.
- **`tools/list`** mide el JSON de las herramientas tal como se publica. Cuánto de él llega al
  modelo depende del anfitrión: algunos solo inyectan nombre, descripción y esquema de entrada.
- **Latencias**: p50/p95 de procesos reales en la máquina que ejecuta el script; comparables solo
  dentro del mismo informe. `mcp_context_cold` va desde el arranque del proceso hasta la primera
  respuesta, carga de módulos incluida.
- **Retención** es un oráculo de 5 escenarios (cadenas que el agente necesita ver). No sustituye a
  una batería de calibración amplia.
