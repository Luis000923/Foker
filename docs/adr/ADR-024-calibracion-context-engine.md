# ADR-024 · Calibración del Context Engine con ctx-gold

- **Estado**: Rechazada (rejilla histórica de pesos); propuestas léxicas implementadas en ADR-028
- **Fecha**: 2026-10-04
- **Issue**: FKR-037

## Contexto

Los pesos de §9 y ADR-006 son HIPÓTESIS. El baseline de los 30 casos locales es
recall macro 0,6889, precisión 0,0323 y mediana 7.545 tokens, inferior al TARGET
recall ≥ 0,80 de REQ-CTX-003. El evaluador ya excluye L0 del conjunto expuesto
como prescribe §20.5; no fue necesario corregir la fórmula.

[Diagnóstico](../../benchmarks/reports/ctx-gold-diagnostico.md) enumera todos los
misses y los ocupantes del presupuesto. Los gold existentes que faltan no tienen
semillas directas y quedan en posiciones 290–311. Core ocupa 777 tokens en los
casos fallidos; related consume aproximadamente 6.700. Seis archivos gold son
nuevos y no existen en el mapa (cuatro destinos de refactor y dos tests).
El selector recorre todos los candidatos: no se observan cortes de ranking ni
anclas gold no resueltas; BUDGET fuera de los 20 descartes publicados se infiere
del recorrido exhaustivo. No se usa gold para generar semillas.

## Experimento

Se centralizan pesos y umbrales en `foker-context::ContextParams`, con defaults
idénticos a los anteriores. La API nativa admite overrides internos opcionales
según la ampliación de ADR-021; no se exponen en MCP ni CLI pública. Las peticiones
no predeterminadas participan en el hash y la caché. Todos los snapshots originales
siguen idénticos: no se regeneran porque se rechaza cambiar defaults.

`pnpm --filter @foker/benchmarks run calibrate` usa semilla 37 por defecto. Divide
por SHA-256 de [semilla, fixture, id], ordena cada estrato y toma el 70 % redondeado
para calibrar: 14 + 7 casos; valida con los 6 + 3 restantes. El conjunto de
validación solo se evalúa para baseline y configuración elegida, después de la
búsqueda, y no se utiliza para seleccionar ni desempatar configuraciones.

La rejilla acotada de 144 combinaciones prueba top BM25 {20,80}, w_lex
{0,2; 0,6; 1,2}, multiplicador de r(intent) {0,1,2}, core N {0,15}, número L2
{0,5} y margen {0; 0,05}. Objetivo: máximo recall macro en calibración sujeto a
mediana ≤ 8.000, desempate por precisión macro; empate completo conserva el primer
resultado, incluyendo el baseline. Parámetros sin evidencia de efecto (dirty,
skill, scope, umbral de ancla) no se ajustan. Los demás mantienen los defaults.

[Informe y tabla completa](../../benchmarks/reports/calibracion-37.md), con JSON
adyacente, registra ids de ambos conjuntos, SHA-256 del dataset y configuraciones.

| Conjunto | Configuración | Recall | Precisión | Mediana tokens |
|---|---|---:|---:|---:|
| Calibración (21) | Antes | 0,7143 | 0,0331455 | 7.548 |
| Calibración (21) | Elegida | 0,7143 | 0,0331606 | 7.532 |
| Validación (9) | Antes | 0,6296 | 0,0302831 | 7.540 |
| Validación (9) | Elegida | 0,6296 | 0,0302831 | 7.553 |

La elegida (#23) cambia w_lex de 0,6 a 0,2 y duplica todos los r(intent): fix
0,5→1; modify 0,5→1; test 0,4→0,8; refactor 0,7→1,4; add 0,1→0,2;
explain 0,3→0,6. Top BM25 20, core N 15, L2 5 y margen 5 % permanecen iguales.
Estos son valores experimentales, **no nuevos defaults**. Los defaults efectivos
antes/después son idénticos para todos los campos de ContextParams.

## Decisión

Rechazar el cambio de defaults: no mejora recall en validación. El TARGET 0,80
no se alcanza con esta búsqueda. La mínima mejora de precisión en calibración
no justifica cambiar el comportamiento público. Se conservan la instrumentación,
los parámetros internos y los informes reproducibles para futuros experimentos.

## Seguimiento 2026-10-04

[ADR-028](ADR-028-expansion-lexica-context-engine.md) implementa expansión es/en
versionada y cortes relativos centralizados en ContextParams. Con 60 casos y
splits persistidos (30/30), la configuración elegida solo con calibration mejora
validation de 0,6000 a 0,7500, y reduce la media de 6.650,13 a 5.242,50 tokens.
El objetivo 0,80 sigue pendiente. Se acepta expansión y corte del ranking al 1 %;
se conserva top 20 porque el corte BM25 no gana. Las cifras de 30 casos que siguen
son históricas y no describen los defaults nuevos. ADR-028 documenta contratos,
rejilla, snapshots y la sincronización normativa pendiente fuera del ámbito.

## Propuestas de algoritmo (seguimiento en ADR-028)

- Investigar expansión léxica versionada español/inglés o anotaciones de dominio
  independientes del gold para tareas sin ruta/símbolo: sus archivos objetivo
  reciben solo el prior genérico. Medir contra recuperación léxica aislada antes
  de añadir embeddings conforme ADR-006.
- Investigar un corte de relevancia que evite gastar miles de tokens en firmas
  sin señal directa, y redistribución del presupuesto hacia candidatos con señal.
  Medir precisión y recall conjuntamente; liberar presupuesto por sí solo no
  recupera objetivos que continúan al final del ranking.
- Resolver tareas de creación/refactor mediante contexto del origen y directorios
  de destino, sin inventar archivos ni exigir exponer contenido que aún no existe.
  Separar una métrica adicional de recall sobre archivos existentes, manteniendo
  intacta la métrica normativa de gold_modified y publicando ambas.
- Ampliar ctx-gold a ≥ 60 casos y validar también por grupos de tarea/repositorio:
  el split por id evita usar validación para ajustar pero comparte fixture y
  tareas similares. Una fixture distinta aportaría evidencia de generalización.

## Consecuencias y límites

Resultado negativo publicado. La suite de 30 casos no satisface aún el mínimo
normativo de REQ-CTX-003. Los tokens corresponden al estimador bytes-lf/3.2@1;
no se calibra su relación con un tokenizer externo. La búsqueda es acotada,
no prueba que ninguna combinación posible pueda alcanzar el TARGET. No cambian
algoritmos, defaults, snapshots ni entradas públicas.
