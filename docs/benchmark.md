# Benchmark: diseño y estado

FOKER-SPEC §20 y ADR-018 plantean comprobar si Foker reduce tokens por tarea exitosa sin empeorar
el éxito. **No hay resultados del experimento ni evidencia que confirme H1/H2.**
`@foker/benchmarks` es un workspace privado con manifiesto validado, Fixture A reproducible,
20 tareas con gold patches y tests ocultos, evaluador local de Task Success y 60 casos de ctx-gold.
También conserva `perf-baseline.json`, usado por nightly para rendimiento del núcleo.
El arnés headless y el análisis están implementados y probados con un anfitrión simulado.
No hay todavía ejecuciones control/Foker con un proveedor real.

## Herramientas disponibles sin API

```sh
pnpm --filter @foker/benchmarks run validate-manifest
pnpm --filter @foker/benchmarks run validate-results /tmp/results.jsonl
pnpm --filter @foker/benchmarks run generate /tmp/fixture-a 42
pnpm --filter @foker/benchmarks run ctx-gold
pnpm --filter @foker/benchmarks run evaluate-task /tmp/resultado /tmp/fixture-a benchmarks/fixtures/fixture-a/tasks/a-01/meta.json /tmp/usage-limits.json
```

Las herramientas se ejecutan desde `benchmarks/dist` mediante `run.mjs`; requieren compilar
con `./node_modules/.bin/tsc -p benchmarks/tsconfig.build.json` y el addon nativo precompilado
en `packages/core`, sin enlaces nuevos en node_modules. En entornos sin instalación autorizada, pnpm 11 necesita
`pnpm_config_verify_deps_before_run=false` para evitar su instalación automática al detectar el
workspace nuevo. Alternativa directa: `node benchmarks/run.mjs ctx-gold` (análoga para validadores
y evaluador). No se añaden dependencias externas al repositorio.

`manifest.yaml` usa JSON, subconjunto válido de YAML, con comentarios iniciales. Incluye las suites
`smoke` de tres tareas y `full` de veinte, semillas y precios USD/MTok versionados. Modelo, precios y
límite USD son `null`, **PENDIENTE PREGUNTA-2**. La versión real del anfitrión debe fijarse antes de construir la imagen (no se ha consultado el registro).
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

Ctx-gold usa `openEngine`, refresh y `buildContext` con presupuesto 8000. Los primeros veinte casos
de Fixture A se derivan de sus metadatos; treinta casos adicionales describen síntomas y necesidades
en español, sin rutas ni símbolos, sobre archivos existentes del fixture generado. Diez casos
cubren archivos distintos de `fixtures/monorepo-pnpm` con anclas explícitas. Solo cuentan archivos de nivel L1/L2/L3: recall sobre gold_modified, precisión sobre
la unión gold_modified/gold_read y tokens usados. Agrega medias por caso y mediana de tokens.
Los tests nuevos que aún no existen en el mapa cuentan como misses; no se filtran para inflar recall.
Los informes JSON/Markdown `benchmarks/reports/ctx-gold-<fecha>.*` se generan y se ignoran en Git,
salvo [el ejemplo de formato](../benchmarks/reports/ctx-gold-example.md). Imprime el TARGET ≥0,80,
la mediana ≤8000 y si recall <0,6 bloquearía M3. La suite ampliada tiene 60 casos. Cada caso declara un `split` obligatorio; el loader y el evaluador
rechazan valores ausentes o diferentes de `calibration`/`validation`.

## Diseño experimental (sin ejecución real)

Experimento pareado: mismo repo/commit, anfitrión y modelo con id exacto; control sin MCP/roles/skills
Foker, conservando las instrucciones originales, frente a experimental tras init/sync.
Claude Code headless con strict-mcp-config en MVP; OpenCode como segundo anfitrión en V0.2.
Contenedor nuevo por run, sin secretos montados; proxy de red con allowlist pendiente, caché pnpm
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
| FKR-011 | Arnés implementado; validación de imagen/Claude real y PREGUNTA-2 pendientes. |
| FKR-012 | Evaluador local y tests implementados; aislamiento en contenedor pendiente de FKR-011. |
| FKR-013 | Generador y 20 tareas implementados; verificación Vitest completa con instalación, pendiente fuera del sandbox. |
| FKR-014 | Fixture B; PREGUNTA-6: selección de 2–3 repos y commits con tests offline. |
| FKR-015 | Línea base ≥10 tareas ×3. |
| FKR-016 | Análisis e informe implementados; informe experimental pendiente de resultados reales. |
| FKR-017/037 | 60 casos y splits implementados; TARGET recall pendiente. ADR-024 conserva defaults. |
| FKR-018 | Experimento completo ≥40 tareas ×2 brazos ×3 y publicación del informe. |

