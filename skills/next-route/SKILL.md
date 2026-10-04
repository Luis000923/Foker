---
name: next-route
description: Implementa rutas Next.js y route handlers con límites de confianza explícitos.
license: MIT
metadata:
  foker-skill-version: "1.0.0"
  foker-contract: "foker.skill.yaml"
---

# next-route

## Procedimiento
1. Identifica si el cambio es una página o un route handler y revisa las convenciones del proyecto.
2. Mantén secretos y acceso a datos en el servidor; valida parámetros y cuerpo recibidos.
3. Para route handlers con mutación usa assertSameOrigin antes de procesar entradas, conforme a §22.2; revisa el helper existente y prueba rechazo de orígenes ajenos.
4. Comprueba autenticación y autorización antes de leer o mutar recursos; responde con estados HTTP apropiados sin filtrar datos internos.
5. Define caché y manejo de errores conscientemente. Ejecuta typecheck, lint y test y prueba casos rechazados.

## Errores comunes
- Exponer secretos en componentes cliente.
- Omitir assertSameOrigin o autorización en mutaciones.
