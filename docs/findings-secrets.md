# Hallazgos de checks y secretos

`@foker/engine` exporta `parseFindings(parser, output, { root })` y
`runProfileCheck(check, options)`. El adaptador ejecuta `runCheck` de policy y
analiza la salida capturada y redactada (hasta 1 MiB), antes del recorte a las
últimas 50 líneas de `output_tail`. Conserva los hallazgos de infraestructura
cuando el proceso no llegó a ejecutarse. El parser por defecto es `generic`.

Los parsers soportan tsc normal y pretty (sin ANSI), ESLint stylish y JSON,
y Vitest textual y JSON. Las posiciones son base 1; los archivos se normalizan
como identificadores POSIX relativos al root. Una ubicación exterior conserva
solo el mensaje. Los resultados se ordenan por archivo, línea, columna y regla.
Generic devuelve hasta 50 líneas con `error`; los otros parsers tienen un límite
de 200 resultados incluyendo el aviso final `foker/truncated`.

`@foker/policy` exporta `scanText(text, { file? })`, `scanAddedLines(diff)` y
`redactSecrets(text)`. Sus 24 reglas detectan formatos de credenciales y claves
privadas; las asignaciones genéricas requieren al menos 12 caracteres y entropía
Shannon de 3,5 bits por carácter y producen un warning. Los mensajes no incluyen
el secreto. Los ejemplos y placeholders evidentes se descartan.

La redacción sustituye las coincidencias por `[REDACTED:<regla>]`; `redact`
primero elimina valores de variables de entorno fuera de la allowlist y después
aplica el escáner. Los consumidores de otras salidas MCP deben llamar a
`redactSecrets` antes de devolver contenido. Los formatos desconocidos siguen
siendo un límite del escáner (§11.2 T9).
