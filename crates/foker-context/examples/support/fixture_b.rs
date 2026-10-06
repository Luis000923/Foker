//! Evaluación offline de Fixture B (ADR-035): pack sin anclas, flujo `begin` (ADR-032), recall de
//! símbolos con anclas (ADR-033) y `gold_full` (ADR-034) por configuración fija. Solo mide: ningún
//! parámetro del motor se ajusta con estos datos.
//!
//! Requiere declarar antes `mod delivery` (support/delivery.rs) en la raíz del crate que lo incluye.
use crate::delivery::delivered_in_file;
use foker_context::{
    Anchors, ContextInputs, ContextPack, ContextParams, ContextRequest, PackFile, TaskScopeInput,
    build_context, render,
};
use foker_map::{
    build::{MapState, ParseCache, build},
    config::MapConfig,
    glob::match_globs,
};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    cmp::Ordering,
    collections::{BTreeMap, BTreeSet},
    path::Path,
    time::Instant,
};

pub type Error = Box<dyn std::error::Error>;

/// Presupuesto de todas las mediciones.
pub const BUDGET: usize = 8000;
/// Copia literal de `DEFAULT_POLICY.protected_paths` (packages/policy/src/policy.ts); un test de
/// vitest comprueba la paridad.
pub const DEFAULT_PROTECTED: [&str; 12] = [
    ".git/**",
    ".foker/**",
    "foker.config.yaml",
    "foker/rules.md",
    "foker/skills/**",
    "foker/roles/**",
    "foker/sync-manifest.json",
    ".claude/**",
    ".opencode/**",
    ".agents/**",
    "opencode.json",
    ".mcp.json",
];
/// Id fijo y checks del perfil default, como `flowPack` de ctx-gold.ts.
const FLOW_TASK_ID: &str = "tsk_00000000000000000000000000";
const FLOW_CHECKS: [&str; 4] = ["typecheck", "lint", "test", "secrets"];

/// Configuración evaluada: `params: None` es el motor actual sin parámetros.
#[derive(Deserialize)]
pub struct Config {
    pub name: String,
    pub params: Option<ContextParams>,
}

/// Lista fija de configuraciones (no se amplía con resultados de Fixture B).
pub fn configs() -> Vec<Config> {
    vec![
        Config {
            name: "default".into(),
            params: None,
        },
        Config {
            name: "sin_adr034".into(),
            params: Some(ContextParams {
                small_full_max_extra: 0,
                ..Default::default()
            }),
        },
        Config {
            name: "sin_adr033".into(),
            params: Some(ContextParams {
                focal_min_tokens: 0,
                ..Default::default()
            }),
        },
        Config {
            name: "plegado".into(),
            params: Some(ContextParams {
                inflection_folding: true,
                ..Default::default()
            }),
        },
    ]
}

/// Caso de benchmarks/fixture-b/ctx-gold/cases.jsonl.
#[derive(Deserialize)]
pub struct Case {
    pub id: String,
    #[serde(default)]
    pub repo: String,
    pub task: String,
    pub split: String,
    pub gold_modified: Vec<String>,
    #[serde(default)]
    pub gold_symbols: Vec<String>,
    #[serde(default)]
    pub anchors: Anchors,
}

/// Recall sobre gold_modified y precisión sobre el conjunto expuesto (0 si está vacío).
pub fn score(exposed: &[String], gold: &[String]) -> (f64, f64) {
    let pack: BTreeSet<&String> = exposed.iter().collect();
    let gold_set: BTreeSet<&String> = gold.iter().collect();
    let hits = gold_set.iter().filter(|g| pack.contains(*g)).count();
    let relevant = pack.iter().filter(|p| gold_set.contains(*p)).count();
    let recall = hits as f64 / gold_set.len() as f64;
    let precision = if pack.is_empty() {
        0.0
    } else {
        relevant as f64 / pack.len() as f64
    };
    (recall, precision)
}

/// Archivos L1–L3 del pack.
pub fn exposed(pack: &ContextPack) -> Vec<String> {
    pack.files
        .iter()
        .filter(|f| f.level.as_str() != "L0")
        .map(|f| f.id.clone())
        .collect()
}

fn decode_attribute(value: &str) -> String {
    value
        .replace("&quot;", "\"")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&amp;", "&")
}

