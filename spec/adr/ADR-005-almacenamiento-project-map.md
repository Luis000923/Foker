# ADR-005 · Almacenamiento del Project Map: JSON canónico como caché reconstruible

- **Estado**: Aceptada (con criterio de revisión)
- **Fecha**: 2026-10-04

## Contexto
La investigación usaba JSON en varias rutas distintas y sin reglas de determinismo, concurrencia ni corrupción.

## Problema
Elegir formato, ubicación, ciclo de vida y estrategia de compatibilidad.

## Decisión
- Estado de trabajo en memoria (Rust). Persistencia en `.foker/project-map.json`: JSON **canónico** (claves y colecciones ordenadas), validable con `schemas/project-map.schema.json`.
- Es **caché**: no se versiona en git, no se migra; ante incompatibilidad o corrupción se reconstruye.
- Escritura atómica + lock de archivo; verificación de `content_hash` al cargar.
- Criterio de revisión: si en `large-10k` el archivo supera 25 MB o la carga p95 supera 500 ms, abrir ADR para SQLite.

## Alternativas
1. *SQLite* (`rusqlite`): consultas e incrementales eficientes; añade migraciones, binario opaco y bloqueos multi-proceso. Aplazada a la evidencia.
2. *Binario (bincode/MessagePack)*: rápido y compacto; no inspeccionable ni validable con JSON Schema.
3. *Versionar el mapa en git*: daría contexto en clones frescos; provoca conflictos de merge y diffs ruidosos. Descartada.

## Consecuencias
- (+) Inspeccionable, diffeable, validable, simple.
- (−) Reescritura completa del archivo en cada guardado (aceptable hasta el umbral).
