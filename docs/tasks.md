# Tareas: ledger y baseline (FKR-045, FKR-046)

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
  archivos descubiertos). `snapshot_hash` autentica `{snapshot, tree}` completo. Un baseline alterado o ilegible
  lanza `BaselineTamperedError`; submit lo convierte en BLOCKED con gate de política y
  razón `baseline_tampered`. Guardar
  también `tree` con git permite distinguir archivos inicialmente sucios de cambios posteriores
  fuera del alcance, incluso si dejan de aparecer en git status. Los cambios se ordenan por path.
- Se reutiliza un helper de git con execFile, timeout de 5 s y sin shell. Baseline consulta
  status y diff de HEAD, pero la comparación de hashes del árbol decide el cambio real.
  Sin HEAD (incluido un repo git vacío) `git_head` es null. Un fallo de git usa el recorrido TS.
- El recorrido TS excluye node_modules, .git, .foker y los globs de secretos de la política
  predeterminada; no sigue enlaces simbólicos. Incluye archivos ignorados por .gitignore:
  no se expone listFiles ni se reimplementa el lenguaje de gitignore. Límite de 50.000 archivos
  (FKR-MAP-003); los hashes binarios delegan en `@foker/core.hashBytes` → Rust BLAKE3.
- Las escrituras de evento, registro y ancla son secuenciales bajo lock, no una transacción
  multiartefacto. Una interrupción entre ellas produce inconsistencia detectable por verifyLedger.
  Un ULID duplicado falla sin sobrescribir la tarea existente.

Los tests cubren toda la matriz de transiciones, 500 secuencias con semilla, evidencia,
aprobaciones, reintentos, idempotencia, concurrencia, lease, corrupción y baseline con/sin git.
