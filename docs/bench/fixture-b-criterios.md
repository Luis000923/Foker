# Fixture B · Criterios reproducibles (FKR-093)

Estado: **propuesta para PREGUNTA-6**, 2026-10-04. La persona decide los repositorios;
este documento no selecciona Fixture B ni modifica metodología, esquema o manifiesto.
Fuentes: [ADR-018](../adr/ADR-018-benchmark.md),
[ADR-025](../adr/ADR-025-benchmark-metricas-desconocidas.md),
[ADR-029](../adr/ADR-029-benchmark-suscripciones.md),
[FOKER-SPEC §20](../../spec/FOKER-SPEC.md) y
[backlog FKR-014/015/018](../../spec/ROADMAP-BACKLOG.md).
FKR-014 exige 2–3 repos por commit y ≥ 15 tareas por repo; FKR-015 requiere
≥ 10 tareas de control × 3 repeticiones; FKR-018 y ADR-018, ≥ 40 tareas × 2 brazos × 3.
Las categorías siguientes sirven para explorar diversidad; no exigen cuatro repos ni
sustituyen la recomendación vigente de 2–3 monorepos pnpm medianos.

## Elegibilidad propuesta

Congelar estos criterios y sus umbrales antes de medir resultados de los brazos.
Registrar por criterio: cumple, no cumple o pendiente, evidencia, SHA y motivo.
Un pendiente no equivale a elegible. Cualquier cambio metodológico necesita ADR y
aprobación humana antes de aplicar la selección.

| Criterio | Comprobación y aceptación propuesta |
|---|---|
| E1 · Licencia | LICENSE y avisos por archivo en el SHA; licencia aprobada por OSI que permita ejecutar benchmark y redistribuir modificaciones y tests con sus obligaciones. Conservar copyright, licencia y NOTICE aplicables; revisar dependencias y recursos redistribuidos. Sin licencia o derechos incompatibles: excluir. |
| E2 · TypeScript | ≥ 60 % de LOC de código propio TS/TSX sobre TS/TSX/JS/JSX, calculado con herramienta y versión fijadas; tareas en TS. No inferirlo de porcentajes de GitHub. |
| E3 · Tamaño | Mínimo 30 archivos TS/TSX y 3.000 LOC TS de código propio. Tabla inferior; publicar también métricas incluyendo tests. |
| E4 · Tests offline | Lockfile versionado, gestor y runtime exactos; instalación congelada sin cambios al lockfile. Tras preparar dependencias, tests, lint y tipos pasan con red deshabilitada, sin credenciales ni servicios externos. Servicios locales solo si se empaquetan y fijan en el entorno. |
| E5 · Historia real | Producto/biblioteca independiente de Foker, con bugs/features y commits originales vinculables a comportamiento verificable; curar ≥ 15 tareas admisibles por repo. Popularidad y estrellas no son filtros. |
| E6 · Checkout | SHA completo de 40 hex verificado en origen y árbol reproducible; guardar archivo/bundle con digest, submódulos y LFS si existen. Nunca usar HEAD o una etiqueta mutable como identidad. |
| E7 · Diversidad | Conjunto con ≥ 2 estilos: biblioteca algorítmica, compilador/build, servidor/DI, estado/UI o RPC; registrar paquetes, imports cruzados y configuración. No premiar afinidad con el grafo de Foker. |
| E8 · Recursos | En imagen foker-bench por digest y recursos fijados: propuesta de 2 CPU y 8 GiB RAM; install ≤ 15 min, suite de evaluación con lint/tipos ≤ 10 min, en cada una de 3 preparaciones limpias. Registrar tiempo, RAM pico, caché y disco; exceso o timeout excluye bajo estos umbrales. |

Estos límites de preparación/evaluación son propuestas y no reemplazan los límites
actuales del agente (60 turnos, 30 minutos y presupuesto equivalente del manifiesto).
La instalación puede tener red en una fase separada con dependencias fijadas y
registro de descargas; todas las pruebas posteriores deben funcionar offline.
La imagen actual usa Node 22.14.0 y pnpm 11.9.0: comprobar compatibilidad real, no
suponer que un proyecto reciente o con otro gestor funciona en ella.

| Categoría de tamaño | Archivos TS/TSX propios | LOC TS propios |
|---|---:|---:|
| small | 30–199 | 3.000–19.999 |
| medium | 200–999 | 20.000–99.999 |
| large | ≥ 1.000 | ≥ 100.000 |
| monorepo (categoría arquitectónica, adicional al tamaño) | ≥ 200 en total y ≥ 2 paquetes TS con ≥ 30 cada uno | ≥ 20.000 en total |

Ambos umbrales de tamaño deben cumplirse; si caen en bandas diferentes, registrar
«mixto» y dejar la clasificación pendiente de revisión, sin mover límites tras medir.
Monorepo requiere workspace versionado y al menos dos paquetes con import interno;
puede ser medium o large. No basta tener directorios llamados packages.

