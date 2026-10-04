# Benchmark: diseño y estado

FOKER-SPEC §20 y ADR-018 plantean comprobar si Foker reduce tokens por tarea exitosa sin empeorar
el éxito. **No hay resultados del experimento ni evidencia que confirme H1/H2.**
`@foker/benchmarks` es un workspace privado con manifiesto validado, Fixture A reproducible,
20 tareas con gold patches y tests ocultos, evaluador local de Task Success y 30 casos de ctx-gold.
También conserva `perf-baseline.json`, usado por nightly para rendimiento del núcleo.
No hay todavía anfitrión headless, contenedores del arnés ni ejecuciones control/Foker.

## Herramientas disponibles sin API

```sh
pnpm --filter @foker/benchmarks run validate-manifest
pnpm --filter @foker/benchmarks run validate-results /tmp/results.jsonl
pnpm --filter @foker/benchmarks run generate /tmp/fixture-a 42
pnpm --filter @foker/benchmarks run ctx-gold
pnpm --filter @foker/benchmarks run evaluate-task /tmp/resultado /tmp/fixture-a benchmarks/fixtures/fixture-a/tasks/a-01/meta.json /tmp/usage-limits.json
```

Node ≥22.15 ejecuta las herramientas TypeScript desde fuente mediante `run.mjs` y su transformador nativo; no requieren build
ni enlaces nuevos en node_modules. En entornos sin instalación autorizada, pnpm 11 necesita
`pnpm_config_verify_deps_before_run=false` para evitar su instalación automática al detectar el
workspace nuevo. Alternativa directa: `node benchmarks/run.mjs ctx-gold` (análoga para validadores
y evaluador). No se añaden dependencias externas al repositorio.

`manifest.yaml` usa JSON, subconjunto válido de YAML, con comentarios iniciales. Incluye las suites
`smoke` de tres tareas y `full` de veinte, semillas y precios USD/MTok versionados. Modelo, precios y
límite USD son `null`, **PENDIENTE PREGUNTA-2**. La versión del anfitrión está pendiente de FKR-011.
El commit de cuarenta ceros identifica el fixture generado, no un commit remoto; reproducirlo exige
fijar el commit de Foker que contiene el generador y la semilla 42.

Fixture A genera aproximadamente 320 archivos y seis paquetes de tienda con imports workspace y pruebas Vitest.
Solo declara TypeScript **5.9.3** y Vitest **5.0.3** como herramientas externas; el lint local comprueba
espacios/tabulaciones y typecheck valida el código de producción. El destino debe estar vacío y no
se versiona. Las veinte tareas se distribuyen en ocho fixes, seis features, cuatro refactors y dos
tareas de tests. Sus metadatos declaran archivos gold, comandos y destinos de tests ocultos de ambos
conjuntos; los tests ocultos se copian exclusivamente durante la evaluación.

CI comprueba determinismo byte a byte, aplicación de cada patch con `git apply --check` y coincidencia
exacta de los archivos modificados. **No instala ni ejecuta Vitest del fixture generado.** Para
comprobar fail→pass, pass→pass, perfil default y toda la suite de cada gold patch fuera del sandbox:

```sh
pnpm --filter @foker/benchmarks run verify-tasks
```

Este último comando **sí ejecuta `pnpm install`** en directorios temporales y elimina sus resultados.
La revisión posterior ejecuta la alternativa `--offline`, sin instalación ni red. El perfil default y los tests de aceptación se toman de
metadatos del arnés, no del resultado del agente.

`evaluate-task` copia el resultado a un temporal limpio, usa dependencias preinstaladas del fixture
de confianza y copia los tests ocultos. Invoca `runCheck` de policy (reexportado por engine), sin shell,
con timeout por check de 300 segundos. Evalúa los cinco criterios de §20.4 y emite `success_breakdown`,
`success` y evidencia de cada check. Detecta adiciones, borrados y cambios en tests del arnés, CI y
lockfiles; rechaza symlinks. Los manifests y lockfiles admiten excepciones de dependencias declaradas en metadatos confiables.
Las pruebas de CI usan un fixture mínimo con scripts Node y comprueban gold, solución rota,
protecciones y límites sin instalar nada. El archivo de usage contiene:

```json
{
  "usage": { "turns": 3, "minutes": 1, "cost_usd": 0.2 },
  "limits": { "max_turns": 60, "max_minutes": 30, "max_cost_usd": 1 }
}
```

El quinto argumento opcional de `evaluate-task` permite indicar la raíz de fuentes ocultas; por defecto
es la raíz de Foker. Usage es evidencia suministrada por el arnés; un límite USD desconocido impide
declarar éxito.
Este evaluador local aún necesita el contenedor y la extracción real de usage de **FKR-011** para
cumplir el aislamiento del experimento; no ejecuta un agente ni acredita H1/H2.

Ctx-gold usa `openEngine`, refresh y `buildContext` con presupuesto 8000. Los veinte casos de Fixture A
se derivan de sus metadatos; diez cubren archivos distintos de `fixtures/monorepo-pnpm` con anclas
explícitas. Solo cuentan archivos de nivel L1/L2/L3: recall sobre gold_modified, precisión sobre
la unión gold_modified/gold_read y tokens usados. Agrega medias por caso y mediana de tokens.
Los tests nuevos que aún no existen en el mapa cuentan como misses; no se filtran para inflar recall.
Los informes JSON/Markdown `benchmarks/reports/ctx-gold-<fecha>.*` se generan y se ignoran en Git,
salvo [el ejemplo de formato](../benchmarks/reports/ctx-gold-example.md). Imprime el TARGET ≥0,80,
la mediana ≤8000 y si recall <0,6 bloquearía M3. M1 tiene 30 casos; el objetivo completo sigue siendo 60.

