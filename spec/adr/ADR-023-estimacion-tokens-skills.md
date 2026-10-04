# ADR-023 · `estimateTokens` en la API nativa para validar Skills

- **Estado**: Aceptada
- **Fecha**: 2026-10-04

## Contexto
FKR-061 debe comprobar que `SKILL.md` no supera 5.000 tokens (FOKER-SPEC §13.2) con el mismo
estimador que el Context Engine (`bytes-lf/3.2@1`, §9.7).

## Problema
El estimador existía en `foker_context::estimate_tokens`, pero no estaba expuesto a TypeScript.
Reimplementarlo en TS duplicaría una regla versionada en el pack.

## Decisión
Se añade `estimateTokens(text: string): number` a la API nativa (ya prevista en FOKER-SPEC §7.2) y a
`@foker/core`. El binding solo delega en el núcleo bajo `guard` y satura a `u32`. Cambio aditivo:
`nativeApi` sigue en 1.

## Alternativas
1. *Estimador propio en TypeScript*: dos implementaciones que pueden divergir.
2. *Contar caracteres*: no coincide con el presupuesto del Context Pack.

## Consecuencias
- (+) Un único estimador para packs y validación de skills.
- (−) Un addon antiguo produce `FKR-INT-002`; se recompila junto al paquete (lockstep).
