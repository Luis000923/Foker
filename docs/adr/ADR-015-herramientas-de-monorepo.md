# ADR-015 · pnpm para el repo de Foker; pnpm + Turborepo solo para la plantilla

- **Estado**: Aceptada (modifica ADR-001 original)
- **Fecha**: 2026-10-04

## Contexto
El ADR-001 original (pnpm + Turborepo) mezclaba el repo de Foker con los proyectos generados; sus argumentos (dependencias fantasma creadas por agentes, caché de builds de apps) aplican a los segundos.

## Problema
Elegir herramientas de monorepo para cada ámbito sin añadir complejidad sin beneficio.

## Decisión
- **Repo de Foker**: pnpm workspaces + cargo. Sin Turborepo en el MVP (pocos paquetes TS; el coste dominante es la compilación Rust). Reevaluar si el CI de TS supera 10 minutos.
- **Plantilla `nextjs-turbo`**: pnpm workspaces + Turborepo (decisión original mantenida: aislamiento estricto de dependencias y ejecución por paquete afectado). Remote cache desactivado por defecto.
- Foker **no depende** de Turborepo para funcionar: los checks son comandos configurables y `${affected_packages}` se calcula con el Project Map.

## Alternativas
1. *Turborepo también en Foker*: caché útil a gran escala; hoy sobrecoste de configuración.
2. *Nx / Bazel*: más potentes, mucho más complejos. Descartados.

## Consecuencias
- (+) Menos piezas en el repo de Foker; Foker sirve a repos sin Turborepo.
