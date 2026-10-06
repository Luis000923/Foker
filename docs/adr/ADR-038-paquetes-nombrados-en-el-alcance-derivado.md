# ADR-038 · Paquetes nombrados en el alcance derivado

- **Estado**: Aceptada (2026-10-05). Criterio fijado antes de implementar; cumplido (cobertura B 0,6222 → 0,6889, ningún caso empeora; cifras contrastadas por Claude).
- **Fecha**: 2026-10-05
- **Issue**: FKR-106
- **Modifica (si se acepta)**: FOKER-SPEC, `foker_task_begin` (alcance derivado sin `scope`;
  ADR-031 2b, ADR-032, ADR-036 D5). Sin cambios en esquemas, N-API ni CLI.

## Contexto (OBSERVACIÓN)

Web piloto (`~/Documentos/foker-web-piloto`, plantilla `nextjs-turbo`), tarea real con Claude Code:
«Añade al paquete @repo/ui un componente Badge … y úsalo en la página de inicio de apps/web».
`foker_task_begin` sin `scope` derivó `apps/web/app/**`: el pack solo contiene archivos existentes
y `badge.tsx` era nuevo. G1 rechazó la tarea (`packages/ui/**` fuera de alcance); el agente abrió
una segunda tarea con alcance explícito (+turnos, una tarea huérfana en `RUNNING`). Es la categoría
«archivos nuevos» del diagnóstico de ADR-036, ahora en el flujo.

## Decisión (HIPÓTESIS)

**D6**: sin `scope` explícito, el alcance derivado añade `<path>/**` de cada paquete del workspace
cuyo `name` aparece en la descripción de la tarea, con la misma regla de límites que D4
(`package_mentions`, ADR-036: `@scope/name-extra` no nombra `@scope/name`). Restricciones:

- Nunca el paquete raíz (`path: '.'`): equivaldría a `**` y `begin` lo rechazaría (ADR-032).
- Como máximo **2** paquetes nombrados; si hay más, ninguno (la tarea es ambigua y el alcance se
  inflaría).
- Se aplica `assertUnprotectedScope` como hoy; el resultado se deduplica y ordena.
- Solo alcance derivado: un `scope` explícito no cambia.

## Umbrales (fijados a priori)

Base medida el 2026-10-05 antes de implementar. Medidos con `fixture_b_eval` (modo flujo, 45 casos) y `fixture_a_barrier`, frente a `main`
(`97ed1d4` y posteriores sin cambios del motor):

| Métrica | Base `main` | Exigido |
|---|---|---|
| Cobertura de alcance B, todos | 0,6222 | **≥ 0,6722** (base + 0,05; criterio principal) |
| Cobertura de alcance B, calibration y validation | 0,5417 / 0,7143 | ninguna baja |
| Recall del flujo B, calibration y validation | 0,7604 / 0,9111 (ADR-036) | ninguna baja |
| Errores de alcance B | 0 | 0 |
| Fixture A cobertura y recall del flujo | 0,8222 / 0,7444 | ninguna baja |
| Tamaño del alcance (globs por caso, B) | mediana 2, máximo 3 | mediana ≤ 3 |
| Caso de la web piloto (test unitario) | — | `packages/ui/**` en el alcance |

No hay parámetros que ajustar: no se usa calibration para elegir nada; los dos splits se miden una
vez. Si no se cumple el criterio principal, el ADR se publica como rechazado con las cifras.

## Riesgos

- Un alcance más amplio relaja G1. Se limita a paquetes **nombrados explícitamente** y a 2.
- Nombres de paquete que son palabras comunes (`ui`, `web`) no cuentan: solo el `name` completo del
  `package.json` (en la plantilla, `@repo/ui`).

## Resultados

**OBSERVACIÓN (2026-10-05): D6 cumple todas las barreras fijadas.** Medición única de
cada fixture, sin ajustes de parámetros, umbrales ni base. Se evalúa la configuración
`default`; las otras configuraciones fijas del evaluador quedan en los informes, sin
seleccionar ninguna a partir de sus resultados. El estado del ADR permanece sin cambios.

