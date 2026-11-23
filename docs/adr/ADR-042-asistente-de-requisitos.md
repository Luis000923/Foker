# ADR-042 · Asistente de requisitos y extensión aditiva de Design Tokens

- **Estado**: Propuesta (pendiente de aprobación de la persona)
- **Modifica**: ADR-019 (nuevo esquema `requirements-answers`) y ADR-041 (claves opcionales de Design Tokens).

## Contexto

Tras `foker init` el agente anfitrión no conoce el producto: cada sesión empieza con rondas de
aclaración y con contexto que no se puede recortar. Hace falta una especificación compacta, estable y
segmentable que el Context Engine pueda inyectar por partes.

## Decisión

1. Nuevo esquema `requirements-answers/v1`: solo `idea` es obligatoria; el resto toma defaults
   deterministas por tipo de producto y estilo visual.
2. `foker init` (salvo `--skip-spec`) y el nuevo `foker spec` entrevistan en 4 bloques o leen
   `--answers <json|yaml>`. Sin TTY nunca preguntan. Toda escritura es atómica y ocurre al final.
3. `REQUIREMENTS.md` usa encabezados fijos (`## Resumen`, `## Rutas`…); `foker context --spec <id>`
   añade a las reglas solo esas secciones. Los textos del usuario se escapan a una línea inerte y se
   declaran datos de producto, nunca instrucciones.
4. `design-tokens/v1` gana claves **opcionales**: `typography.font_heading` y, por esquema de color,
   `surface`, `secondary(_foreground)` y `accent(_foreground)`. Los presets existentes siguen siendo válidos.
5. Los colores se validan con WCAG 2.x (texto ≥ 4,5:1, UI ≥ 3:1). Un color que no cumple se ajusta
   y el cambio queda en la tabla de ajustes y en un aviso; nunca en silencio.

## Consecuencias

- Cambio compatible: ningún documento v1 previo deja de validar.
- La detección de inyección es heurística: marca para revisión humana, no bloquea.
- Las tipografías se nombran con pila de respaldo; cargar webfonts queda para una tarea del backlog.
