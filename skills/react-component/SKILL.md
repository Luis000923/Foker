---
name: react-component
description: Crea o modifica componentes React accesibles y con estado predecible.
license: MIT
metadata:
  foker-skill-version: "1.0.0"
  foker-contract: "foker.skill.yaml"
---

# react-component

## Procedimiento
1. Lee componentes cercanos y reutiliza sus convenciones y estilos.
2. Define props tipadas y separa el estado mínimo de valores derivados.
3. Usa HTML semántico, etiquetas accesibles y navegación por teclado.
4. Mantén hooks incondicionales y limpia suscripciones y efectos; evita efectos para cálculos puros.
5. Prueba interacciones y estados de carga, vacío y error. Ejecuta typecheck, lint y test.

## Errores comunes
- Duplicar estado derivado o usar índices como claves de listas mutables.
- Crear controles sin etiqueta ni foco visible.
