# Proyecto Next.js + Turborepo

Requiere Node 22.20 o superior y pnpm 11.9.0. Ejecuta `pnpm install`, revisa y versiona
`pnpm-lock.yaml` (no se incluye un lockfile inventado). CI requiere ese lockfile.
Después: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.
Desarrollo: `pnpm --filter @repo/web dev`.
La plantilla incluye `apps/web/AGENTS.md` y `apps/web/CLAUDE.md` porque Next.js 16
los genera y vuelve a crearlos al ejecutar `next dev`. Versionarlos evita cambios
fuera de alcance en el gate G1 de Foker y mantiene limpio el árbol de trabajo.
El bloque `nextjs-agent-rules` pertenece a Next.js; los bloques gestionados por
`foker sync` están en los archivos de la raíz. `foker init` copia estos dos archivos
desde la plantilla sin modificarlos con sus integraciones.
E2E separado: `pnpm --filter @repo/web exec playwright install chromium` y
`pnpm --filter @repo/web test:e2e`. No lo ejecuta el CI de Foker ni el CI inicial del proyecto.

Remote cache no está configurado: no ejecutes `turbo login`/`turbo link` ni aportes
credenciales remotas. Para desactivar telemetría exporta `TURBO_TELEMETRY_DISABLED=1`
y `NEXT_TELEMETRY_DISABLED=1` (CI ya lo hace).
`minimumReleaseAge: 1440` retrasa versiones recientes; `allowBuilds: {}` deniega
scripts de instalación. Autoriza solo scripts revisados si una dependencia los necesita.
Copia `apps/web/.env.example` a `.env.local` en esa carpeta; no contiene secretos.

Consulta `docs/security/asvs-matrix.md`. HSTS necesita HTTPS en producción.
La CSP permite scripts/estilos inline para el arranque de Next; aún requiere endurecer
scripts con nonces y probar CSP en producción. Solo con `NODE_ENV=development` añade
`'unsafe-eval'` a `script-src` para React en desarrollo; producción y test no lo permiten.
No se incluye autenticación, BD ni rate limiting.
