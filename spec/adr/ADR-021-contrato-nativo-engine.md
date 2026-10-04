# ADR-021 · Contrato nativo del motor

- **Estado**: Aceptada
- **Fecha**: 2026-10-03

## Contexto
`spec/api/foker-core.d.ts` se reconstruyó inicialmente según ADR-019 a partir de FOKER-SPEC
§7–§9. La implementación del motor y las consultas (FKR-028 y FKR-029) concreta la configuración,
el refresco y la propagación de errores entre Rust, el addon napi-rs y `@foker/core`.

## Problema
La reconstrucción inicial exige configuración completa, mezcla configuración de contexto con el
motor del mapa y permite limitar el refresco por rutas sin necesidad medida. También faltan campos
y métodos para consultar diagnósticos de carga, frescura y símbolos de un archivo. Las funciones
async de napi-rs no admiten un estado de error propio para transportar los códigos de Foker.

## Decisión
Se documentan los siguientes cambios del contrato normativo `spec/api/foker-core.d.ts` respecto a
la reconstrucción inicial (ADR-019); esta decisión actualiza el resumen de FOKER-SPEC §7.2 y §7.4:

- Los campos de `EngineConfig` son opcionales, incluidos los globs de `kinds`. Los valores omitidos
  toman los defaults definidos en Rust (`MapConfig::default()` y `KindGlobs::defaults()`), sin
  duplicarlos en TypeScript. `FokerEngine.open` admite omitir la configuración.
- Se añade `EngineConfig.readOnly?: boolean` (por defecto `false`) para cumplir FOKER-SPEC
  §16.5 en `map --check` y `map --dry-run`: valida sin apartar mapas corruptos, refresca en
  memoria y no guarda la caché de parseo. `save()` falla con `StoreError::Write` y el mensaje
  "motor abierto en modo solo lectura" antes de crear archivos o adquirir el lock.
- Se elimina `EngineConfig.context`: la configuración de contexto pertenece a `buildContext` y
  se concretará en FKR-033 y posteriores, sin anticipar ahora su contrato.
- Se elimina `RefreshOptions.paths`. El refresco incremental compara tamaño y mtime de todo el
  árbol; la comprobación sin cambios medida en `large-10k` tarda 24 ms para 10.000 archivos
  (Linux x64, 2026-10-03; `docs/project-map.md`). Limitar rutas no aporta una mejora necesaria
  y puede dejar cambios fuera del refresco. Se conserva `RefreshOptions.full`.
- Se añade `loadDiagnostics(): Diagnostic[]` para exponer avisos de carga, como un mapa persistido
  corrupto (`FKR-MAP-005`), sin convertir la recuperación en un fallo de apertura.
- Se añade `checkStale(): Promise<number>` para comprobar diferencias con el disco sin reconstruir
  el mapa ni bloquear el hilo de Node.
- Se añade `RefreshReport.unchanged: boolean` para indicar que no hubo cambios en disco ni recálculo
  (REQ-MAP-003).
- Se añade `FileInfo.symbols: string[]` con los ids de los símbolos declarados en el archivo.
- Las funciones async del addon entregan el código como prefijo `[FKR-…] ` del mensaje, porque
  napi-rs no admite un estado de error propio en async. `@foker/core` reconoce y retira ese prefijo
  al normalizar el error a `FokerError.code`. Las funciones síncronas mantienen el código nativo
  en `error.code`; los consumidores de `@foker/core` reciben el mismo modelo de error.

## Alternativas
1. *Mantener la configuración obligatoria y de contexto*: duplica defaults en los consumidores
   y acopla el motor del mapa a una funcionalidad pendiente.
2. *Conservar el refresco por rutas*: añade complejidad y riesgo de frescura incompleta sin una
   necesidad respaldada por la medición actual.
3. *Usar el código genérico de napi-rs en async*: pierde los códigos de dominio y su clasificación
   de recuperación; cambiar a métodos síncronos bloquearía el hilo de Node.

## Consecuencias
- (+) Configuración mínima, defaults centralizados y consultas explícitas de carga y frescura.
- (+) Refresco completo del árbol con una vía rápida medida y errores uniformes en `@foker/core`.
- (+) Los tests de contrato entre el binding generado y el `.d.ts`, y los tests del wrapper,
  verifican la compatibilidad y la normalización de errores.
- (−) Los consumidores de la reconstrucción inicial deben retirar `context` y `paths` y adaptar
  los campos añadidos; quien use directamente el addon debe reconocer el prefijo de errores async.
- (−) La medición de 24 ms es local, no una garantía universal; se revisará si aparecen necesidades
  de rendimiento que justifiquen otro mecanismo incremental.

## Ampliación FKR-041
Se añade `hashCanonicalJson(json: string): string`, que devuelve `blake3:<64 hex>`.
El addon delega canonicalización y hash a `foker_map::canonical`; JSON inválido produce
`FKR-INP-001`. Engine calcula el hash de { validation, env_allowlist } efectivos; policy recibe el hash y
no depende del addon. Es una ampliación compatible de la API nativa v1.

## Ampliación FKR-040: configuración de contexto
Se añade `ContextRequest.coreFiles?: number`, con default 15. El addon lo transmite a
`ContextInputs.core_files`; cero desactiva los archivos de la sección core. La CLI pasa
`context.core_files` efectivo sin reemplazar cero por el default.