/// Solo la cabecera diagnóstica exacta de explain (`### <id>  [`), como `stripDiagnostic`.
fn strip_diagnostic(body: &str, id: &str) -> String {
    if body.starts_with(&format!("### {id}  [")) {
        // indexOf('\n') = -1 deja el cuerpo entero (slice(0)).
        match body.find('\n') {
            Some(i) => body[i + 1..].to_owned(),
            None => body.to_owned(),
        }
    } else {
        body.to_owned()
    }
}

/// Port exacto de `fileBodies` (benchmarks/src/ctx-gold.ts): bloques individuales L2/L3 y
/// entradas del envoltorio L2 agrupado (ruta sin indentar + líneas indentadas dos espacios).
pub fn file_bodies(rendered: &str) -> BTreeMap<String, Vec<String>> {
    let mut bodies: BTreeMap<String, Vec<String>> = BTreeMap::new();
    let open = "<foker:file id=\"";
    let close = "\n</foker:file>\n";
    let mut pos = 0;
    while let Some(offset) = rendered[pos..].find(open) {
        let start = pos + offset;
        let after = start + open.len();
        if let Some(quote) = rendered[after..].find('"') {
            let id = &rendered[after..after + quote];
            let rest = &rendered[after + quote..];
            let header = ["L2", "L3"]
                .iter()
                .map(|l| format!("\" level=\"{l}\" trust=\"repository-content\">\n"))
                .find(|h| rest.starts_with(h.as_str()));
            if let Some(header) = header {
                let body_start = after + quote + header.len();
                if let Some(end) = rendered[body_start..].find(close) {
                    let id = decode_attribute(id);
                    let body = strip_diagnostic(&rendered[body_start..body_start + end], &id);
                    bodies.entry(id).or_default().push(body);
                    pos = body_start + end + close.len();
                    continue;
                }
            }
        }
        pos = start + 1;
    }
    let open = "<foker:files level=\"L2\" trust=\"repository-content\">\n";
    let close = "</foker:files>\n";
    let mut pos = 0;
    while let Some(offset) = rendered[pos..].find(open) {
        let body_start = pos + offset + open.len();
        let Some(end) = rendered[body_start..].find(close) else {
            break;
        };
        let inner = &rendered[body_start..body_start + end];
        let inner = inner.strip_suffix('\n').unwrap_or(inner);
        let mut id: Option<String> = None;
        let mut lines: Vec<&str> = Vec::new();
        let mut flush = |id: &Option<String>, lines: &[&str]| {
            if let Some(id) = id {
                let body = strip_diagnostic(&lines.join("\n"), id);
                bodies.entry(id.clone()).or_default().push(body);
            }
        };
        for line in inner.split('\n') {
            if let Some(rest) = line.strip_prefix("  ") {
                lines.push(rest);
            } else {
                flush(&id, &lines);
                id = Some(line.to_owned());
                lines.clear();
            }
        }
        flush(&id, &lines);
        pos = body_start + end + close.len();
    }
    bodies
}

/// ADR-034: fracción de gold cuyo contenido completo llega en el bloque de su propio archivo.
pub fn gold_full(rendered: &str, root: &Path, gold: &[String]) -> f64 {
    let bodies = file_bodies(rendered);
    let full = gold
        .iter()
        .filter(|id| {
            let Ok(bytes) = std::fs::read(root.join(id)) else {
                return false;
            };
            let content = String::from_utf8_lossy(&bytes).replace("\r\n", "\n");
            let escaped = render::data(&content);
            bodies.get(*id).is_some_and(|b| b.contains(&escaped))
        })
        .count();
    full as f64 / gold.len() as f64
}

/// Puntuación descendente, id ascendente en empate (`rankPackFiles`).
fn rank(files: Vec<&PackFile>) -> Vec<&PackFile> {
    let mut files = files;
    files.sort_by(|a, b| {
        b.score
            .partial_cmp(&a.score)
            .unwrap_or(Ordering::Equal)
            .then_with(|| a.id.cmp(&b.id))
    });
    files
}

fn direct_signal(file: &PackFile) -> bool {
    file.reasons.iter().any(|r| {
        ["ANCHOR", "PATH_MENTION", "SYMBOL_MENTION", "LEXICAL:"]
            .iter()
            .any(|p| r.starts_with(p))
    })
}

/// Directorio de un archivo como glob; un archivo de la raíz se acota a sí mismo (`directoryScope`).
pub fn directory_scope(file: &str) -> String {
    match file.rsplit_once('/') {
        Some((dir, _)) => format!("{dir}/**"),
        None => file.to_owned(),
    }
}

