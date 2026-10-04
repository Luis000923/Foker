# ADR-009 · Modelo de seguridad de la plataforma: capas, workspace trust y gates

- **Estado**: Aceptada
- **Fecha**: 2026-10-04

## Contexto
V1 prometía aislar variables de entorno "mediante sandboxing en napi-rs" y una allowlist de shell por prefijo. Foker no ejecuta las herramientas del anfitrión, así que no puede cumplir esa promesa. HECHO verificado: en Claude Code las reglas *deny* de lectura no cubren subprocesos que abren archivos por su cuenta; la aplicación a nivel de SO requiere sandbox.

## Problema
Diseñar una seguridad honesta contra: config/skills/`foker.md` maliciosos, prompt injection, inyección de comandos, path traversal, exfiltración, supply chain, escalada vía configuración y manipulación de evidencia.

## Decisión
Cuatro capas (FOKER-SPEC §11.1): C1 permisos nativos generados por `foker sync` (+ hooks donde existan), C2 default-deny en las herramientas de Foker, C3 gates deterministas sobre el diff antes de `COMPLETED`, C4 sandbox de SO (obligatorio en CI/benchmark, recomendado en local). Más: **workspace trust** fuera del repo para los comandos de validación; aprobaciones humanas solo por CLI con TTY; política del proyecto que solo puede endurecer la de Foker salvo `overrides` explícitos; cadena de hashes en el ledger; `foker task verify` para revalidar.

## Alternativas
1. *Sandbox propio de Foker (contenedores/seccomp)*: fuerte, pero no cubre al anfitrión y es costoso multiplataforma. Future (posible integración con sandbox del anfitrión).
2. *Confiar en los permisos del anfitrión*: insuficiente (Antigravity sin equivalente; subprocesos).
3. *Bloquear toda ejecución de comandos*: elimina la validación determinista, que es la tesis.

## Consecuencias
- (+) Ningún resultado inseguro llega a `COMPLETED` sin un humano; ninguna config de un repo ajeno ejecuta comandos sin confianza explícita.
- (−) Sin C4, un agente comprometido puede causar daño durante la ejecución (riesgo residual documentado, R-04).
