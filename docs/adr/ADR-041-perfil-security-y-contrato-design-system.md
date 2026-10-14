# ADR-041 · Perfil canónico de seguridad y contrato `design_system`

- **Estado**: Aceptada (decisión de la persona, 2026-10-14)
- **Issue**: FKR-108
- **Modifica**: ADR-017 y ADR-039.

## Contexto

ADR-039 añadió un auditor léxico y el comando `foker check-security`. La especificación v0.2.0
establece que la entrada canónica de validación es `foker validate --profile security`. También se
necesita describir de manera opcional un paquete estático de OpenDesign sin incorporar su demonio,
estudio ni sus generadores.

## Decisión

1. `foker validate --profile security` ejecuta el builtin `static-security` y el escáner de secretos.
   `foker check-security` es únicamente un alias que delega a ese perfil.
2. `static-security` se denomina **Static Automatable Security Controls (OWASP ASVS L2 Subset)**.
   Es un conjunto de heurísticas para SQL inseguro, HMAC de webhooks, aislamiento por tenant,
   cabeceras CSP/HSTS y validación de herramientas MCP. No acredita ni certifica ASVS.
3. `foker.md.design_system` es opcional y admite el contrato declarativo `open-design/v1`: nombre,
   preset y, cuando se declaran, exactamente `DESIGN.md`, `manifest.json` y `tokens.css`. `foker init`
   usa el preset local para producir tokens deterministas; no lee red, ni lanza un servicio gráfico.

## Consecuencias

- El comando heredado conserva compatibilidad sin crear una segunda ruta de auditoría.
- Los proyectos existentes que solo usan `design` siguen siendo válidos.
- Los resultados estáticos requieren revisión humana y pruebas de seguridad dinámicas cuando aplique.
