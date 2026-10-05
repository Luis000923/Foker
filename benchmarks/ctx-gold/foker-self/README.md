# ctx-gold · foker-self (FKR-095)

Dataset de símbolos para evaluar el futuro contexto focal de FKR-094 / ADR-031
fase 3. Se deriva del historial real, sin escoger tareas a mano ni cambiar los
criterios después de observar resultados. Es una suite independiente: el evaluador
`benchmarks/src/ctx-gold.ts` y su dataset anterior permanecen iguales. No se ha
medido recall ni calibrado el motor con estos casos.

## Reproducción sin red

Desde la raíz, con el addon existente y `packages/core/dist` compilado:

```sh
node benchmarks/ctx-gold/foker-self/generate.mjs
node benchmarks/ctx-gold/foker-self/generate.mjs --head d03fd5e
./node_modules/.bin/biome check benchmarks
./node_modules/.bin/tsc -p tsconfig.json
./node_modules/.bin/vitest run benchmarks
```

Ambas formas usan por defecto el SHA fijo
`d03fd5ed8cb2f8b77149441d23f66db2ce1ecd7e`, no la rama activa. `--head` permite
reproducir la misma metodología sobre otro universo explícito. El generador escribe
solo `cases.jsonl` y `discarded.jsonl` a su lado; no regenera este README.
Se comprobaron dos ejecuciones con `cmp`: ambos archivos son idénticos byte a byte.
La exportación asíncrona `materialize(sha, dir)` extrae `git archive` con `tar -x`
en el directorio indicado; debe usarse un directorio nuevo/vacío. No instala
node_modules, no clona y no escribe el gitdir. El generador limpia sus temporales
en `finally`. Los subprocesos son asíncronos por las restricciones de `spawnSync`
en el sandbox. Las únicas operaciones Git son `log`, `show`, `diff` y `archive`.

## Metodología fija

1. Universo: commits no merge alcanzables desde el SHA indicado, cuyo asunto
   cumple `^(feat|fix|refactor|perf)(\(ámbito\))?!?: `. Se admite ámbito opcional y
   breaking marker opcional. No se usa el cuerpo del mensaje.
2. Fuentes: `.ts`, `.tsx`, `.mts`, `.cts` bajo `packages/` o `benchmarks/src/`.
   Se excluyen `*.test.ts`, `*.d.ts`, directorios `generated` y `dist`. Rust queda
   fuera. La exclusión literal `*.d.ts` no excluye `binding.d.cts`; no se añadió
   una exclusión de archivos generados fuera de `generated/` después de verlos.
3. Diff con `--no-renames`: cuentan archivos existentes en el padre modificados,
   borrados o con cambio de tipo (`M`, `D`, `T`). Una renombración se representa
   como borrado y alta. Las altas no cuentan ni descalifican. Debe haber de uno a
   tres archivos fuente existentes afectados y alguno debe tener al menos 300
   líneas en el padre. Se cuentan líneas físicas, sin contar el segmento vacío
   tras un LF final; un archivo vacío tiene cero líneas.
4. `task` es exactamente el asunto menos su prefijo Conventional Commits, sin
   añadir cuerpo, rutas, anclas ni pistas. `commit` es el SHA completo del padre;
   `source_commit`, el del cambio. El id es `fs-` más sus primeros ocho hexadecimales.
5. Se materializa el árbol completo del padre y se construye el Project Map con
   `openEngine(dir)`, `refresh()` y `exportMapJson()` del **motor actual compilado**,
   sin ejecutar código ni instalar dependencias del árbol histórico. No se usa el
   mapa del commit posterior ni el del worktree. Errores de git o del motor abortan
   la generación, no se convierten silenciosamente en descartes.
6. Por cada hunk `git diff --no-ext-diff --no-textconv --no-renames -U0`, se toman
   todas sus líneas antiguas modificadas/borradas. En inserciones puras se toma
   exactamente el anclaje antiguo; el anclaje 0 (inicio de archivo) queda sin
   asignación, no se mueve a la línea 1. Las líneas del diff y `unassigned_lines`
   usan base 1, con esa excepción explícita del anclaje 0.
