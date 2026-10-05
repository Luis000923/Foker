# ADR-035 · Fixture B: repositorios reales, curación de tareas y ctx-gold

- **Estado**: Propuesta. Reglas de selección **congeladas antes de enumerar candidatos**
  (este commit precede al minado). La ejecución pagada exige autorización humana.
- **Fecha**: 2026-10-04
- **Issues**: FKR-014 (fixture), FKR-015 (línea base), FKR-018 (benchmark)
- **Amplía**: ADR-018 (benchmark), ADR-025, ADR-029, docs/bench/fixture-b-criterios.md (FKR-093)
- **Decisión humana**: PREGUNTA-6, selección inicial Vite, TanStack Query y Zod, sujeta a E1–E8.

## Identidad de cada repositorio

- SHA de identidad = último commit first-parent de la rama por defecto con fecha de commit
  ≤ **2026-09-30T23:59:59Z**:
  - Vite: `cf5c0288d526824aead1b24e977400f13c527927`
  - TanStack Query: `b90d8cee92c931773df73a39c9aa6cfc30afe5a1`
  - Zod: `004d800c9e3cd4c79930f55aa4ad080225b22efd`
- Cada tarea fija además su base B = padre del commit C (no usa HEAD ni etiquetas).
- Conteos de E2/E3 con `cloc` 1.96 (paquete npm `cloc@2.11.0`, sha256 del script
  `099b5223…`) sobre `git ls-tree` del SHA, con la misma regla de exclusión para todos
  (`tools/eligibility.py` en el expediente de Fixture B).

## Ventana y reglas de minado (fijadas ahora)

Universo: commits C first-parent de la rama por defecto con fecha de commit en
**[2026-04-01T00:00:00Z, 2026-09-30T23:59:59Z]** y ancestros del SHA de identidad.

Un C es **candidato** si cumple todo:

1. Un solo padre (B = C^1).
2. Asunto que no empieza por `chore`, `ci`, `docs`, `build`, `release`, `test`, `style`
   ni `revert`, con o sin ámbito, y no es una actualización de dependencias.
3. Modifica (no solo añade) entre **1 y 5** archivos TS propios (`.ts/.tsx/.mts/.cts`, no `.d.ts`)
   fuera de tests y de las exclusiones de E2/E3.
4. Añade o modifica al menos un archivo de test TS (misma regex de tests de E2/E3).
5. No cambia lockfiles, `package.json`, `pnpm-workspace.yaml`, `.nvmrc` ni configuración
   de TypeScript/test (`tsconfig*.json`, `vitest*.config.*`).
6. Toca como máximo 20 archivos en total.

Los candidatos se ordenan por `sha256("fixture-b-42:" + C)` y se verifican en ese orden hasta
**15 aceptados por repo** o hasta agotar la lista. Todos los rechazos quedan registrados con su
motivo. No se sustituyen tareas tras ver resultados de los brazos.

## Verificación de cada tarea (E4/E8)

En el entorno del repo (imagen por repo, ver abajo) y sin red:

- **F2P**: los tests añadidos o modificados por C, aplicados sobre B, deben fallar con al menos
  un caso de test fallido (no solo por un error de carga ajeno a la conducta) y pasar en
  B + gold + tests.
- **P2P**: los demás archivos de test de los paquetes afectados deben pasar en B y en
  B + gold + tests.
- Tipos y lint del paquete afectado pasan en B + gold + tests.
- 3 repeticiones; cualquier inestabilidad, skip nuevo o dependencia de red, reloj o servicio
  rechaza la tarea.
- Gold = cambios de C fuera de los tests; los tests de C son la evaluación oculta.

## Enunciados

Se redactan a partir del **diff de los tests F2P y del título del PR**, nunca del diff del gold.
No pueden contener rutas ni nombres de archivos del gold, ni nombres de símbolos internos que no
aparezcan en la API pública que usa el test. Claude audita fugas y la revisión humana (§6 de
los criterios) sigue pendiente. El tipo (fix/feature) se toma del asunto del commit.

## ctx-gold de Fixture B (separado de la evaluación)

- Se genera de forma determinista desde las tareas aceptadas: `gold_modified` = archivos TS
  propios modificados por C; `gold_symbols` = símbolo más interno del mapa de B que contiene
  cada línea cambiada (método de FKR-095). Split 50/50 por `sha256(id)`.
- **Solo evaluación**: ningún parámetro del motor se ajusta con Fixture B. Cualquier cambio
  futuro exige un ADR nuevo y un conjunto reservado distinto.
- Métricas offline (sin API): recall y precisión del pack y del flujo `begin` (ADR-032),
  recall de símbolos y tokens de anclas (ADR-033), `gold_full` (ADR-034), plegado flexivo
  on/off solo medido (sigue desactivado), tamaño del pack y tiempo de map/refresh/buildContext.

## Entorno por repositorio (pendiente de implementar antes del benchmark pagado)

Fixture B necesita imágenes por repo con el runtime y el gestor exactos (Vite: Node ≥ 22.12 y
pnpm 12.6.0; Query: Node 24.16.0 y pnpm 12.4.2; Zod: Node 24 y `nub` 0.8.3). El arnés actual
(`prepare.mjs`) solo sabe preparar Fixture A. Antes de FKR-015 hay que implementar y revisar:
preparación por tarea (checkout de B sin historial ni remotos), dependencias desde caché,
montaje de tests ocultos solo en evaluación, comandos de evaluación por tarea y paridad de las
instrucciones de agente que trae el propio upstream (p. ej. `CLAUDE.md`/`AGENTS.md` de Zod) entre
brazos.

## Riesgos de leakage declarados

- Cutoff de `claude-sonnet-5-5`: no declarado por el proveedor (**desconocido**). Commits
  de 2026 pueden estar en sus datos de entrenamiento: la fecha no prueba ausencia.
- Proyectos muy populares: el modelo puede recordar sus APIs y la solución de bugs publicados.
- Los asuntos de commit y los títulos de PR pueden revelar la solución: por eso los enunciados
  se derivan de los tests y se auditan.
- El autor del selector (Claude) ve las tareas: el motor queda congelado para Fixture B
  (ningún ajuste con estos datos).