Implementación idéntica en TS y en el port Rust: conserva D5, reconoce nombres completos
con los límites npm de D4, excluye el paquete raíz antes de contar los paquetes elegibles,
añade sus globs solo si hay como máximo dos, deduplica y ordena. El flujo MCP mantiene
`assertUnprotectedScope` después de derivar; el port conserva la comprobación equivalente.
Los tests de ambos lenguajes cubren la web piloto, límites, raíz, más de dos paquetes,
menciones repetidas, dos paquetes y deduplicación con el alcance del pack.

Comandos ejecutados una vez, sin red, con
`CARGO_TARGET_DIR=/home/luis/.cache/foker-wt/FKR-106/target`:

```sh
cargo run --release --offline -p foker-context --example fixture_b_eval -- benchmarks/fixture-b/ctx-gold/cases.jsonl /home/luis/.local/share/foker-bench/fixture-b/trees benchmarks/fixture-b/results/adr038-d6-2026-10-05.json
node benchmarks/fixtures/fixture-a/generate.mjs /tmp/fkr106/fixture-a
# /tmp/fkr106/empty.json contiene [], sin overrides.
cargo run --release --offline -p foker-context --example fixture_a_barrier -- /tmp/fkr106/fixture-a /tmp/fkr106/empty.json benchmarks/fixture-b/results/adr038-d6-fixture-a-2026-10-05.json
```

Fixture A usa la generación por defecto (324 archivos) y el monorepo del repositorio,
como en ADR-036 D5. Los árboles de B se leen sin modificarlos.

[Informe B](../../benchmarks/fixture-b/results/adr038-d6-2026-10-05.json):

| Split | Casos | Cobertura alcance | Recall flujo | Errores alcance / contexto | Mediana / máximo globs |
|---|---|---|---|---|---|
| calibration | 24 | 0,541667 | 0,760417 | 0 / 0 | 2 / 4 |
| validation | 21 | 0,857143 | 0,911111 | 0 / 0 | 3 / 4 |
| todos | 45 | 0,688889 | 0,830741 | 0 / 0 | 3 / 4 |

El recall del pack B es 0,802083 / 0,863492 / 0,830741
(calibration / validation / todos), con cero errores de pack.
La evaluación separada de símbolos registra 7 / 5 / 12 errores; no son errores del flujo
ni del alcance y no forman parte de las barreras D6.

[Informe A](../../benchmarks/fixture-b/results/adr038-d6-fixture-a-2026-10-05.json):

| Split | Casos | Cobertura alcance | Recall flujo | Errores alcance / contexto |
|---|---|---|---|---|
| calibration | 30 | 0,766667 | 0,738889 | 0 / 0 |
| validation | 30 | 0,877778 | 0,750000 | 0 / 0 |
| todos | 60 | 0,822222 | 0,744444 | 0 / 0 |

Recall del pack A: 0,744444 agregado, cero errores de pack.

Aplicación de la tabla de umbrales, línea por línea:

| Métrica | Resultado | Cumple |
|---|---|---|
| Cobertura B todos ≥ 0,6722 | 0,688889; incremento 0,066667 frente a la base sin redondear | Sí |
| Cobertura B calibration / validation: ninguna baja | 0,541667 / 0,857143; calibration igual y validation sube frente a D5 | Sí |
| Recall flujo B calibration / validation: ninguna baja | 0,760417 / 0,911111; ambos iguales a D5 | Sí |
| Errores de alcance B = 0 | 0 | Sí |
| Fixture A cobertura / recall flujo: ninguna baja | 0,822222 / 0,744444; ambos iguales a D5 | Sí |
| Tamaño B: mediana ≤ 3 | mediana 3, máximo 4 (sin barrera para el máximo) | Sí |
| Web piloto: packages/ui/** en alcance | TS y Rust devuelven apps/web/app/** y packages/ui/** | Sí |

Las comparaciones «ninguna baja» usan las cifras originales sin redondear de D5
(ADR-036 §Resultados de D5), cuya representación redondeada figura en la base fijada arriba;
no se redefine la base.