`pnpm bench:run -- --suite smoke` imprime/ejecuta el plan del arnés; FKR-018 sigue pendiente de ejecuciones reales.
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

## Ampliación ctx-gold a 60 casos (FKR-037)

El split es determinista porque queda fijado en `cases.jsonl`, independiente del orden de carga
o de la semilla del informe. Se estratifica por fixture y tipo de tarea en Fixture A:

| Estrato | Calibration | Validation |
|---|---:|---:|
| Fixture A: fixes (a-01–08, a-21–32) | 10 | 10 |
| Fixture A: features (a-09–14, a-33–41) | 7 | 8 |
| Fixture A: refactors (a-15–18, a-42–47) | 5 | 5 |
| Fixture A: tests (a-19–20, a-48–50) | 3 | 2 |
| Monorepo con anclas | 5 | 5 |
| Total | 30 | 30 |

`calibrate` explora configuraciones exclusivamente con calibration. Informa validation para
baseline y configuración elegida, sin usarla para seleccionar o desempatar. La semilla nombra
el informe y no reasigna casos. Esta ampliación no cambia parámetros del motor ni repite la
búsqueda de 144 configuraciones del informe histórico de ADR-024.

Comprobaciones locales sin red:

```sh
./node_modules/.bin/tsc -p benchmarks/tsconfig.build.json
node benchmarks/ctx-gold/verify-paths.mjs
node benchmarks/run.mjs ctx-gold benchmarks/ctx-gold/cases.jsonl 8000 /tmp/foker-ctx-gold-60
```

El verificador genera Fixture A en un temporal y comprueba cada ruta gold: 102 referencias
existentes y seis creaciones históricas ausentes (a-15–20), permitidas explícitamente.
Todas las rutas de los treinta casos nuevos existen; hay casos de dos, tres y cuatro archivos.
Las creaciones históricas siguen contando como misses en la métrica normativa.

Medición de 2026-10-04, addon precompilado y parámetros actuales, sin overrides:

| Split | Casos | Recall macro | Precisión macro | Mediana tokens |
|---|---:|---:|---:|---:|
| Calibration | 30 | 0,6222 | 0,0218 | 7541,5 |
| Validation | 30 | 0,6000 | 0,0229 | 7546,5 |
| Total | 60 | 0,6111 | 0,0223 | 7543,5 |

No alcanza TARGET 0,80; cumple la mediana ≤8000 y el total no activa el bloqueo <0,60.
El split comparte repositorio y tareas relacionadas: no acredita generalización a otros repos.
Los treinta casos añadidos son gold de recuperación, sin nuevos parches ni pruebas ocultas de
Task Success; no amplían las veinte tareas ejecutables de Fixture A ni acreditan por sí solos
el requisito normativo de archivos modificados por un parche de referencia.

## Arnés headless y análisis (FKR-011/016)

Sin API ni contenedores, revisar el plan reproducible:

```sh
pnpm bench:run -- --suite smoke --arm both --repetitions 3 --date 2026-10-04 --dry-run
pnpm --filter @foker/benchmarks run bench:run -- --suite full --arm control --repetitions 3 --run-id bench-baseline --dry-run
```

El orden se mezcla con `seeds.order`; `--date` fija la fecha para derivar el run_id de
semilla+fecha. `--run-id` permite un nombre explícito. No se reutilizan IDs existentes.
Los resultados se añaden tras validación individual a `benchmarks/results/<run_id>.jsonl`;
repos, baseline, entrega y evidencias quedan en `benchmarks/generated/<run_id>/`.
Ambas rutas se ignoran en Git. El manifiesto se identifica por su hash canónico BLAKE3.
Solo Fixture A está implementado: Fixture B requiere FKR-014/PREGUNTA-6.

**Fuera del sandbox**, preparar un manifiesto validado (`--manifest /ruta/manifest.yaml`)
con ID exacto de modelo, versión exacta de Claude Code, precios input/cache_read/cache_write/output
USD por millón y límite USD. No se elige ninguna versión/modelo ni se inventan precios.
El dry-run permite revisar pendientes. La ejecución rechaza valores null salvo
`--allow-null-pricing`; incluso con esa bandera se exige un modelo explícito.
Se pide confirmación por TTY mostrando número de ejecuciones y máximo estimado
`max_cost_usd × ejecuciones`; `--yes` permite automatizarlo. El coste calculado incluye
cada categoría de caché por su propio precio; el reportado por Claude se conserva aparte.