7. Cada línea se asigna al símbolo más interno del padre que la contiene, sin
   filtrar kind ni exportación. Se convierten las líneas a base 0. Los rangos del
   mapa son de puntos semiabiertos: una línea final con `end.col > 0` pertenece al
   rango; con columna 0 queda fuera. Se descartan contenedores con un hijo también
   presente; se desempata por inicio más tardío, fin más temprano y finalmente id
   lexicográfico. No se inventan símbolos para imports o código de nivel superior.
   Los ids se copian literalmente del mapa. Símbolos y líneas se deduplican y ordenan.
8. Si el resultado de símbolos está vacío, se descarta con `gold_symbols_vacio`.
   El split depende exclusivamente del primer byte de SHA-256 del id UTF-8:
   par → `calibration`, impar → `validation`. No se equilibra después.
9. Las filas JSONL se ordenan por id; `gold_modified` usa ids POSIX relativos y
   ordenados. `file_lines` y `unassigned_lines` incluyen cada archivo gold, aun
   cuando la lista de líneas sin símbolo esté vacía. Los descartes incluyen id,
   ambos SHAs y motivo; se registra el primer criterio incumplido. Un commit raíz
   del universo tendría `commit: null` y motivo `sin_padre`.

### Base de líneas verificada

Caso histórico `fs-02814430`, padre
`ca48982fe54dc87d40e7938854d85aca5531c077`: la declaración
`export interface ContextParams {` de `packages/core/binding.d.cts` está en la
línea física **97**; el símbolo `packages/core/binding.d.cts#ContextParams` tiene
`range.start.line = 96`, `start.col = 0`. La base es **0**. El test lo verifica
sobre ese padre materializado y también con una clase y método sintéticos; sus
hunks comprueban sustitución, borrado, inserción pura y líneas sin símbolo.

## Resultado del universo fijo

51 commits cumplen el tipo y la condición no merge. Se retienen **8 casos**:

| Split | Casos |
|---|---:|
| calibration | 2 |
| validation | 6 |

| Primer motivo de descarte | Casos |
|---|---:|
| numero_archivos (fuera de 1–3) | 27 |
| sin_archivo_300_lineas | 16 |
| gold_symbols_vacio | 0 |
| sin_padre | 0 |
| Total descartado | 43 |

Distribución de tamaños de **cada archivo gold en su padre**, contando las
repeticiones entre casos (14 observaciones, no solo el archivo grande del caso):

| Líneas | Observaciones |
|---|---:|
| 0–99 | 4 |
| 100–299 | 2 |
| 300–399 | 4 |
| 400–499 | 4 |

Mínimo 48, mediana 334,5, media 274,64, máximo 488 líneas.
Valores ordenados: 48, 77, 95, 96, 132, 235, 322, 347, 376, 383, 403, 407, 436, 488.
Cada caso tiene al menos un archivo de 300 líneas; sus otros gold pueden ser menores.

## Sesgos y límites

El repositorio lo escribieron agentes. Los asuntos pueden nombrar módulos o APIs,
por lo que su señal léxica puede favorecer la recuperación. Hay un solo repositorio
con cobertura TS solamente: estos datos no sustituyen Fixture B ni generalizan a
Rust u otros proyectos. Los ocho casos comparten historia, módulos y padres próximos;
la separación por hash no garantiza independencia entre calibration y validation.
El mínimo de tamaño y el máximo de archivos favorecen cambios localizados y excluyen
refactors amplios. Las altas no están en el mapa previo ni forman parte del gold.
Las regiones no representadas por símbolos quedan explícitamente sin asignar.
Cambiar el extractor o el addon puede cambiar el gold: para comparar experimentos,
se deben conservar estos JSONL y la versión del motor, no regenerarlos en cada variante.

La metodología de este encargo queda documentada aquí; no cambia contratos del motor,
esquemas normativos ni las decisiones de recuperación de ADR-028, ADR-031 y ADR-032.
No se aumentó el universo ni se bajaron umbrales para alcanzar una cantidad de casos.

## Verificación local

Biome y TypeScript raíz pasan. Vitest benchmarks: **8 archivos, 49 tests pasan**,
incluidos los tres nuevos. Se comprueban formato local de cada caso, ids únicos,
splits calculados independientemente, existencia de todos los gold_symbols de dos
padres materializados y asignación al símbolo más interno con un diff sintético.
No se ejecutó `pnpm verify`: el encargo exige ejecutables locales y ausencia de red;
los comandos anteriores son las comprobaciones solicitadas para este ámbito.
