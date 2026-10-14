---
name: asvs-l2-review
description: Revisa un cambio contra las reglas defensivas de OWASP ASVS Nivel 2 (ORM, webhooks, tenant, cabeceras) antes de entregarlo.
license: MIT
metadata:
  foker-skill-version: "1.0.0"
  foker-contract: "foker.skill.yaml"
---

# asvs-l2-review

## Procedimiento
1. Ejecuta `foker check-security` sobre el alcance de la tarea y lee cada hallazgo `FKR-SEC-NNN`.
2. Corrige primero los de severidad alta: SQL crudo, webhooks sin HMAC, handlers sin autorización.
3. Accede a datos solo con el ORM (Drizzle o Prisma) y filtra siempre por inquilino y rol.
4. Verifica que las respuestas llevan CSP y HSTS y que ningún dato de entrada llega a `eval` ni a un shell.
5. Repite `foker check-security` hasta que no queden hallazgos, o justifica el falso positivo en la entrega.

## Errores comunes
- Silenciar una regla en lugar de corregir el código.
- Validar el webhook después de procesar su cuerpo.
