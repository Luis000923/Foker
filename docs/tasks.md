# Tareas: ledger, baseline y gates (FKR-045–FKR-048)

`TaskStore` de `@foker/engine` recibe un root absoluto y ofrece `begin`, `get`, `list`,
`touch`, `cancel`, `submit`, `finishValidation`, `approve`, `reject`, `unblock`,
`verifyLedger` y `diffSinceBaseline`. El reloj y los diez bytes aleatorios del ULID son
inyectables; `maxActive` permite pasar `policy.tasks.max_active` efectivo (default 5).
Los actores humanos deben tener formato `cli:<usuario>`; la CLI debe comprobar TTY antes
de invocar estas operaciones. Esta capa no acredita por sí misma la identidad humana.

`submit` reserva el intento pasando a VALIDATING; el ejecutor de gates (FKR-047) llama
`finishValidation` con evidencia conforme al esquema. COMPLETED requiere los cinco gates
únicos con `pass` (skill puede estar `skipped` si no hay skill). AWAITING_APPROVAL exige
algún `approval_required` y ningún fallo. La evidencia se escribe antes del evento y su
hash canónico queda enlazado. Cada validación crea con `wx` una evidencia inmutable:
`evidence.json`, `evidence.2.json`, `evidence.3.json`… dentro del mismo intento. Para infraestructura no ejecutable, el ejecutor entrega
BLOCKED y `blockedReason = 'FKR-VAL-004'`; el intento no se incrementa. El humano puede
desbloquear para continuar con el mismo intento. Los rechazos sí consumen un intento.

Los registros se validan contra `task` y se reemplazan mediante archivo temporal y rename.
Cada transición agrega un evento conforme a `task#/$defs/event`, con BLAKE3 canónico del
anterior. El lease se comprueba al leer/listar y antes de mutar; `touch` registra actividad
sin inventar una transición de estado. RUNNING → BLOCKED por stale es la excepción
explícita de lease a la tabla del diagrama. REJECTED siempre genera su evento antes de
pasar automáticamente a RUNNING (incremento) o FAILED.

Decisiones de implementación que la especificación no fija:

- Locks `open('wx')`: hasta 100 intentos separados por 10 ms, luego FKR-VAL-003. Un lock
  abandonado por un proceso muerto requiere intervención; no se elimina automáticamente.
  `begin.lock` serializa la idempotencia y el cupo global. Las operaciones de tarea usan
  `<id>.lock` y un submit concurrente pierde con FKR-TSK-002 o FKR-VAL-003.
- `<id>.integrity.json` guarda longitud y hash final para detectar truncamientos, incluido
  borrar el último evento cuando su estado coincide con otro anterior. Es metadato interno,
  sin cambios al contrato TaskRecord. No es una firma: editar coordinadamente todos los
  artefactos locales sigue siendo posible (T13/T17); CI debe repetir los gates.
- `<id>.baseline.json` contiene `snapshot` (alcance más archivos sucios) y `tree` (todos los
  archivos descubiertos, incluidos los ignorados sensibles). `snapshot_hash` autentica
  el documento completo (incluido modo y exclusiones). Un baseline alterado o ilegible
  lanza `BaselineTamperedError`; submit lo convierte en BLOCKED con gate de política y
  razón `baseline_tampered`. Guardar
  también `tree` con git permite distinguir archivos inicialmente sucios de cambios posteriores
  fuera del alcance, incluso si dejan de aparecer en git status. Los cambios se ordenan por path.
- Se reutiliza un helper de git con execFile, timeout de 5 s y sin shell. Baseline consulta
  status y diff de HEAD, pero la comparación de hashes del árbol decide el cambio real.
  Sin HEAD (incluido un repo git vacío) `git_head` es null. Un fallo de git en begin usa
  el recorrido completo; en submit se conserva el modo del baseline.
- El recorrido TS excluye node_modules, .git y .foker; no sigue enlaces simbólicos. Límite de
  50.000 archivos (FKR-MAP-003); los hashes binarios delegan en `@foker/core.hashBytes` → Rust
  BLAKE3.
- ADR-037: Git enumera ignorados exclusivamente mediante `git ls-files --others --ignored
  --exclude-per-directory=.gitignore --directory -z`, sin shell. No consulta `.git/info/exclude`
  ni `core.excludesFile`. Todo archivo llamado `.gitignore` se hashea, incluso si se ignora.
- Los directorios ignorados se recorren con `readdir`, sin hashear sus archivos ordinarios.
  `matchGlobs` de `@foker/core` decide las excepciones de `protected_paths` y `secret_globs`
  con la misma política y `configPath` que los gates. Los archivos versionados forzadamente
  siguen contando. Los separadores se normalizan solo en Windows.
- El caso POSIX de ADR-037 conserva los nombres con barra invertida en las exclusiones,
  evitando confundirlos con otro archivo versionado que use `/`. Los esquemas existentes
  rechazan barras invertidas en rutas de tareas/evidencias; publicar cambios de un archivo
  con ese nombre literal requiere revisar ese contrato.
- Los enlaces simbólicos se registran con hash del destino de `readlink`, prefijado con
  `symlink:` para distinguirlos de archivos regulares, sin seguirlos.
- El baseline almacena y autentica también `mode` (`git`/`none`) y `exclusions` (archivos y
  directorios). Si Git falla en submit, se reutilizan las exclusiones guardadas; un begin sin
  Git conserva `none` aunque Git se recupere. Los baselines antiguos sin modo se leen como
  `none` y conservan la comprobación de hash de `{snapshot, tree}`.