Contar desde `git ls-files -z` del checkout, extensiones `.ts`, `.tsx`, `.mts`, `.cts`;
excluir `.d.ts`, dependencias, vendored, generado, builds, fixtures y tests del cómputo
principal. Guardar lista exacta de exclusiones, conteos separados de tests y total,
y salida de una herramienta LOC fijada (p. ej. cloc por versión/digest, LOC sin
comentarios ni líneas vacías). Usar idéntica regla en todos los candidatos. Ninguna
cifra de candidatos se acredita sin ese cómputo al SHA.

## Curación reproducible de tareas

1. Registrar universo de repos y ventana de historia con fecha límite fija, criterios,
   categorías y semilla de muestreo antes de ver éxito, tokens o coste de Foker.
   Enumerar commits en esa ventana de forma estable (fecha y SHA), revisando diff y
   tests, no solo el texto «fix». Guardar todos los rechazos con motivo.
2. Para un commit real C que corrige un bug y añade test, fijar B = padre concreto
   (preferiblemente único). Checkout detached de B; C es la referencia privada.
   Separar cambios de implementación (gold) y prueba. Evitar commits con mezclas
   inseparables de refactors, dependencia/lockfile y corrección, o con padres ambiguos.
3. Extraer la prueba de C como fail_to_pass: en B debe fallar por la conducta descrita,
   no por una dependencia ausente o un error del montaje. Mantener tests de B como
   pass_to_pass: deben pasar antes y después. Fijar lista de casos y comandos argv,
   cwd, timeout y perfil lint/typecheck. No vale seleccionar solo regresiones fáciles.
4. Verificar en contenedores limpios B + pruebas (F2P falla, P2P pasa) y B + gold +
   pruebas (todo pasa, lint/tipos incluidos), 3 veces sin red. Rechazar flaky, skips,
   fallos ambientales o tests que dependan de red/reloj sin control. Conservar logs,
   códigos de salida, hashes y tiempos. El gold no es la única solución aceptada:
   el evaluador juzga comportamiento y §20.4, no igualdad textual del patch.
5. Features pueden usar pruebas de conducta añadidas en C si se demuestra la misma
   transición. Refactors/tests solo si tienen criterio automático fail_to_pass real;
   no inventar requisitos para alcanzar cuotas. Si no hay 15 tareas, repo pendiente
   o excluido. Fijar tipo y selección estratificada antes de medir, con orden por semilla.
6. Redactar enunciado con entrada, resultado esperado y límites de conducta, sin
   rutas del gold, diff, solución o mensajes reveladores. Sellar expediente privado
   de procedencia y tests; una persona revisa licencias, tarea y contaminación.

### Identidad y prevención de contaminación

Fijar por tarea repo URL, B, C y padre, ID, tipo, enunciado, comportamiento esperado,
comandos, hashes de gold/tests/lockfile, entorno (imagen digest, SO/arquitectura,
CPU/RAM, runtimes, gestor, locales, TZ, variables permitidas y servicios), modelo por
ID exacto, cutoff declarado y fuente, anfitrión y versión, billing, configuración y
hash de prompts, Foker semver **y SHA de build**, estrategia de contexto y presupuesto,
seeds, precios versionados, límites y repeticiones. Si el proveedor no declara cutoff,
registrar desconocido; no inventar fecha.

Preferir C posterior al cutoff verificable cuando exista suficiente historia; la fecha
no prueba ausencia de entrenamiento. Registrar publicación del issue/test y posibles
exposiciones previas. Separar curación/calibración y evaluación; no ajustar contexto
con resultados del conjunto final. Quitar historial futuro y remotos del checkout
visible; no permitir recuperar C, issues resueltos o gold por red. Las instrucciones
upstream visibles deben ser idénticas para ambos brazos y auditadas por pistas.

Gold, gold_modified, gold_read, C, tests nuevos ocultos y expediente no se montan ni
se incluyen en prompts, packs, imagen accesible o trazas del agente de **ningún brazo**.
Solo el evaluador los recibe tras terminar. Los tests existentes de B pueden seguir
visibles e iguales en ambos brazos; la lista privada de evaluación no revela pruebas
nuevas. Mantener acceso del anfitrión al proveedor separado del acceso a internet del
agente: el proxy de §20.2 sigue pendiente según ADR-029; no declarar aislamiento
anti-contaminación logrado mientras no esté verificado.

## Igualdad y reglas contra sesgo

Mismo B, enunciado, tests disponibles, modelo/anfitrión, límites, hardware, red,
permisos de herramientas generales, comandos de tests, dependencias y estado inicial;
instancias limpias por brazo/repetición. La diferencia declarada es Foker y su
estrategia de contexto/instrucciones, cuyos hashes se conservan. Igual oportunidad
de ejecutar tests visibles: el problema de Bash del control anotado en ESTADO debe
resolverse antes de línea base. No equiparar más permisos a la intervención.

No elegir repos por su rendimiento con Foker, afinidad con pnpm o fácil compresión.
PnPM es recomendación vigente, no evidencia de eficacia; registrar sesgo de alcance.
Congelar inclusión/exclusión y cuotas antes de medir; publicar universo, descartes,
fallos, ausencias y resultados negativos. Orden pareado aleatorizado con seed y
3 repeticiones conforme ADR-018. No sustituir tareas fallidas ni eliminar timeouts;
separar resultados por tamaño, arquitectura y tipo sin cambiar hipótesis después.

