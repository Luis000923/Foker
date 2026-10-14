---
foker_spec: 1
name: aurora-analytics
description: Plataforma B2B de métricas de supply chain
template:
  name: nextjs-turbo
  options: { dark_mode: true }
architecture:
  stack: [nextjs, typescript, drizzle]
  orm: drizzle
  auth: nextauth-v5
  security: { owasp_asvs: L2 }
design_system:
  name: financial-dashboard
  preset: financial-dashboard
  format: open-design/v1
  files: [DESIGN.md, manifest.json, tokens.css]
---

# Aurora Analytics

Panel financiero oscuro para analizar métricas de supply chain por inquilino.
Las rutas de webhook verifican HMAC antes de interpretar el cuerpo.