Construir la imagen con Node 22.14.0, pnpm 11.9.0, Git, addon nativo y Claude fijado:

```sh
# Crear contexto limpio sin .git, secretos ni archivos sin seguimiento de la raíz.
# Incluye los cambios de este trabajo todavía sin commit.
python3 - <<'PYBUILD'
import pathlib, shutil, subprocess, tempfile
root = pathlib.Path.cwd()
context = pathlib.Path(tempfile.mkdtemp(prefix='foker-bench-image-'))
tracked = subprocess.check_output(['git', 'ls-files', '-z']).decode().split('\0')
new = subprocess.check_output(['git', 'ls-files', '--others', '--exclude-standard', '-z', '--', 'benchmarks']).decode().split('\0')
for name in tracked + new:
    if not name or not (root / name).is_file():
        continue
    destination = context / name
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(root / name, destination)
print(context)
PYBUILD
# Usar la ruta impresa y la versión de host del manifiesto, no un alias/latest.
docker build --build-arg CLAUDE_CODE_VERSION=<version-exacta> -t foker-bench:0.0.0 -f /tmp/<contexto>/benchmarks/docker/Dockerfile /tmp/<contexto>
# Podman acepta el mismo Dockerfile y argumentos.
```

No pasar credenciales al build. Claude recibe la variable presente por nombre:
`--env CLAUDE_CODE_OAUTH_TOKEN` (prioritaria) o `--env ANTHROPIC_API_KEY`.
La autenticación se reserva al anfitrión; no se monta HOME del usuario.
La raíz es read-only, `/work` y `/tmp` son escribibles; límites: 4 GiB, 2 CPU y
256 procesos. Cada tarea crea contenedores nuevos. max_minutes mata el anfitrión
por nombre; Claude recibe max_turns. max-budget-usd se usa únicamente con API.
La evaluación usa red desactivada, baseline/dependencias confiables y tests ocultos
montados exclusivamente en esa fase. Gold patches y tests ocultos no están en la imagen.

El anfitrión usa **red por defecto** para API y npm. **PENDIENTE**: proxy con allowlist
para API del proveedor y registro npm (§20.2); no se afirma aislamiento de red ya cumplido.
La preparación copia dependencias precalentadas y en Foker ejecuta init con
`--targets claude-code`, trust con `--yes --ci`/CI=true y map. XDG_CONFIG_HOME se
mantiene dentro de `.foker/bench-xdg`, aislado por tarea y ausente en control.
El control conserva únicamente el fixture y MCP vacío, sin instrucciones/skills Foker.

```sh
# La variable debe existir en el entorno; no escribir su valor en comandos/artefactos.
pnpm bench:run -- --manifest /ruta/manifest.yaml --suite smoke --arm both --repetitions 3 --run-id bench-smoke-real --yes
pnpm --filter @foker/benchmarks run bench:report -- benchmarks/results/bench-smoke-real.jsonl
```

Las flags exactas están centralizadas en `harness/claudeArgs`: `-p`, output JSON,
modelo, max-turns, strict-mcp-config, mcp-config, permission-mode acceptEdits y
max-budget-usd cuando se conoce y se usa API. La ayuda local de Claude 2.1.289
confirma estas opciones salvo max-turns, presente en el ejecutable pero omitida de
la ayuda. No se ejecutaron llamadas reales para verificar su comportamiento.
`acceptEdits` no garantiza que todos los comandos Bash se autoricen en headless:
comprobarlo con las reglas efectivas de esa versión, sin saltarse permisos globalmente.

El wrapper conserva usage agregado (sin sumarlo otra vez a modelUsage), turnos,
duración reportada, coste reportado y transcript JSONL de la sesión efímera, si existe.
Latencia es reloj de pared del arnés. Exposición cuenta Read explícitos y archivos L1–L3
de Context Packs presentes en trazas/packs; L0 queda fuera. La auditoría actual tiene
digests, no rutas: por sí sola no reconstruye exposición; la caché de packs puede ser
solo en memoria. Lecturas mediante Bash, contenido de instrucciones y trazas omitidas
pueden subestimar exposición. CCR aproxima contenido completo del árbol final/used de packs
observables; null sin packs. Reintentos Foker cuentan transiciones REJECTED del ledger;
control correlaciona Bash test/typecheck con tool_result fallido observable.
`tests_passed` aproxima la fracción de los dos grupos ocultos, ya que el evaluador
existente no devuelve el número de casos individuales.

