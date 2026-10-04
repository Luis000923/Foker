# ADR-029 · Anfitriones del benchmark por suscripción

- **Estado**: Aceptada
- **Fecha**: 2026-10-04
- **Amplía**: ADR-018, ADR-025 y ADR-027

## Contexto

El arnés exigía ANTHROPIC_API_KEY aunque ADR-027 exige poder usar suscripciones.
Codex/ChatGPT dispone de autenticación local y un ejecutor headless distinto de Claude.
Los importes observados con suscripción no representan una factura API.

## Decisión

Claude admite CLAUDE_CODE_OAUTH_TOKEN generado por `claude setup-token` o
ANTHROPIC_API_KEY. OAuth tiene prioridad si ambas existen. Docker recibe únicamente
`--env NOMBRE`, nunca el valor; preparación y evaluación no reciben estas variables.
El arnés oculta estos valores conocidos en stdout/stderr antes de guardar evidencia.

El manifiesto admite `host.name: codex`. `--host` comprueba la selección del manifiesto,
que debe incluir modelo y versión exactos. La imagen instala @openai/codex@0.159.3.
Codex usa `exec --json`, configuración MCP explícita por `-c` y una sesión efímera.
Solo `--codex-auth-dir` autoriza montar el directorio indicado, en solo lectura.
Un CODEX_HOME temporal enlaza exclusivamente su auth.json y permite escribir estado
sin copiar credenciales. No se descubre ni lee automáticamente ~/.codex.
No se carga la configuración personal; Foker prepara las instrucciones/skills del target
codex y el ejecutor fija el mismo servidor MCP local con `foker mcp --root /work`.
El contenedor con límites de recursos y montaje aislado constituye el sandbox de Codex;
el flag de ejecución sin aprobaciones/sandbox interno solo se utiliza dentro de él.

El contrato reconstruido benchmark v1 añade opcionalmente `billing` con valores
subscription/api y `metrics.reported_cost_usd` numérico o null. Se conserva compatibilidad
con resultados previos sin estos campos. `cost_usd` es siempre el equivalente API
calculado con los precios del modelo exacto del manifiesto; no es cuota ni gasto real
con suscripción. No se agregan precios supuestos de Codex. Sus tokens de entrada
incluyen caché: se resta cached_input_tokens para aplicar el precio sin caché.
Cache write y turnos no observados son null. Campos/events JSONL desconocidos se ignoran.

Claude no recibe max-budget-usd con OAuth; sus límites operativos son max_turns y
max_minutes. El evaluador conserva el criterio de presupuesto equivalente de ADR-025.
La ayuda local de Claude 2.1.289 confirma presupuesto API, MCP, modelo, permisos y JSON;
max-turns está presente en el ejecutable, pero no en su ayuda pública. La ayuda de
Codex 0.159.3 confirma JSONL y -c, sin describir el esquema de eventos ni un límite de
turnos. No se inventa un flag: max_minutes se impone desde el arnés; turnos desconocidos
impiden acreditar within_limits/Task Success. Un límite operativo de turnos Codex queda
pendiente de soporte verificable del anfitrión. Los ejemplos de usage se prueban con dobles,
no constituyen una captura real del proveedor.

## Consecuencias

El smoke consume cuota de suscripción y requiere autorización explícita del usuario al
lanzarlo. Renovar auth.json puede fallar por el montaje de solo lectura: renovar la sesión
fuera del contenedor. No se ejecutan proveedores ni se descarga/construye la imagen
como parte de esta verificación offline. El proxy de red de §20.2 sigue pendiente.
Los tipos generados de schemas necesitan regeneración fuera del ámbito de este cambio;
el arnés declara localmente la ampliación de tipos hasta entonces.
