# Fixture B · Candidatos para revisión (FKR-093)

Estado: **lista exploratoria, no selección definitiva**, 2026-10-04.
PREGUNTA-6 la decide la persona tras aplicar los
[criterios E1–E8](fixture-b-criterios.md). No ejecutar benchmarks ni modificar el
manifiesto a partir de esta lista sin esa decisión y el ADR metodológico aplicable.

Se consultaron las páginas oficiales de GitHub con la herramienta web. Hay acceso
web de lectura, pero no se clonaron repos, midieron LOC, instalaron dependencias ni
verificaron tareas históricas en foker-bench. Las licencias indicadas son las mostradas
por esas páginas, **pendientes de revisión de LICENSE/avisos en el SHA elegido**.
Las URLs son fuentes de exploración cambiantes, no identidades reproducibles.
No se ofrece un SHA arbitrario por existir un repo: ninguno se ha verificado para
una tarea. No hay cifras de LOC ni tamaños medidos en este documento.

## Matriz de comprobaciones comunes

Esta matriz se aplica individualmente a los ocho candidatos, junto a sus fichas.

| Criterio | Estado de cada candidato y evidencia que falta |
|---|---|
| E1 | Licencia MIT o Apache-2.0 indicada en la fuente oficial enlazada; ambas son [licencias OSI](https://opensource.org/licenses). Falta verificar al SHA derechos sobre código, tests y recursos redistribuidos, avisos y dependencias. No acreditado completamente. |
| E2 | Afinidad TS plausible por el proyecto; falta medir ≥ 60 % de LOC TS propio al SHA y comprobar tarea TS. |
| E3 | Categoría de exploración en cada ficha, no tamaño confirmado. Archivos TS, LOC y clasificación final: **PENDIENTE DE VERIFICAR**. |
| E4 | **PENDIENTE DE VERIFICAR**: lockfile al SHA, instalación congelada, gestor/runtime, pruebas/tipos/lint offline y 3 repeticiones sin flaky. Un lockfile visible hoy no acredita el commit histórico. |
| E5 | Productos upstream con historia pública y finalidad independiente de Foker; falta revisión histórica que acredite ≥ 15 tareas reproducibles y su procedencia. |
| E6 | SHA base y SHA de corrección por tarea: **PENDIENTE DE VERIFICAR** en todos; no hay checkout congelado. |
| E7 | Papel arquitectónico sugerido en cada ficha; verificar paquetes/imports. La diversidad es propiedad del conjunto que decida la persona. |
| E8 | Install, tests, lint/tipos y RAM en foker-bench: **PENDIENTE DE VERIFICAR** en todos. Riesgos inferiores son hipótesis de inspección, no incidentes medidos. |

Ningún candidato está declarado elegible; tampoco se declara que incumple un umbral
sin medirlo. Si se confirma un riesgo incompatible con E4/E8, rechazarlo y conservar
el motivo antes de evaluar brazos.

## small · Biblioteca de estado: Immer

- URL y evidencia: [immerjs/immer](https://github.com/immerjs/immer), licencia MIT
  mostrada en la página oficial; comprobar [LICENSE](https://github.com/immerjs/immer/blob/main/LICENSE).
- Interés E2/E5/E7: actualización inmutable de estado; explorar tareas de proxies,
  patches y casos límite, independientes de un framework. Objetivo small por alcance
  de biblioteca; E3 pendiente, podría no alcanzar el mínimo propuesto.
- E4/E8 y riesgos: revisar toolchain de build y pruebas de tipos; combinaciones de
  versiones o rendimiento pueden elevar tiempos. Install nativo, flaky y acceso a
  red durante tests no comprobados; no asumir «biblioteca» = offline.
- SHA candidato: **PENDIENTE DE VERIFICAR**. Faltan todos los controles comunes.

## medium · Validación de esquemas: Zod

- URL y evidencia: [colinhacks/zod](https://github.com/colinhacks/zod), descripción
  TypeScript-first y licencia MIT oficiales; [LICENSE](https://github.com/colinhacks/zod/blob/main/LICENSE).
- Interés E2/E5/E7: validación y tipado; explorar bugs de parsing y tests de conducta.
  Objetivo medium; estructura packages visible, tamaño y condición monorepo pendientes.
- E4/E8 y riesgos: matriz de versiones TS y pruebas de tipos puede ser costosa;
  configuración multipaquete y benchmarks no deben confundirse con suite de regresión.
  Verificar binarios nativos de herramientas, flaky y descargas de tests/build.
- SHA candidato: **PENDIENTE DE VERIFICAR**. No se han curado 15 tareas.

## medium · Estado de aplicación: Redux Toolkit

- URL y evidencia: [reduxjs/redux-toolkit](https://github.com/reduxjs/redux-toolkit),
  licencia MIT y pnpm-lock.yaml visibles; [LICENSE](https://github.com/reduxjs/redux-toolkit/blob/master/LICENSE).
- Interés E2/E5/E7: reducers, middleware y datos asíncronos; variedad respecto de
  validación/compilación. Objetivo medium, sin conteo que lo confirme.
- E4/E8 y riesgos: integración UI/red simulada, timers y pruebas de tipos; evaluar
  dependencias de browser/DOM y necesidad de downloads. Workspace visible no prueba
  que todos los tests funcionen offline ni que install nativo sea innecesario.
- SHA candidato: **PENDIENTE DE VERIFICAR**. Aplican E1–E8 pendientes de la matriz.

## large · Compilador: TypeScript

- URL y evidencia: [microsoft/TypeScript](https://github.com/microsoft/TypeScript),
  licencia Apache-2.0 oficial; [LICENSE.txt](https://github.com/microsoft/TypeScript/blob/main/LICENSE.txt)
  y NOTICE.txt requieren conservación cuando corresponda.
- Interés E2/E5/E7: compilador, análisis y resolución; contrasta con bibliotecas web.
  Objetivo large por complejidad del dominio, no por LOC comprobadas.
- E4/E8 y riesgos: corpus de compilación/baselines, build previo y suite completa
  potencialmente larga; comprobar cambios de toolchain nativa y compatibilidad Node.
  Elegir un subconjunto antes de medir exige justificar cobertura de regresión;
  no recortarlo después para superar tiempos. Red y flaky sin medir.
- SHA candidato: **PENDIENTE DE VERIFICAR**. Puede incumplir E8; no está demostrado.

## large · Servidor e inyección de dependencias: Nest

- URL y evidencia: [nestjs/nest](https://github.com/nestjs/nest), framework Node
  con TS y licencia MIT oficiales; [LICENSE](https://github.com/nestjs/nest/blob/master/LICENSE).
- Interés E2/E5/E7: DI, módulos, adaptadores y servidor; explorar bugs unitarios
  reproducibles. Objetivo large; confirmar tamaño y arquitectura workspace al SHA.
- E4/E8 y riesgos: integración con transportes/servicios puede exigir infraestructura,
  puertos y red; limitarse a mocks debe conservar cobertura justificada. Revisar
  compilación nativa de dependencias, tiempos y flakiness de concurrencia.
- SHA candidato: **PENDIENTE DE VERIFICAR**. No acreditada suite offline completa.

## monorepo · Estado remoto y adaptadores: TanStack Query

- URL y evidencia: [TanStack/query](https://github.com/TanStack/query), MIT,
  packages, pnpm-lock.yaml y workspace visibles;
  [LICENSE](https://github.com/TanStack/query/blob/main/LICENSE).
- Interés E2/E5/E7: núcleo asíncrono y adaptadores de UI; explorar bugs de caché,
  invalidación y sincronización. Objetivo monorepo; tamaño medium/large pendiente.
- E4/E8 y riesgos: múltiples frameworks, temporizadores y tests de integración
  pueden ser lentos/flaky; aislar servidores HTTP locales y prohibir red externa.
  Verificar instalación de herramientas nativas y browsers si una tarea los requiere.
- SHA candidato: **PENDIENTE DE VERIFICAR**. Falta demostrar imports y cuotas E3/E5.

## monorepo · Herramientas de build: Vite

- URL y evidencia: [vitejs/vite](https://github.com/vitejs/vite), MIT, paquetes y
  lockfile pnpm visibles; [LICENSE](https://github.com/vitejs/vite/blob/main/LICENSE).
- Interés E2/E5/E7: resolución, transformación y servidor de desarrollo; arquitectura
  diferente de estado/RPC. Objetivo monorepo, clasificación de tamaño pendiente.
- E4/E8 y riesgos: binarios nativos de bundlers y compatibilidad libc/arquitectura,
  browsers, servidores y fixtures de integración; posibles downloads y tests lentos.
  La imagen final foker-bench no incluye todo el toolchain de su etapa build.
- SHA candidato: **PENDIENTE DE VERIFICAR**. No inferir offline por tener lockfile.

## monorepo · RPC tipado: tRPC

- URL y evidencia: [trpc/trpc](https://github.com/trpc/trpc), API tipada y MIT
  oficiales; [LICENSE](https://github.com/trpc/trpc/blob/main/LICENSE).
- Interés E2/E5/E7: cliente/servidor, serialización y adaptadores; explorar errores
  de protocolo y pruebas unitarias. Objetivo monorepo; estructura/imports y tamaño
  por los criterios aún pendientes.
- E4/E8 y riesgos: ejemplos full-stack, websockets y browsers pueden requerir red,
  servicios o setup caro. Distinguir núcleo probado de ejemplos sin recortar cobertura
  tras medir; revisar dependencias nativas y tests temporizados/flaky.
- SHA candidato: **PENDIENTE DE VERIFICAR**. Aplican controles comunes E1–E8.

## Próxima verificación humana

Confirmar umbrales y muestreo mediante la decisión metodológica correspondiente;
medir candidatos a SHA, revisar licencias/avisos y demostrar instalación/evaluación
offline. Curar y sellar ≥ 15 tareas por upstream. La persona resuelve PREGUNTA-6
con 2–3 repos y deja registrado por qué incluye/excluye cada uno; si ninguno cumple,
conservar esa conclusión y proponer otro universo, sin adaptar criterios a resultados.