/// Port de `deriveScopePaths`: L3 si hay; si no, tres L1/L2 con señal directa y luego L2 del grafo (D5).
/// Añade hasta dos paquetes no raíz nombrados en la descripción (ADR-038 D6).
pub fn derive_scope_paths(
    files: &[PackFile],
    task: &str,
    packages: &[foker_map::model::MapPackage],
) -> Vec<String> {
    let targets: Vec<&PackFile> = files.iter().filter(|f| f.level.as_str() == "L3").collect();
    let chosen = if targets.is_empty() {
        let candidates: Vec<&PackFile> = files
            .iter()
            .filter(|f| matches!(f.level.as_str(), "L1" | "L2"))
            .collect();
        let mut ordered = rank(
            candidates
                .iter()
                .copied()
                .filter(|f| direct_signal(f))
                .collect(),
        );
        ordered.extend(rank(
            candidates
                .iter()
                .copied()
                .filter(|f| f.level.as_str() == "L2" && !direct_signal(f))
                .collect(),
        ));
        ordered.truncate(3);
        ordered
    } else {
        targets
    };
    let mut paths: BTreeSet<_> = chosen.iter().map(|f| directory_scope(&f.id)).collect();
    let named: Vec<_> = packages
        .iter()
        .filter(|p| {
            let package_char = |c: char| c.is_ascii_alphanumeric() || "@/._-".contains(c);
            p.path != "."
                && !p.name.is_empty()
                && task.match_indices(&p.name).any(|(start, _)| {
                    !task[..start].chars().next_back().is_some_and(package_char)
                        && !task[start + p.name.len()..]
                            .chars()
                            .next()
                            .is_some_and(package_char)
                })
        })
        .collect();
    if named.len() <= 2 {
        paths.extend(named.iter().map(|p| format!("{}/**", p.path)));
    }
    paths.into_iter().collect()
}

fn literal_prefix(glob: &str) -> &str {
    glob.split(['?', '*', '{', '[']).next().unwrap_or("")
}

/// `glob.replace(/\*\*|\*|\?/g,'x').replace(/\{([^}]+)\}/g, primera opción).replace(/\[[^\]]+\]/g,'x')`.
fn representative(glob: &str) -> String {
    let mut stars = String::new();
    let mut chars = glob.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '*' => {
                if chars.peek() == Some(&'*') {
                    chars.next();
                }
                stars.push('x');
            }
            '?' => stars.push('x'),
            c => stars.push(c),
        }
    }
    let braces = replace_group(&stars, '{', '}', |inner| {
        inner.split(',').next().unwrap_or("").to_owned()
    });
    replace_group(&braces, '[', ']', |_| "x".to_owned())
}

/// Sustituye cada `open[^close]+close` (no solapado, de izquierda a derecha).
fn replace_group(text: &str, open: char, close: char, f: impl Fn(&str) -> String) -> String {
    let mut out = String::new();
    let mut rest = text;
    while let Some(i) = rest.find(open) {
        let after = &rest[i + open.len_utf8()..];
        match after.find(close) {
            Some(j) if j > 0 => {
                out.push_str(&rest[..i]);
                out.push_str(&f(&after[..j]));
                rest = &after[j + close.len_utf8()..];
            }
            _ => {
                out.push_str(&rest[..i + open.len_utf8()]);
                rest = after;
            }
        }
    }
    out.push_str(rest);
    out
}

/// Port de `protectedPathsInScope` (packages/engine/src/scope.ts).
pub fn protected_paths_in_scope(
    scope: &[String],
    protected: &[&str],
    files: &[String],
) -> Result<Vec<String>, foker_map::glob::GlobError> {
    let mut paths = BTreeSet::new();
    for file in files {
        if match_globs(file, scope)? && match_globs(file, protected)? {
            paths.insert(file.clone());
        }
    }
    for protected_glob in protected {
        for glob in scope {
            let prefixes = [literal_prefix(glob), literal_prefix(protected_glob)];
            if (!prefixes[0].is_empty() && match_globs(prefixes[0], &[protected_glob])?)
                || (!prefixes[1].is_empty() && match_globs(prefixes[1], &[glob])?)
                || match_globs(&representative(protected_glob), &[glob])?
                || match_globs(&representative(glob), &[protected_glob])?
            {
                paths.insert((*protected_glob).to_owned());
            }
        }
    }
    Ok(paths.into_iter().collect())
}

fn error_code(error: &impl ToString) -> String {
    let text = error.to_string();
    text.split(':').next().unwrap_or(&text).to_owned()
}