[ADR-025](../spec/adr/ADR-025-benchmark-metricas-desconocidas.md) amplía el esquema
reconstruido v1 para aceptar null en coste/reintentos y tokens no observados.
Se conservan las líneas de timeout sin usage, y todos los fallos cuentan en éxito.
`--allow-null-pricing` autoriza llamadas con coste desconocido, que queda null;
no pueden acreditar within_limits/Task Success. El modelo explícito sigue siendo
obligatorio. Modelo/precios null siguen siendo PREGUNTA-2.

El informe es generado (no editar a mano): medias por tarea/brazo de repeticiones
exitosas, tasa de éxito con todas las repeticiones, tokens/coste por éxito, diferencias
pareadas, IC percentil bootstrap de 10.000 remuestreos con semilla del manifiesto archivado (42 por defecto al importar solo JSONL),
Wilcoxon bilateral exacto para n≤20 (rangos medios y ceros excluidos), aproximación
normal con empates y continuidad para n>20, tablas por tipo, H1 y H2 descriptiva.
H1 exige reducción ≥30 %, IC de reducción estrictamente positivo y límite inferior
IC de éxito Foker−control ≥−0,05. Bootstrap de éxito agrupa por tarea, manteniendo
la pareja. Tareas sin éxitos en algún brazo se listan aparte para tokens/coste.
CCR relevante es informativo, sin umbral decisorio. No mezclar experimentos en un informe.

FKR-015 (≥10 tareas ×3 control), FKR-018 (≥40 ×2 ×3), la ejecución real y
PREGUNTA-2/6 siguen pendientes; el smoke simulado no acredita eficacia H1/H2.

## Smoke con suscripción (ADR-029)

Cada ejecución consume cuota de la suscripción. Revisar primero el plan con
`--dry-run`; `--yes` autoriza las llamadas del smoke. La imagen añade Codex
**0.159.3** exacto, pero no se ha descargado ni construido en este trabajo sin red.

Para Claude, preparar un manifiesto con host claude-code, versión y modelo exactos.
Generar el token con `claude setup-token` y exportarlo como CLAUDE_CODE_OAUTH_TOKEN
sin incluir su valor en argumentos, historial ni archivos del benchmark. También se
admite ANTHROPIC_API_KEY; ninguna clave API es obligatoria.

```sh
./node_modules/.bin/tsc -p benchmarks/tsconfig.build.json
node benchmarks/run.mjs bench-run --manifest /ruta/claude-manifest.yaml --host claude-code --suite smoke --repetitions 1 --run-id smoke-claude-sub --allow-null-pricing --yes
```

Para Codex, usar otro manifiesto con `host: {"name":"codex","version":"0.159.3"}`
y modelo explícito. Los precios se mantienen null salvo que se aporten valores
verificados para ese modelo. Indicar explícitamente un directorio con auth.json de
una sesión de Codex/ChatGPT por suscripción; no se busca ~/.codex automáticamente.
El directorio se monta readonly; la configuración personal no se carga.

```sh
node benchmarks/run.mjs bench-run --manifest /ruta/codex-manifest.yaml --host codex --codex-auth-dir /ruta/credenciales-codex --suite smoke --repetitions 1 --run-id smoke-codex-sub --allow-null-pricing --yes
```

`--host` debe coincidir con el manifiesto, incluida su versión exacta. Codex ejecuta
`exec --json` y el brazo Foker configura MCP por `-c`; sus instrucciones/skills se
preparan con el target codex. La ayuda local confirma JSONL, sin definir sus campos:
el parser cubre turn.completed/usage y conserva como null los datos ausentes.
No hay un flag de turnos verificado para Codex: solo se impone max_minutes y los
turnos desconocidos impiden acreditar within_limits/Task Success (ADR-025).
La ejecución real y el límite operativo de turnos Codex siguen pendientes.

Los resultados incluyen billing subscription/api y reported_cost_usd null si el
anfitrión no lo informa. cost_usd mide equivalente API con la tabla del manifiesto,
no la factura de la suscripción. Sin precios queda null; --allow-null-pricing permite
el smoke sin acreditar éxito bajo todos los límites. No mezclar modelos/anfitriones
ni métodos de facturación en un informe experimental.
