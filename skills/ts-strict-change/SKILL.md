---
name: ts-strict-change
description: Modifica TypeScript estricto conservando contratos y tipos precisos.
license: MIT
metadata:
  foker-skill-version: "1.0.0"
  foker-contract: "foker.skill.yaml"
---

# ts-strict-change

## Procedimiento
1. Obtén contexto de los símbolos, consumidores y tests relacionados.
2. Define tipos precisos y estrecha unknown antes de usar datos externos.
3. Mantén los contratos públicos; maneja null y errores explícitamente. No uses any ni aserciones para ocultar errores.
4. Cambia el mínimo de archivos dentro del alcance y añade pruebas de los casos límite.
5. Ejecuta typecheck, lint y test; corrige los hallazgos antes de submit.

## Errores comunes
- Silenciar el compilador con any o assertions injustificadas.
- Cambiar contratos sin revisar consumidores.
