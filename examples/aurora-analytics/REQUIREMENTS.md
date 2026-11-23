# Requisitos de Aurora Analytics

Documento de producto. Cada sección es independiente.

## Design Tokens
Paleta oscura financiera: `--color-bg: #0b1020`, `--color-accent: #3dd68c`, tipografía Inter 14/20.
Los gráficos usan la escala categórica de 8 colores y nunca rojo/verde como único canal.

## Rutas
- `/dashboard`: KPIs por inquilino.
- `/api/webhooks/carrier`: recibe eventos del transportista; verifica HMAC-SHA256 de la cabecera `x-signature` antes de interpretar el cuerpo y rechaza con 401.
- `/api/health`: estado del servicio.

## Modelo de Datos
Tablas `tenants`, `shipments(id, tenant_id, status, eta)`, `events(id, shipment_id, kind, payload)` con Drizzle.
Toda consulta filtra por `tenant_id`.

## Seguridad
OWASP ASVS L2. Secretos solo por variables de entorno validadas en `lib/env.ts`. Comparación HMAC en tiempo constante.

## Despliegue
Vercel, región fra1, previews por rama.
