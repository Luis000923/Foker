# Configuración, confianza y checks

`loadConfig(root, {configPath?})` valida YAML con el esquema estricto. Sin el archivo predeterminado devuelve
`source: null`; los defaults del mapa siguen en el núcleo Rust. `map` y `context` aplican la
configuración antes de sus flags. Una ruta --config explícita ausente falla con FKR-CFG-001.
Context transmite context.core_files al núcleo; cero desactiva la selección core. Validation por defecto no contiene comandos.

Las protecciones de §11.3 se unen a las del proyecto. Solo overrides justificados eliminan
entradas; el resultado devuelve las relajaciones aplicadas para el futuro doctor (FKR-069).
La allowlist de entorno del proyecto reemplaza la predeterminada.

`foker trust` muestra argv antes de confirmar. `--yes` exige tanto `--ci` explícito como
`CI=true`. El almacén externo usa realpath y BLAKE3 de { validation, env_allowlist } efectivos, JSON canónico
del núcleo; cambiar checks, network, perfiles o la allowlist invalida la confianza. `TrustStore(baseDir)` permite
inyectar el directorio de configuración, sin introducir variables de política.

`runCheck` ejecuta argv sin shell, filtra entorno, limita salida a 1 MiB y devuelve sus últimas
50 líneas redactadas. Timeout y aborto matan el grupo POSIX o usan taskkill en Windows.
Una señal ya abortada omite el lanzamiento incluso después de resolver las rutas.
En Windows los scripts .cmd/.bat usan ComSpec con argumentos restringidos según
[ADR-022](adr/ADR-022-checks-windows-cmd.md); valores inseguros fallan con FKR-VAL-004.
El resultado no ejecutado añade `notExecuted` y `code` al CheckResult; esos metadatos deben
separarse antes de validar/serializar el fragmento estricto common checkResult.
La redacción actual solo cubre valores de variables no permitidas; FKR-044 ampliará el escáner.
El ejecutor no es un sandbox de archivos o red. La comprobación de confianza corresponde
al orquestador de validación (FKR-048); MCP no puede concederla.
