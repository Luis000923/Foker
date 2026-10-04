# Matriz inicial ASVS 5.0

Referencia por capítulos y áreas de ASVS 5.0.0, sin inventar identificadores de requisitos.
Esta matriz parcial no afirma cumplimiento y no constituye certificación.
`automatizado` describe la verificación disponible, no una ejecución ya aprobada.

| Área ASVS 5.0 | Mecanismo | Verificación | Estado |
| --- | --- | --- | --- |
| V1 Codificación y sanitización: XSS | Escape React, react/no-danger | pnpm lint | automatizado |
| V3 Seguridad del frontend: cabeceras | CSP, HSTS, nosniff, Referrer-Policy | Playwright headers.spec.ts | automatizado |
| V3 Seguridad del frontend: CSRF | assertSameOrigin y protección de Server Actions de Next | Vitest del helper; revisar uso en cada mutación con next-route | por-skill |
| V1 Prevención de inyección de comandos | Prohibir child_process en apps | pnpm lint | automatizado |
| V2 Validación y lógica de negocio | Zod para entorno; validar entradas al añadir handlers | Arranque y revisión con next-route | por-skill |
| V13 Configuración: dependencias | Edad mínima, allowBuilds, lockfile revisado, audit, Dependabot | pnpm audit; revisar lockfile y scripts permitidos | manual |
| V13 Configuración: secretos | .env* ignorado, gate secret-scan | foker validate --profile default | automatizado |
| V4 API: SSRF | Sin peticiones salientes; allowlist futura | Revisar cada integración nueva | no-aplica |
| V1 Inyección SQL | Sin BD | Revisar al incorporar persistencia | no-aplica |
| V6 Autenticación, V7 Sesiones, V8 Autorización | Fuera del MVP | Diseñar y probar antes de incorporar cuentas/datos privados | no-aplica |
| V2 Lógica de negocio: abuso y límites | Rate limiting pendiente | Evaluar almacenamiento y modelo de amenazas | manual |
| V12 Comunicaciones seguras | HTTPS y configuración del proxy a cargo del despliegue | Revisión TLS, HSTS y URL fiable para same-origin | manual |

La CSP básica usa unsafe-inline por compatibilidad con Next: nonces y una política más
restrictiva quedan para revisión manual. El helper rechaza Origin ausente y no confía en
cabeceras forwarded; el despliegue debe preservar la URL pública. No sustituye AuthN/AuthZ.
