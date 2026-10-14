# Plantilla nextjs-turbo

`foker init mi-proyecto --template nextjs-turbo --targets claude-code` crea un monorepo
pnpm + Turborepo con Next App Router, health GET, Button tipado, configuraciones
compartidas TypeScript strict y ESLint, CI sin deploy, reglas y especificación de ejemplo.
La versión inicial registrada en `foker.config.yaml` es 0.1.0.

El destino debe estar vacío, contener únicamente `.git` (por ejemplo, tras `git init`) o no existir. `--force` escribe únicamente los archivos de
la plantilla y avisa de los sobrescritos; conserva archivos ajenos. `--dry-run` lista
archivos de plantilla e integraciones sin escribir. Init ejecuta sync con los targets
seleccionados, pero no instala dependencias. `--from-spec` lee un foker.md del destino;
para usarlo en un directorio ocupado se necesita `--force`.

Incluye `apps/web/AGENTS.md` con el bloque `nextjs-agent-rules` y
`apps/web/CLAUDE.md` con `@AGENTS.md`: Next.js 16 los genera y vuelve a crearlos
al ejecutar `next dev`. Versionarlos desde la plantilla mantiene limpio el árbol
y evita que el gate G1 los marque como cambios fuera de alcance. `foker init`
los copia sin modificarlos con sus integraciones; `foker sync` gestiona los bloques
de Foker en los archivos de la raíz y no toca estos archivos de Next.js.

Después ejecuta `pnpm install`, revisa y versiona el lockfile generado y ejecuta los
cuatro scripts raíz. CI exige ese lockfile. No se incluye uno sin resolver dependencias.
El build de la CLI empaqueta `templates/`; en desarrollo se usa el directorio del repo.
`scripts/copy-data.mjs` convierte cada archivo `.gitignore` a `_gitignore` en la copia
para distribución, también en subdirectorios y en cualquier plantilla, porque npm pack
excluye los `.gitignore`. Init restaura el nombre `.gitignore` al materializar esos archivos.
`_gitignore` es un nombre reservado: no debe coexistir con `.gitignore` en el mismo directorio.
El `.gitignore` raíz resultante siempre ignora `.foker/`, sin añadir una regla duplicada.

Incluye CSP, HSTS, nosniff, Referrer-Policy, helper same-origin probado con Vitest,
entorno Zod validado al arrancar, prohibición de child_process y react/no-danger,
secret-scan y perfil security con audit. Playwright comprueba cabeceras y se ejecuta
por separado: no se ejecuta en el CI de Foker. La CSP básica permite inline para Next;
solo con `NODE_ENV=development` añade `'unsafe-eval'` a `script-src` para React.
Producción y test conservan la CSP sin esa excepción. El `.gitignore` también ignora
`*.tsbuildinfo`, generado por el typecheck incremental. Su endurecimiento con nonces
y HTTPS/proxy requieren revisión de producción.

Remote cache no está configurado. Exporta `TURBO_TELEMETRY_DISABLED=1` para desactivar
telemetría (CI ya lo hace). pnpm tiene `minimumReleaseAge: 1440` y `allowBuilds: {}`.
Las versiones están fijadas; las referencias internas usan `workspace:*`.

El MVP no incluye BD, autenticación, autorización ni rate limiting. La matriz inicial
`docs/security/asvs-matrix.md` de cada proyecto documenta mecanismos, verificaciones
y pendientes de ASVS 5.0: no afirma cumplimiento ni constituye certificación.

## Design Tokens (ADR-039)

`foker init --template nextjs-turbo` genera `foker/design-tokens.json` (esquema `design-tokens`:
tipografía, colores claro/oscuro, espaciado, radios) y `apps/web/app/tokens.css` (variables CSS con
modo oscuro por `prefers-color-scheme` y `[data-theme]`). El preset sale de `design.preset` en
`foker.md` (`neutral` por defecto; también `forest`). No hay servicios en ejecución.
