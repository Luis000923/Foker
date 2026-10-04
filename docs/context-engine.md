# Context Engine Rust

`foker_context::build_context(&MapState, root, &ContextRequest, &ContextInputs)`
implementa FOKER-SPEC §9 y ADR-006/007. TypeScript suministra reglas, skill,
alcance y archivos modificados; Rust no ejecuta git ni checks.

## Pipeline

- `normalize`: NFC y espacios de la tarea, candidatos léxicos y stopwords es/en
  versionadas (150 entradas por idioma). Las anclas reutilizan `foker_map::path`.
- `intent`: tabla versionada y desempate fijo.
- `bm25`: documentos de rutas y símbolos exportados, top 20 normalizado.
- `seeds` y `rank`: pesos normativos, required_context débil (0,5), PPR y razones.
  El grafo y el procedimiento numérico se comparten con el PageRank global de
  `foker-map`. El mapa construido ya aplica include y filtros de secretos.
- `select`: reserva anclas, degrada niveles, añade contornos y contabiliza tokens.
- `render`: delimitación de datos, tipos completos mediante rangos del mapa y
  lectura segura del disco, sin volver a parsear ni inventar declaraciones.
- `pack`: contratos Rust y JSON canónico snake_case.
- `cache`: LRU opcional de 64 entradas y métricas fuera del pack determinista.

## Decisiones de implementación

El coste incluye cabeceras, etiquetas y notas. `budget.used` suma los techos por
sección y puede superar ligeramente la estimación del texto concatenado; siempre
queda dentro del límite. Se reserva el 5 % para selección opcional, pero el
contenido obligatorio puede utilizarlo antes de fallar.

Todas las anclas resueltas reservan primero L1. Se intenta L3/L2 en orden de
ranking usando el espacio restante. Las anclas degradadas permanecen en
`targets`; si ni L1 cabe se devuelve `FKR-CTX-001` con desglose. `core` es opcional
y puede omitirse si el contexto obligatorio consume su espacio.

Los nombres de símbolo ambiguos usan `FKR-CTX-102` con un mensaje de ambigüedad y
reparten el peso entre declaraciones. No se incorpora un código nuevo al contrato.
Las razones se ordenan y deduplican. Un candidato alcanzado sin razón directa usa
`CORE` como razón del prior genérico. Un archivo presente también en el contorno
core conserva esa razón en sus metadatos y aparece una sola vez en `files`.

L0/L1/L2 usan un índice por construcción de exports del módulo y exports
resueltos, excluyendo miembros de namespaces. L0 deduplica nombres de
sobrecargas; L1/L2 conservan las firmas. L2 recupera interfaces, aliases y enums
exportados completos, también cuando se reexportan desde otro archivo. Si no
caben, la selección degrada a L1 sin recortar el texto. Las firmas L1 reutilizan las firmas acotadas del mapa. El texto
L3 conserva Unicode y normaliza únicamente CRLF a LF. Los delimitadores
`foker:file` literales dentro del contenido se escapan para impedir el cierre
prematuro de la región de datos. Las cabeceras escapan controles como secuencias
visibles y los caracteres `<`/`>` como entidades.

La caché pertenece al propietario del motor: no hay caché global ni estado
compartido implícito. Su clave incluye versión, hashes del mapa/configuración,
petición normalizada y todos los inputs efectivos. Duración, hit, tokens por
sección, archivos por nivel, utilización y semillas por fuente se devuelven como
`BuildMetrics`, sin timestamps en el JSON del pack.

## Verificación

Hay snapshots completos de tres tareas sobre `fixtures/monorepo-pnpm`, tests por
módulo, propiedades de presupuesto (1000–20000) y 50 ejecuciones idénticas,
incluidos 25 hilos. Los casos adicionales cubren reglas enormes, ambigüedad,
secciones static, tipos largos, degradación de anclas y exclusiones duras.

```sh
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo nextest run --workspace
```

Los snapshots son portables; ejecutar en Linux no certifica por sí solo los otros
dos sistemas operativos exigidos por REQ-CTX-001.

REQ-CTX-004 tiene un benchmark ignorado con el generador compartido large-10k,
mapa caliente y 20 construcciones sin caché del pack (p95 informativo, TARGET
< 300 ms):

```sh
cargo test --release -p foker-context --test perf_large -- --ignored --nocapture
```