- Las escrituras de evento, registro y ancla son secuenciales bajo lock, no una transacción
  multiartefacto. Una interrupción entre ellas produce inconsistencia detectable por verifyLedger.
  Un ULID duplicado falla sin sobrescribir la tarea existente.

Los tests cubren toda la matriz de transiciones, 500 secuencias con semilla, evidencia,
aprobaciones, reintentos, idempotencia, concurrencia, lease, corrupción y baseline con/sin git.


`submitTask(root, taskId, { summary?, trustBaseDir?, configPath? })` reserva VALIDATING,
ejecuta scope → policy → map → checks → skill y entrega evidencia inmutable a la FSM.
G1 intersecta los globs del alcance con `permissions.write_paths` de la skill. Los
borrados fuera de alcance pueden exigir aprobación. G2 bloquea rutas protegidas,
baselines manipuladas y secretos añadidos; enumera cambios sensibles y de dependencias
que requieren aprobación. G3 refresca el mapa y rechaza archivos con parse_status failed.
G4 y G5 ejecutan secuencialmente los checks declarados, con trust ligado a su hash y
hallazgos estructurados. FKR-POL-010 y FKR-VAL-004 bloquean sin consumir intento.

El resultado de submit contiene `task_id`, `state`, `attempt`, `gates`, `evidence` (ruta
relativa) y `next_action`. `state` describe el intento: puede ser REJECTED mientras el
registro ya está RUNNING en el siguiente intento; al agotar intentos se devuelve FAILED.
`summary` no determina el resultado ni se añade al contrato de evidencia.

`validateProfile(root, { profile, checks?, packages?, changed?, trustBaseDir?, configPath? })`
ejecuta los mismos checks sin mutar tareas y escribe checks.json en `.foker/runs/adhoc/`.
Un perfil o check desconocido produce FKR-VAL-001; falta de trust produce FKR-POL-010.
`verifyTask(root, id, options?)` reejecuta los gates y devuelve `matches` y evidencia actual,
sin renovar el lease ni escribir eventos. Compara cambios, hash del mapa, resultado y
hallazgos/checks, excluyendo timestamps y duration_ms. Una aprobación posterior a la
última evidencia puede hacer que el resultado actual difiera de ella.

Decisiones adicionales que la especificación no fija:

- `.foker/validate.lock` se adquiere inmediatamente con wx: un lock existente da
  FKR-VAL-003. Cubre submit, validate y verify, incluso entre procesos.
- Baseline solo conserva hashes. Para archivos inicialmente limpios se usa git diff
  --no-color -U0 contra su HEAD inicial; para archivos nuevos, sucios al comenzar o sin
  git se escanean todas las líneas conservadoramente. Dependencias se comparan con git
  show cuando está disponible; un package.json modificado/borrado sin contenido anterior
  requiere aprobación conservadora. Los cambios exclusivos de metadatos con baseline
  limpia no la requieren. Los archivos de secretos también participan mediante hashes.
- Se repite impact dependents en lotes de 20 hasta cubrir dependientes transitivos.
  Los nombres npm se pasan como --filter, sin prefijo pkg:. Un workspace single no
  recibe filtros. Si los afectados incluyen el paquete raíz (`path: '.'`), solo o junto
  con otros paquetes, el engine entrega una lista vacía: `${affected_packages}` se elimina
  y el check se ejecuta sin filtros para todo el workspace (FKR-105). Esto también aplica
  al combinar afectados del mapa previo por borrados con los del mapa refrescado;
  policy no interpreta el mapa.
- approve/reject/unblock piden confirmación por TTY; --yes no evita esta confirmación.
  La excepción no interactiva exige simultáneamente --ci explícito y CI=true. Un rechazo
  de confirmación sale con 6 y no modifica el ledger. unblock --scope registra el nuevo
  alcance en la aprobación humana. approve satisface solo las rutas enumeradas en los
  hallazgos de aprobación de la última validación; no autoriza archivos nuevos arbitrarios.

La suite E2E usa un agente simulado, checks portables con process.execPath, repositorios
git temporales y un TrustStore aislado. Comprueba reintento, scope, secretos, dependencias,
aprobación TTY/CI, rutas protegidas, trust, binario inexistente, baseline alterada, skills,
impacto, timeout, evidencia conforme al esquema y verifyLedger. El estado nativo de parseo
failed se simula: un error de sintaxis ordinario es partial, según el núcleo. Los casos de
ADR-037 usan un `.gitignore` versionado y un check que deja `dist/x.js` y `.eslintcache`: el
segundo submit pasa G1, un `.env` ignorado y protegido editado bloquea en G2 e ignorar un
archivo fuera de alcance rompe G1 por el propio cambio en `.gitignore`.

Medición FKR-098 (2026-10-05, Node 22.23.2, Linux): repositorio temporal sintético con
10.000 archivos en `src/`, 5.000 en `dist/` y `.gitignore` con `dist/`. No hay HEAD y todos
los archivos son inicialmente no versionados; alcance `src/**`. Se mide `captureBaseline`
completo (incluye consultas Git, recorrido, hashes y escritura), con un par de calentamiento
y siete pares alternando orden. Comparación con main `9d754bb2f5206e6819ba4f2da8051ec4088215e9`:
mediana main **15.246,50 ms**, reimplementación **815,51 ms** (−94,65 %). El árbol pasa de
15.001 a 10.001 entradas. Se cumple el límite de +10 % para este escenario; el fixture
`fixtures/large-10k` no está presente en este checkout, por lo que esta medición usa el árbol
sintético descrito, sin certificar el fixture ausente.
