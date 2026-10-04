# ADR-022 · Checks mediante shims de Windows

- **Estado**: Aceptada
- **Fecha**: 2026-10-03

## Contexto
La plantilla usa pnpm, npm, npx y turbo, distribuidos como shims .cmd en Windows.
Node ≥ 20 no ejecuta .cmd/.bat directamente sin shell. Rechazarlos impide ejecutar
los checks de la plantilla.

## Decisión
El resolver acepta .cmd/.bat. Para estos archivos en Windows, el ejecutor invoca
ComSpec (o cmd.exe) con ['/d', '/s', '/c', línea] y windowsVerbatimArguments: true.
La línea usa las comillas externas de /s y el ejecutable entrecomillado:
`""C:\ruta con espacios\pnpm.cmd" --filter=@foker/core test"`.
Cada argumento debe cumplir `^[A-Za-z0-9_@+=:,./\\-]+$`: no se permite %, comillas,
metacaracteres de cmd, espacios ni argumentos vacíos. El path del ejecutable permite
espacios, pero rechaza controles, comillas, %, &, |, <, >, ^, ! y paréntesis.
Un valor inseguro produce FKR-VAL-004 y status skipped antes de lanzar el proceso.
Los otros ejecutables mantienen argv literal y shell: false.
La construcción de argv es una función pura, comprobada simulando win32 en cualquier SO.

La confianza incluye el hash canónico de { validation, env_allowlist } efectivos.
Validation incluye network efectivo por check; ampliar el entorno o cambiar permisos
de red invalida una aprobación previa (T2/T10). La ejecución no impone aislamiento de red.

## Alternativas
1. Rechazar shims: rompe los checks habituales en Windows.
2. shell: true con argumentos arbitrarios: expone expansión e inyección de comandos.
3. Resolver scripts JavaScript específicos de cada gestor: depende de su instalación.

## Consecuencias
- (+) Compatibilidad con los gestores de la plantilla y límites explícitos de cmd.exe.
- (+) La confianza se invalida ante cambios del entorno permitido o de network.
- (−) Los shims rechazan argumentos con espacios y otros caracteres fuera de la allowlist;
  para esos checks se debe invocar un ejecutable nativo con argv literal.