/// Registro optativo de packs canónicos, sin tiempos; no escribe en los árboles.
fn dump_pack(pack: &ContextPack) {
    if let Ok(path) = std::env::var("FOKER_EVAL_PACK_DUMP") {
        use std::io::Write;
        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)
            .expect("dump de packs");
        writeln!(file, "{}", pack.to_canonical_json()).expect("escribir dump");
    }
}

/// Incluye también los errores íntegros del motor en la comparación byte a byte.
fn dump_error(error: &impl ToString) {
    if let Ok(path) = std::env::var("FOKER_EVAL_PACK_DUMP") {
        use std::io::Write;
        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)
            .expect("dump de errores");
        writeln!(file, "{}", json!({"error": error.to_string()})).expect("escribir error");
    }
}

fn ms(start: Instant) -> f64 {
    (start.elapsed().as_secs_f64() * 1e6).round() / 1e3
}

/// Flujo `begin` sin scope (ADR-032): alcance derivado del pack preliminar, validación contra la
/// política protegida por defecto y pack definitivo con task_scope.
pub fn flow(
    state: &MapState,
    root: &Path,
    request: &ContextRequest,
    preliminary: &ContextPack,
    case: &Case,
    map_files: &[String],
) -> Value {
    let scope = derive_scope_paths(&preliminary.files, &request.task, &state.map.packages);
    let failed = |error: &str, scope_error: bool, scope_coverage: f64| {
        json!({
            "scope": scope, "scope_error": scope_error, "error": error,
            "scope_coverage": scope_coverage, "recall": 0.0, "precision": 0.0,
            "gold_full": 0.0, "tokens": 0, "exposed": [],
        })
    };
    if scope.is_empty() {
        return failed("FKR-INP-001", true, 0.0);
    }
    match protected_paths_in_scope(&scope, &DEFAULT_PROTECTED, map_files) {
        Err(_) => return failed("FKR-INP-001", true, 0.0),
        Ok(hits) if !hits.is_empty() => return failed("FKR-POL-002", true, 0.0),
        Ok(_) => {}
    }
    let mut covered = 0;
    for id in &case.gold_modified {
        if match_globs(id, &scope).unwrap_or(false) {
            covered += 1;
        }
    }
    let scope_coverage = covered as f64 / case.gold_modified.len() as f64;
    let inputs = ContextInputs {
        task_scope: Some(TaskScopeInput {
            task_id: FLOW_TASK_ID.into(),
            description: request.task.clone(),
            paths: scope.clone(),
            checks: FLOW_CHECKS.iter().map(|c| (*c).to_owned()).collect(),
        }),
        ..Default::default()
    };
    let start = Instant::now();
    match build_context(state, root, request, &inputs) {
        Err(error) => {
            dump_error(&error);
            failed(&error_code(&error), false, scope_coverage)
        }
        Ok(pack) => {
            dump_pack(&pack);
            let build_ms = ms(start);
            let exposed = exposed(&pack);
            let (recall, precision) = score(&exposed, &case.gold_modified);
            json!({
                "scope": scope, "scope_error": false, "error": Value::Null,
                "scope_coverage": scope_coverage, "recall": recall, "precision": precision,
                "gold_full": gold_full(&pack.rendered, root, &case.gold_modified),
                "tokens": pack.budget.used, "exposed": exposed, "build_ms": build_ms,
            })
        }
    }
}

/// Texto completo de cada gold_symbol en el árbol de B (líneas del rango, escape de rendered).
pub fn gold_texts(
    state: &MapState,
    root: &Path,
    case: &Case,
) -> Result<Vec<(String, String)>, Error> {
    let mut texts = Vec::new();
    for id in &case.gold_symbols {
        let symbol = state
            .map
            .symbols
            .iter()
            .find(|s| &s.id == id)
            .ok_or_else(|| format!("{}: gold_symbol ausente del mapa: {id}", case.id))?;
        let source = std::fs::read_to_string(root.join(symbol.file()))?.replace("\r\n", "\n");
        let lines: Vec<_> = source.split('\n').collect();
        let text =
            lines[symbol.range.start.line as usize..=symbol.range.end.line as usize].join("\n");
        texts.push((symbol.file().to_owned(), render::data(&text)));
    }
    Ok(texts)
}

