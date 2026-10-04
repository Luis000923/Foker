# Política de seguridad de Foker

## Versiones con soporte

Foker está en desarrollo (pre-0.1.0). Hasta la primera versión publicada solo se corrigen fallos en la
rama `main`. A partir de 0.1.0 se mantendrá con parches de seguridad la última versión *minor*.

## Cómo informar de una vulnerabilidad

**No abras un issue público.** Usa el formulario privado de *Security Advisories* del repositorio
("Report a vulnerability"). PENDIENTE: dirección de correo de respaldo cuando exista el repositorio
público (ver PREGUNTA-3 en la especificación).

Incluye, si puedes: versión o commit, sistema operativo, pasos para reproducir, impacto y una prueba
de concepto mínima. No incluyas secretos reales.

## Plazos

| Paso | Plazo objetivo |
|---|---|
| Acuse de recibo | 3 días hábiles |
| Evaluación inicial y severidad (CVSS 4.0) | 7 días |
| Corrección de severidad crítica o alta | 30 días |
| Corrección de severidad media o baja | 90 días |
| Divulgación coordinada | Tras publicar la corrección, o a los 90 días si no hay acuerdo |

## Alcance

Dentro del alcance (FOKER-SPEC §11):

- Path traversal o escritura fuera de `.foker/` desde el servidor MCP o la CLI.
- Ejecución de comandos sin *workspace trust* o con argumentos inyectados (sin shell, T6).
- Evasión de los gates (llegar a `COMPLETED` saltándose alcance, rutas protegidas, secretos o checks).
- Fuga de secretos en Context Packs, salidas MCP, logs o auditoría.
- Manipulación del ledger o de la evidencia no detectada por `verifyLedger` / `foker task verify`.
- Cadena de suministro de los paquetes `foker` y `@foker/*` y del addon nativo.

Fuera del alcance:

- Acciones realizadas con las herramientas nativas del agente anfitrión (Bash, Edit…) fuera de Foker;
  Foker documenta sus límites en §11.1 y recomienda sandbox de SO.
- *Prompt injection* que no consigue efectos a través de Foker (mitigación parcial por diseño, T3).
- Vulnerabilidades del código generado en proyectos de usuario (ver §22).
- Repositorios a los que el usuario ha concedido trust después de revisar sus comandos.

## Reconocimiento

Con tu permiso, te citaremos en las notas de la versión que publique la corrección.
