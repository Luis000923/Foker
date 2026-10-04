---
name: secure-form
description: Construye formularios con zod en cliente y servidor y salida segura.
license: MIT
metadata:
  foker-skill-version: "1.0.0"
  foker-contract: "foker.skill.yaml"
---

# secure-form

## Procedimiento
1. Lee el formulario y su acción o endpoint; delimita los campos aceptados.
2. Define un esquema zod compartido y valida en cliente para feedback y en servidor antes de usar datos.
3. Muestra errores asociados a sus controles; conserva datos válidos, foco y estados de envío.
4. Comprueba autorización y protección de origen en el servidor. Renderiza texto con el escape normal de React; no uses dangerouslySetInnerHTML.
5. Prueba entradas inválidas, límites y envío correcto. Ejecuta typecheck, lint y test.

## Errores comunes
- Confiar exclusivamente en la validación del navegador.
- Renderizar HTML recibido o devolver información sensible.