/// Pack sin anclas + flujo + símbolos con anclas = gold_modified para una configuración.
pub fn evaluate_config(
    state: &MapState,
    root: &Path,
    case: &Case,
    config: &Config,
    texts: &[(String, String)],
    map_files: &[String],
) -> Value {
    let request = ContextRequest {
        task: case.task.clone(),
        anchors: case.anchors.clone(),
        budget_tokens: BUDGET,
        params: config.params.clone(),
        ..Default::default()
    };
    let start = Instant::now();
    let (pack, flow) = match build_context(state, root, &request, &ContextInputs::default()) {
        Ok(pack) => {
            dump_pack(&pack);
            let build_ms = ms(start);
            let exposed = exposed(&pack);
            let (recall, precision) = score(&exposed, &case.gold_modified);
            let flow = flow(state, root, &request, &pack, case, map_files);
            (
                json!({
                    "error": Value::Null, "recall": recall, "precision": precision,
                    "gold_full": gold_full(&pack.rendered, root, &case.gold_modified),
                    "tokens": pack.budget.used, "exposed": exposed, "build_ms": build_ms,
                }),
                flow,
            )
        }
        Err(error) => {
            dump_error(&error);
            let code = error_code(&error);
            (
                json!({"error": code, "recall": 0.0, "precision": 0.0, "gold_full": 0.0}),
                json!({"scope": [], "error": format!("preliminar: {code}"), "scope_error": false,
                       "scope_coverage": 0.0, "recall": 0.0, "precision": 0.0, "gold_full": 0.0,
                       "tokens": 0, "exposed": []}),
            )
        }
    };
    let anchored = ContextRequest {
        anchors: Anchors {
            files: case.gold_modified.clone(),
            symbols: vec![],
        },
        ..request.clone()
    };
    let symbols = match build_context(state, root, &anchored, &ContextInputs::default()) {
        Ok(pack) => {
            dump_pack(&pack);
            let delivered = texts
                .iter()
                .filter(|(file, text)| {
                    let level = pack
                        .files
                        .iter()
                        .find(|f| f.id == *file)
                        .map(|f| f.level.as_str());
                    delivered_in_file(&pack.rendered, file, level, text)
                })
                .count();
            let anchor_tokens: usize = pack
                .files
                .iter()
                .filter(|f| case.gold_modified.contains(&f.id))
                .map(|f| f.tokens)
                .sum();
            json!({
                "error": Value::Null,
                "symbol_recall": if texts.is_empty() { Value::Null } else { json!(delivered as f64 / texts.len() as f64) },
                "gold_symbols": texts.len(), "delivered": delivered,
                "anchor_tokens": anchor_tokens, "tokens": pack.budget.used,
            })
        }
        Err(error) => {
            dump_error(&error);
            json!({
                "error": error_code(&error),
                "symbol_recall": if texts.is_empty() { Value::Null } else { json!(0.0) },
                "gold_symbols": texts.len(), "delivered": 0,
            })
        }
    };
    json!({"pack": pack, "flow": flow, "symbols": symbols})
}

fn mean(values: &[f64]) -> Value {
    if values.is_empty() {
        Value::Null
    } else {
        json!(values.iter().sum::<f64>() / values.len() as f64)
    }
}

fn median(values: &[f64]) -> Value {
    if values.is_empty() {
        return Value::Null;
    }
    let mut ordered = values.to_vec();
    ordered.sort_by(|a, b| a.partial_cmp(b).unwrap_or(Ordering::Equal));
    let mid = ordered.len() / 2;
    json!(if ordered.len() % 2 == 1 {
        ordered[mid]
    } else {
        (ordered[mid - 1] + ordered[mid]) / 2.0
    })
}

fn column(rows: &[&Value], path: &[&str]) -> Vec<f64> {
    rows.iter()
        .filter_map(|row| path.iter().try_fold(*row, |v, k| v.get(*k)))
        .filter_map(Value::as_f64)
        .collect()
}

fn count_errors(rows: &[&Value], part: &str) -> usize {
    rows.iter()
        .filter(|r| r[part]["error"].is_string() && r[part]["scope_error"] != json!(true))
        .count()
}

