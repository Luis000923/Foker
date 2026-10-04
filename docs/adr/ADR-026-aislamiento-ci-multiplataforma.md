# ADR-026 · Aislamiento multiplataforma en GitHub Actions

- **Estado**: Aceptado
- **Fecha**: 2026-10-04
- **Amplía**: ADR-009 (REQ-SEC-001 en GitHub Actions) y ADR-014 (CI multiplataforma)

## Contexto

FOKER-SPEC §11.1 exige contenedor sin secretos para agentes y checks en CI
(REQ-SEC-001). FKR-002 exige tests en Ubuntu, macOS y Windows; FKR-006 exige
seis targets del addon y smoke tests en runner nativo; FKR-081 exige también
windows-11-arm, macos-15-intel y Node 22/24/26. GitHub Actions solo admite
job containers en Linux. Eliminar plataformas para imponer contenedor
incumple esos criterios de aceptación.

## Decisión

Para GitHub Actions, Linux ejecuta código del repositorio en contenedor con
imagen de versión exacta `rust:1.98.0-bookworm`. Las matrices mixtas declaran
`container: ${{ startsWith(matrix.os, 'ubuntu') && 'rust:1.98.0-bookworm' || '' }}`
(o `matrix.runner` para smoke). El validador acepta únicamente esa expresión;
para cada entrada Ubuntu selecciona la imagen exacta.

macOS/Windows ejecutan en runner alojado efímero de GitHub (VM descartable)
como aislamiento equivalente para esta aplicación de REQ-SEC-001. La allowlist
es `macos-15`, `macos-15-intel`, `windows-2025` y `windows-11-arm`.
Se prohíben runners self-hosted incluso si declaran contenedor. Los jobs de
código no reciben secrets ni referencias a github.token, usan permisos
`contents: read` y checkout con `persist-credentials: false`. No se permiten
volumes, options ni credentials de contenedor. La versión de imagen y el
validador se actualizan juntos.

Se conserva la excepción existente de notificación de regresión: sin checkout
ni código del repositorio, solo `gh issue create`, con `issues: write` y token
efímero. Esta excepción no autoriza credenciales en jobs de código.
La decisión se limita a GitHub Actions; no relaja el aislamiento del benchmark
ni cambia contratos, esquemas o formatos versionados.

## Consecuencias

Se restauran las matrices y los pasos Windows sin perder cobertura ni el
validador. Los smoke tests mantienen los seis runners nativos. actionlint
valida la sintaxis y los tests del validador cubren ambas formas de aislamiento.

Riesgo residual explícito: dentro de una VM macOS/Windows el código tiene acceso
al entorno del runner, sus herramientas y red; no existe una segunda frontera
de contenedor. La VM descartable limita persistencia entre jobs, pero no evita
exfiltrar datos accesibles durante el job ni abusar de recursos. Los contenedores
Linux tampoco imponen por sí solos una política de red y comparten kernel con
el runner. Se confía en el aislamiento y descarte de infraestructura alojada de
GitHub y en las acciones de terceros fijadas por SHA. La validación estática no
certifica ese aislamiento; la ejecución real multiplataforma requiere evidencia
externa de GitHub Actions.