## Métricas por tarea, brazo y repetición

| Área | Registro | Estado actual / límite |
|---|---|---|
| Correctness | F2P/P2P, tests_passed, lint, tipos, cambios protegidos, within_limits y success | Evaluador implementado para Fixture A; repos reales pendientes. Success exige los cinco criterios de §20.4; estado Foker no es juez. |
| Contexto | Tokens entrada/caché/salida, files_exposed, precisión/recall frente a gold_modified y gold_read anotado; CCR_relevante | Usage y trazas soportados parcialmente; lecturas por shell u eventos no reconocidos no garantizan cobertura. CCR usa estimación del pack, no ahorro de conversación; 18:1 es hipótesis informativa. |
| Coste | cost_usd equivalente API, tabla/versionado, reported_cost_usd y billing | Calculable con usage completo y precios del modelo; cuota/coste marginal de suscripción no medible por esa fórmula (ADR-029). |
| Exploración | Archivos leídos/modificados, búsquedas, llamadas, errores, retries, out_of_scope_edits | Diff y parte de trazas disponibles; cobertura completa de búsquedas/llamadas pendiente. Retries difiere por brazo según §20.5: no asumir equivalencia semántica. |
| Fallback | Propuesta fallback_rate: ejecuciones Foker con ≥ 1 fallback de contexto / ejecuciones Foker con observación completa | No definido formalmente ni instrumentado como métrica hoy. Fijar evento (p. ej. sin semillas FKR-CTX-101), exclusiones, denominador, cobertura y tratamiento de errores por ADR; control sería no aplicable. No confundir con retries ni dividir por todos los runs sin trazas. |
| Tiempo | latency_s del agente; install/evaluación separados; map inicial, refresh incremental, buildContext, overhead preparación Foker | Latencia del arnés disponible; desglose comparable por tarea de tiempos Foker pendiente de instrumentación y validación. Distinguir frío/caliente y registrar número de llamadas; no sumarlo dos veces a latencia. |

ADR-025: ausencias son `null` cuando el contrato lo admite, nunca cero. Para métricas
nuevas sin campo no añadir claves a resultados v1: describirlas en evidencia auxiliar
propuesta. Publicar cobertura/ausencias por métrica; conservar todos los runs en tasa
de éxito. Sin usage/turnos/coste calculable no acreditar within_limits ni success.
Ninguna ejecución real de candidatos se ha hecho como parte de FKR-093.

## Propuesta de representación compatible con el manifiesto actual

`benchmarks/manifest.yaml` contiene JSON válido con schema_version 1. El esquema
reconstruido acepta repos `{name, url, commit}` y tareas con los campos siguientes;
rechaza propiedades adicionales. Propuesta de estructura, **no manifiesto ejecutable**:

```text
repos[]: { name: "repo-b-tarea-01", url: URL_ORIGEN, commit: SHA_BASE_VERIFICADO }
tasks[]: {
  id: "b-01", repo: "repo-b-tarea-01", type: "fix",
  statement: ENUNCIADO_Y_CONDUCTA_ESPERADA,
  gold_patch: RUTA_PRIVADA_PATCH,
  hidden_tests: {
    fail_to_pass: { paths: [RUTA_TEST_PRIVADO], command: [EJECUTABLE, ARGUMENTOS] },
    pass_to_pass: { paths: [RUTA_TEST_REGRESION], command: [EJECUTABLE, ARGUMENTOS] }
  },
  gold_modified: [RUTAS_IMPLEMENTACION], gold_read: [RUTAS_ANOTADAS_OPCIONALES]
}
```

Los símbolos son marcadores, no valores válidos ni SHAs de ceros. Omitir gold_read
si no hay anotaciones. Conservar model, host, foker_version, seeds, limits, prices y
suites globales; smoke exige exactamente 3 IDs y full lista los IDs reales. Cada B
histórico distinto requiere una entrada repos distinta, aunque URL sea la misma;
≥ 15 tareas por repo upstream, no por alias de checkout. Si comparten B, reutilizar
entrada. No usar fixture (generador sintético) para fingir un clon real.

Propuesta de expediente auxiliar por ID, fuera del manifiesto y privado: source_commit,
parent, fecha/cutoff, licencia/avisos, categoría/conteos, lockfile_digest,
image_digest, install argv/cwd, evaluación argv/cwd/timeouts, runtimes/servicios,
expected_behavior, configuración/context_strategy y hashes, foker_build_sha,
validación B/gold, muestreo/rechazos, anotaciones de exposición y logs. No es un
esquema aprobado ni algo que el arnés consuma hoy. La parte pública excluye solución.

Compatibilidad de campos **no implica soporte operativo**: prepare.mjs copia
node_modules y lockfile de /opt/fixture y la imagen genera Fixture A. La preparación
por repo, montajes de tests, perfil lint/tipos y protección del checkout necesitan
trabajo futuro. Añadir campos de instalación/entorno/estrategia al manifiesto o
cambiar metodología requerirá ADR y decisión humana; aquí no se cambia nada.