## Diseño previsto (no ejecutado)

Experimento pareado: mismo repo/commit, anfitrión y modelo con id exacto; control sin MCP/roles/skills
Foker, conservando las instrucciones originales, frente a experimental tras init/sync.
Claude Code headless con strict-mcp-config en MVP; OpenCode como segundo anfitrión en V0.2.
Contenedor nuevo por run, sin secretos de usuario, red limitada al proveedor/registro, caché pnpm
precalentada y límites de turnos, tiempo y coste. Orden aleatorio con semilla registrada; tres
repeticiones por tarea y brazo.

Dataset objetivo ≥40 tareas: fixture sintético de ~300 archivos/6 paquetes y 2–3 monorepos TS
reales fijados por commit, ≥15 tareas por repo real. Mezcla prevista: 40 % fixes, 30 % features
pequeñas, 20 % refactors y 10 % tests. Cada tarea necesita gold patch, tests ocultos fail-to-pass
y pass-to-pass; los tests se exponen solo al evaluador.

Task Success se determina en contenedor limpio: pasan ambos conjuntos de tests, lint y tipos;
no se modifican archivos protegidos del arnés y se respetan límites. El estado COMPLETED de Foker
no es criterio de éxito del experimento: ambos brazos reciben la misma evaluación independiente.

Métrica primaria: tokens de entrada totales por tarea exitosa, incluyendo input, cache-read y
cache-write. Se registran además éxito, coste con precios versionados, latencia, tokens de salida,
archivos expuestos/modificados, precisión/recall respecto al gold, ediciones fuera de alcance,
errores y reintentos. CCR_relevante 18:1 es hipótesis informativa, no criterio de éxito.

H1 exige reducción estimada ≥30 %, IC 95 % de reducción excluyendo cero y límite inferior del IC
de diferencia de éxito ≥−5 puntos. §20.6 prevé medias de repeticiones exitosas emparejadas,
bootstrap de 10.000 remuestreos con semilla y Wilcoxon; tareas sin éxito en un brazo se analizan
aparte. H2 compara exposición y cambios fuera de alcance. Se publicarán resultados negativos;
40 tareas ×3 puede no detectar efectos <15 %.

## Pendientes y decisiones bloqueantes

| Issue | Falta |
|---|---|
| FKR-010 | Implementado: esquema/manifiesto y validación JSONL. Modelo/precios/versión real del anfitrión pendientes. |
| FKR-011 | Arnés headless aislado, límites y extracción completa de usage; PREGUNTA-2: presupuesto API/modelo. |
| FKR-012 | Evaluador local y tests implementados; aislamiento en contenedor pendiente de FKR-011. |
| FKR-013 | Generador y 20 tareas implementados; verificación Vitest completa con instalación, pendiente fuera del sandbox. |
| FKR-014 | Fixture B; PREGUNTA-6: selección de 2–3 repos y commits con tests offline. |
| FKR-015 | Línea base ≥10 tareas ×3. |
| FKR-016 | Análisis estadístico e informe generado. |
| FKR-017/037 | 30 casos y evaluador implementados; ampliar a 60 y calibrar defaults. |
| FKR-018 | Experimento completo ≥40 tareas ×2 brazos ×3 y publicación del informe. |

`pnpm bench:run --suite smoke/full` es **PENDIENTE FKR-011/018**: no existe ese script actualmente.
PREGUNTA-2 y PREGUNTA-6 bloquean las ejecuciones/curación real, pero no impiden usar esquema,
fixture sintético y evaluador sin llamadas al proveedor. PREGUNTA-3 bloquea publicación npm
(FKR-080), no es una prueba de eficacia ni reemplaza el benchmark.

## Revisión del fixture y del evaluador

`generate-tasks.mjs` reconstruye tareas, parches, fuentes y casos ctx-gold desde
`task-definitions.json`, sin red. Las 20 tareas mantienen la mezcla 40/30/20/10;
12 modifican varios archivos, 10 cruzan paquetes y 5 incluyen señuelos. Ningún
enunciado da rutas (`hint: false`). Los comentarios describen el dominio sin copiar issues.
Los metadatos incluyen `modified`, `packages`, `cross_package` y `hint`.

El evaluador conserva symlinks relativos de las dependencias y restaura manifests,
tsconfigs, scripts y configuración de lint/tests desde el fixture de confianza.
Sus modificaciones cuentan contra el criterio de archivos protegidos. Para tareas
de tests ejecuta los archivos entregados sobre la solución y sobre el código original:
exige éxito en el primero y fallo en el segundo, sin comparar strings. Estas tareas
incluyen un defecto original y su corrección en el gold.

Verificación completa local sin instalación: `node benchmarks/fixtures/fixture-a/verify-tasks.mjs --offline`.
Usa TypeScript y Vitest ya instalados en Foker. El modo sin bandera conserva la instalación
del fixture. ctx-gold se vuelve a medir sin ajustar el Context Engine (FKR-037).

Medición ctx-gold de 2026-10-04 (30 casos): recall 0,6889, precisión 0,0323 y mediana
de 7545 tokens. No alcanza el objetivo de recall 0,80; no activa el bloqueo de M3 (<0,60).
