---
name: write-tests
description: Añade tests Vitest que demuestran regresiones mediante fail-to-pass.
license: MIT
metadata:
  foker-skill-version: "1.0.0"
  foker-contract: "foker.skill.yaml"
---

# write-tests

## Procedimiento
1. Lee el comportamiento esperado y las pruebas existentes; identifica un caso observable.
2. Escribe un test Vitest que reproduzca el fallo y ejecútalo antes del cambio: debe fallar por la causa esperada (fail-to-pass).
3. Implementa la corrección mínima y comprueba que el mismo test pasa.
4. Cubre bordes y errores relevantes; aísla reloj, red y aleatoriedad con fixtures deterministas y restaura mocks.
5. Ejecuta typecheck, lint y test; registra el fallo inicial y el resultado final.

## Errores comunes
- Tests que copian la implementación o no fallan antes del arreglo.
- Depender del orden de ejecución o de recursos externos.
