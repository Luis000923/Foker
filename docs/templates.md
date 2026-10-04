# Plantilla nextjs-turbo

`foker init mi-proyecto --template nextjs-turbo --targets claude-code` crea un monorepo
pnpm + Turborepo con Next App Router, health GET, Button tipado, configuraciones
compartidas TypeScript strict y ESLint, CI sin deploy, reglas y especificación de ejemplo.
La versión inicial registrada en `foker.config.yaml` es 0.1.0.

El destino debe estar vacío o no existir. `--force` escribe únicamente los archivos de
la plantilla y avisa de los sobrescritos; conserva archivos ajenos. `--dry-run` lista
archivos de plantilla e integraciones sin escribir. Init ejecuta sync con los targets
seleccionados, pero no instala dependencias. `--from-spec` lee un foker.md del destino;
para usarlo en un directorio ocupado se necesita `--force`.

Después ejecuta `pnpm install`, revisa y versiona el lockfile generado y ejecuta los
cuatro scripts raíz. CI exige ese lockfile. No se incluye uno sin resolver dependencias.
El build de la CLI empaqueta `templates/`; en desarrollo se usa el directorio del repo.

Incluye CSP, HSTS, nosniff, Referrer-Policy, helper same-origin probado con Vitest,
entorno Zod validado al arrancar, prohibición de child_process y react/no-danger,
secret-scan y perfil security con audit. Playwright comprueba cabeceras y se ejecuta
por separado: no se ejecuta en el CI de Foker. La CSP básica permite inline para Next;
su endurecimiento con nonces y HTTPS/proxy requieren revisión de producción.

Remote cache no está configurado. Exporta `TURBO_TELEMETRY_DISABLED=1` para desactivar
telemetría (CI ya lo hace). pnpm tiene `minimumReleaseAge: 1440` y `allowBuilds: {}`.
Las versiones están fijadas; las referencias internas usan `workspace:*`.

El MVP no incluye BD, autenticación, autorización ni rate limiting. La matriz inicial
`docs/security/asvs-matrix.md` de cada proyecto documenta mecanismos, verificaciones
y pendientes de ASVS 5.0: no afirma cumplimiento ni constituye certificación.
