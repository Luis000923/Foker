# Fixture B · Minado determinista (FKR-014, parte A)

ctx-gold y evaluador offline (parte D): [ctx-gold/README.md](ctx-gold/README.md).

Implementa las reglas 1–6 congeladas en [ADR-035](../../docs/adr/ADR-035-fixture-b-repositorios-reales.md).
No requiere red ni dependencias nuevas. Ejecutar desde la raíz de Foker, con Node ≥ 22.14 y Git,
utilizando clones completos de solo lectura:

```sh
node benchmarks/fixture-b/mine.mjs --repo vite --path /home/luis/Documentos/foker-fixture-b/full/vite --identity cf5c0288d526824aead1b24e977400f13c527927
node benchmarks/fixture-b/mine.mjs --repo query --path /home/luis/Documentos/foker-fixture-b/full/query --identity b90d8cee92c931773df73a39c9aa6cfc30afe5a1
node benchmarks/fixture-b/mine.mjs --repo zod --path /home/luis/Documentos/foker-fixture-b/full/zod --identity 004d800c9e3cd4c79930f55aa4ad080225b22efd
```

El programa sobrescribe únicamente `candidates/<repo>.jsonl` y `candidates/<repo>.rejected.jsonl`,
relativos al script. Solo ejecuta `git log` y `git diff` sobre el clon; no usa HEAD, checkout ni remotos.
Enumera toda la cadena first-parent de la identidad, incluida esta, y filtra por fecha de commit
(en UTC, extremos inclusivos). No utiliza `--since`, que podría podar ancestros con fechas no monótonas.
No registra commits fuera del universo temporal ni de la cadena first-parent.

Conteos obtenidos con estas identidades:

| Repo | Universo | Candidatos | Rechazados | merge | subject | src_count | no_test | forbidden_file | too_many_files |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| vite | 612 | 112 | 500 | 0 | 362 | 30 | 91 | 17 | 0 |
| query | 932 | 69 | 863 | 0 | 800 | 38 | 24 | 0 | 1 |
| zod | 436 | 172 | 264 | 1 | 174 | 42 | 43 | 3 | 1 |

Cada rechazo conserva el primer motivo fallido en el orden del ADR. `merge` representa cualquier
cantidad de padres distinta de uno (también un commit raíz). `subject` incluye los asuntos excluidos
y las menciones de dependencia solicitadas: `deps`, `dependency`, `bump`, `renovate` (palabras completas,
sin distinguir mayúsculas) y `update dependency`.

Los dos archivos se ordenan por el digest hexadecimal ascendente de `sha256("fixture-b-42:" + C)`.
`fecha` es la fecha de commit normalizada a UTC; `src_modified`, `src_added` y `tests_changed` son
listas de rutas ordenadas. `type` procede del prefijo convencional `fix`, `feat`, `perf` o `refactor`,
con ámbito opcional y `!` opcional; los demás asuntos tienen tipo `otro`.
Dos ejecuciones completas produjeron los mismos bytes en los seis archivos.

## Interpretaciones y advertencias

- Las regex `EXCLUDE` y `TEST` reproducen la conducta de `tools/eligibility.py` (un solo escape).
  La primera entrega duplicaba los escapes (`\\.`), con lo que `*.test.ts` fuera de carpetas de
  test y `.github` no se reconocían. Lo detectó la verificación de Claude, se corrigió con un test
  de paridad y se volvió a minar: Zod pasó de 169 a 172 candidatos.
- Código propio: extensiones `.ts/.tsx/.mts/.cts`, excluyendo `.d.ts`, tests y `EXCLUDE`.
  Para tests se aplican las mismas extensiones y exclusión de `.d.ts`, sin aplicar `EXCLUDE`,
  igual que `ts_tests` en el script de origen.
- «Modifica» significa exclusivamente estado `M`. Tests cambiados significa `A` o `M`.
  Los renombres se detectan explícitamente al 50 % (`--find-renames=50%`) y cuentan como `R`,
  nunca como `M`; cada entrada de diff cuenta una vez en `files_total`.
- La regla 5 se aplica al nombre del archivo en cualquier directorio y a ambas rutas de un
  renombre, para cualquier estado. «Lockfiles» se concreta en `pnpm-lock.yaml`, `package-lock.json`,
  `npm-shrinkwrap.json`, `yarn.lock`, `bun.lockb`, `bun.lock` y `deno.lock`.
  Configuración: los patrones literales `tsconfig*.json` y `vitest*.config.*` del ADR.
- Estos son **candidatos**, no tareas aceptadas: no se limita el minado a 15. La verificación
  posterior deberá recorrer este orden hasta 15 aceptados por repo o agotar la lista.
  F2P/P2P, tres repeticiones, tipos/lint upstream, enunciados, ctx-gold y preparación del arnés
  siguen pendientes. Los conteos no acreditan E4/E8 ni ausencia de leakage.
- Solo se guardan metadatos y rutas; no se guardan diffs, patches ni contenido de tests.

## Comprobación local

Vitest incluye `benchmarks/**/*.test.ts`; el repo sintético se crea y elimina en el directorio
temporal del sistema. Cubre las seis reglas, su precedencia, los límites 1/5 y 20 archivos,
renombres, fechas de commit frente a autor, extremos temporales, first-parent y orden por semilla.

```sh
./node_modules/.bin/biome check benchmarks
./node_modules/.bin/tsc -p tsconfig.json
./node_modules/.bin/vitest run benchmarks/fixture-b
```

Comprobaciones verdes (2 tests). En un worktree sin `packages/core/dist`, el chequeo global de tipos
requiere primero `./node_modules/.bin/tsc -p packages/core/tsconfig.json`: otro benchmark existente
importa ese artefacto. No requiere compilar el addon nativo para estos tests.