/// Medias macro por caso; los errores cuentan 0 en recall/precisión/gold_full y no aportan tokens.
pub fn summarize(rows: &[&Value]) -> Value {
    json!({
        "cases": rows.len(),
        "pack": {
            "recall": mean(&column(rows, &["pack", "recall"])),
            "precision": mean(&column(rows, &["pack", "precision"])),
            "gold_full": mean(&column(rows, &["pack", "gold_full"])),
            "median_tokens": median(&column(rows, &["pack", "tokens"])),
            "mean_tokens": mean(&column(rows, &["pack", "tokens"])),
            "median_build_ms": median(&column(rows, &["pack", "build_ms"])),
            "mean_build_ms": mean(&column(rows, &["pack", "build_ms"])),
            "errors": count_errors(rows, "pack"),
        },
        "flow": {
            "recall": mean(&column(rows, &["flow", "recall"])),
            "precision": mean(&column(rows, &["flow", "precision"])),
            "gold_full": mean(&column(rows, &["flow", "gold_full"])),
            "scope_coverage": mean(&column(rows, &["flow", "scope_coverage"])),
            "median_tokens": median(&column(rows, &["flow", "tokens"])),
            "mean_tokens": mean(&column(rows, &["flow", "tokens"])),
            "scope_errors": rows.iter().filter(|r| r["flow"]["scope_error"] == json!(true)).count(),
            "context_errors": count_errors(rows, "flow"),
        },
        "symbols": {
            "recall": mean(&column(rows, &["symbols", "symbol_recall"])),
            "cases_with_gold": column(rows, &["symbols", "symbol_recall"]).len(),
            "median_anchor_tokens": median(&column(rows, &["symbols", "anchor_tokens"])),
            "mean_anchor_tokens": mean(&column(rows, &["symbols", "anchor_tokens"])),
            "median_tokens": median(&column(rows, &["symbols", "tokens"])),
            "errors": count_errors(rows, "symbols"),
        },
    })
}

/// Evalúa todos los casos; cada árbol es `<trees>/<id>` (salida de ctx-gold.mjs).
pub fn evaluate(cases: &str, trees: &Path) -> Result<Value, Error> {
    evaluate_with_configs(cases, trees, &[], None)
}

/// Configuraciones adicionales y filtro antes de acceder a los árboles; defaults intactos.
pub fn evaluate_with_configs(
    cases: &str,
    trees: &Path,
    extra: &[Config],
    split: Option<&str>,
) -> Result<Value, Error> {
    let mut configs = configs();
    let mut names: BTreeSet<String> = configs.iter().map(|c| c.name.clone()).collect();
    for config in extra {
        if !names.insert(config.name.clone()) {
            return Err("configuración duplicada".into());
        }
        if let Some(params) = &config.params {
            params.validate()?;
        }
        configs.push(Config {
            name: config.name.clone(),
            params: config.params.clone(),
        });
    }
    let mut out_cases = Vec::new();
    // Filas planas (caso × configuración) para el resumen.
    let mut flat: Vec<(String, String, Value)> = Vec::new();
    for line in cases.lines().filter(|l| !l.trim().is_empty()) {
        let case: Case = serde_json::from_str(line)?;
        if split.is_some_and(|split| split != case.split) {
            continue;
        }
        if std::env::var_os("FOKER_EVAL_PROGRESS").is_some() {
            eprintln!("evaluando {}", case.id);
        }
        let root = trees.join(&case.id);
        let start = Instant::now();
        let state = build(&root, &MapConfig::default(), &mut ParseCache::new())?;
        let map_ms = ms(start);
        let map_files: Vec<String> = state.map.files.iter().map(|f| f.id.clone()).collect();
        let texts = gold_texts(&state, &root, &case)?;
        let mut results = serde_json::Map::new();
        for config in &configs {
            let result = evaluate_config(&state, &root, &case, config, &texts, &map_files);
            flat.push((config.name.clone(), case.split.clone(), result.clone()));
            results.insert(config.name.clone(), result);
        }
        out_cases.push(json!({
            "id": case.id, "repo": case.repo, "split": case.split,
            "gold_modified": case.gold_modified, "map_ms": map_ms,
            "map_files": map_files.len(), "configs": results,
        }));
    }
    let mut summary = serde_json::Map::new();
    for config in &configs {
        let mut per_split = serde_json::Map::new();
        for split in ["all", "calibration", "validation"] {
            let rows: Vec<&Value> = flat
                .iter()
                .filter(|(c, s, _)| c == &config.name && (split == "all" || s == split))
                .map(|(_, _, v)| v)
                .collect();
            per_split.insert(split.into(), summarize(&rows));
        }
        summary.insert(config.name.clone(), Value::Object(per_split));
    }
    let map_ms: Vec<f64> = out_cases
        .iter()
        .filter_map(|c| c["map_ms"].as_f64())
        .collect();
    Ok(json!({
        "budget": BUDGET,
        "configs": configs.iter().map(|c| &c.name).collect::<Vec<_>>(),
        "map": {"trees": map_ms.len(), "median_ms": median(&map_ms), "mean_ms": mean(&map_ms)},
        "summary": summary,
        "cases": out_cases,
    }))
}
