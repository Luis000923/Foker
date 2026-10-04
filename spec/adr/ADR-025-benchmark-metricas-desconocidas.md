# ADR-025 · Métricas desconocidas del arnés de benchmark

- **Estado**: Aceptada
- **Fecha**: 2026-10-04
- **Amplía**: ADR-018 (registro de resultados, no metodología)

## Contexto

FKR-011 exige conservar coste desconocido cuando el manifiesto no tiene precios,
reintentos desconocidos si el anfitrión omite el transcript y ejecuciones interrumpidas
por timeout sin usage. El esquema reconstruido de benchmark-result v1 solo admitía
números. Sustituir ausencias por cero sesgaría resultados y descartar fallos sesgaría éxito.

## Decisión

El esquema de benchmark-result v1 admite null en input_tokens_total, cached_tokens,
cache_write_tokens, output_tokens, cost_usd y retries. Null significa exclusivamente
«no observado/no calculable», nunca cero. No se cambian campos ni fórmulas; los
resultados numéricos anteriores siguen validando. Se regeneran tipos desde el esquema.
Los consumidores deben comprobar null; el análisis excluye métricas desconocidas de
sus medias, pero mantiene todos los resultados en la tasa de éxito y declara ausencias.

Sin usage/turnos/coste calculable no se acredita within_limits ni Task Success.
El modelo sigue siendo un ID explícito obligatorio. --allow-null-pricing autoriza
la ejecución sin presupuesto calculable, no autoriza elegir un modelo ni declarar éxito.
La relajación se mantiene en schema_version=1 porque este contrato reconstruido aún
no tiene releases públicas; cualquier publicación posterior requiere fijar esta variante.

## Consecuencias

Se conservan fallos y evidencia cruda sin inventar datos. Herramientas que asumieran
números para toda ejecución necesitan actualizarse. No se modifica el contrato nativo,
los demás esquemas ni el criterio estadístico de ADR-018.
