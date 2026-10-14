# ADR-039 · Integración de proyectos upstream sobre la topología existente

- **Estado**: Aceptada (decisión de la persona, 2026-10-14). Cifras de ahorro de tokens: sin medir en Foker.
- **Fecha**: 2026-10-14
- **Issue**: FKR-108
- **Modifica**: contratos `foker-md` (campo opcional `architecture`) y nuevo esquema `design-tokens` (ADR-019).

## Contexto
Se pidió integrar cuatro proyectos de código abierto (vercel-labs/skills, JuliusBrussee/caveman,
mukul975/Anthropic-Cybersecurity-Skills, nexu-io/open-design). El encargo original suponía otra
topología de paquetes (`rust-ast`, `context-engine`, `security-skills`, `design-tokens`). Cambiarla
exige un ADR y rompe ADR-015 y el grafo de FOKER-SPEC §4.2. La persona eligió mapear todo sobre los
paquetes existentes, sin renombrar ni reestructurar.

## Decisión
1. **Topología intacta.** Mapa: skills → `engine` + `cli`; compresión → `engine` (+ proyección en `mcp`);
   reglas de seguridad → `policy` (+ `foker check-security` en `cli`); design tokens → `schemas` +
   plantilla `nextjs-turbo`. El AST sigue en los crates Rust (`foker map`).
2. **Reimplementación, no copia.** Ningún código upstream se redistribuye. `NOTICE` y
   `COLLABORATORS.md` acreditan a los autores y licencias declarados por la persona (verificar contra
   cada repositorio antes de publicar).
3. **Skills sin configuración.** `foker.md` admite `architecture` (`stack`, `orm`, `auth`,
   `security.owasp_asvs`). `foker skill install [--yes]` resuelve las skills incluidas necesarias y las
   **copia** a `foker/skills/` (ADR-010 prohíbe enlaces simbólicos en skills). `foker init` lo ejecuta si
   `foker.md` declara `architecture`. Las skills viajan en las secciones `static` del Context Pack
   (`rules`, `skill`), antes de `session` y `task`: es el prefijo estable que favorece el caché del
   anfitrión (ADR-016). El descuento real se **mide**, no se supone.
4. **Compresión determinista** (`engine/src/compressor`). `shrinkPayload` reduce JSON, YAML, CSV y logs de
   compilación/tests; nunca altera código, rutas, comandos, negaciones ni avisos de seguridad; si el
   resultado no es menor, devuelve el original. **Bypass estricto** de `.html`, `.htm`, `.tsx` y `.jsx`:
   el código va por el mapa AST. La directiva de salida ASD-STE100 (≤ 20 palabras por frase, voz activa,
   sin cortesías) se añade a los roles. Los porcentajes citados por el encargo (63,6 %, 33,2 %, 98 %…)
   son afirmaciones upstream: no se reproducen como promesa de Foker.
5. **Reglas defensivas** (`policy/src/security`). 15 reglas estáticas con identificador `FKR-SEC-NNN`,
   mapeadas a OWASP ASVS 5.0 (ADR-017: sin afirmar cumplimiento). Son heurísticas léxicas, no un SAST
   completo: pueden tener falsos positivos y negativos.
6. **Design Tokens estáticos.** Esquema `design-tokens` (tipografía, color claro/oscuro, espaciado, radios).
   La plantilla incluye `foker/design-tokens.json`; `foker init` genera `apps/web/app/tokens.css` y
   `foker.md` puede elegir el preset.

## Alternativas
1. *Crear los paquetes del encargo*: rechazada por la persona.
2. *Vendorizar el código upstream*: arrastra licencias y deriva; rechazada.

## Consecuencias
- (+) Sin migraciones; contratos ampliados solo con campos opcionales.
- (−) Las reglas de seguridad no sustituyen un SAST ni una revisión ASVS.
- (−) `pnpm turbo run lint typecheck test` no existe en este repo (ADR-015: Turborepo solo en la
  plantilla); la verificación es `pnpm verify`.
