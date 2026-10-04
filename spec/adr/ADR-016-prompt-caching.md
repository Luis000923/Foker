# ADR-016 · Prompt caching: estabilidad de secciones en el MVP, control explícito en el runner

- **Estado**: Experimental
- **Fecha**: 2026-10-04

## Contexto
La investigación diseñaba el contexto alrededor de `cache_control` de Anthropic con cifras fijas (mínimo 1.024 tokens, descuento 90 %). HECHO verificado (docs oficiales, 2026-10-04): prefijo tools→system→messages; ≤ 4 breakpoints; caché automático disponible; mínimos 512–4.096 según modelo; TTL 5 min (escritura 1,25×) o 1 h (2×); lectura 0,1× salvo excepciones (0,05× Opus 5.5; 0,025× Fable/Mythos 5.1).

## Problema
En el MVP Foker no construye el prompt (ADR-001); además las cifras varían por modelo y proveedor.

## Decisión
- MVP: el Context Pack separa secciones `static/session/task`, en orden estable→dinámico y sin datos volátiles en las estáticas, lo que favorece el caché del anfitrión sin depender de él. Se **mide** (`cache_read_input_tokens`, `cache_creation_input_tokens`), no se supone.
- V0.2 (runner): adaptador por proveedor que coloca breakpoints tras `tools`, tras `rules+core+skill` y tras `task_scope`; TTL elegido por patrón de uso; mínimo y precios leídos de una tabla versionada por modelo.

## Alternativas
1. *Optimizar solo para Anthropic*: viola la independencia del proveedor.
2. *Ignorar el caching*: renuncia a un ahorro potencialmente grande en el runner.

## Consecuencias
- (+) Sin promesas no verificables en el MVP; diseño listo para el runner.
- (−) El beneficio del caching en el MVP depende del anfitrión.
