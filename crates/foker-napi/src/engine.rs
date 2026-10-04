//! `FokerEngine`: binding del motor del Project Map. Solo convierte tipos y delega en `foker-map`.

use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use foker_map::FokerCode;
use foker_map::config::{KindGlobs, MapConfig};
use foker_map::engine::{EngineError, MapEngine, OpenMode};
use foker_map::model::MapDiagnostic;
use foker_map::path::normalize_lexical;
use foker_map::query::{self, Direction, SearchKind};
use napi_derive::napi;

use crate::{NativeResult, guard};

fn engine_error(error: &EngineError) -> napi::Error<FokerCode> {
    napi::Error::new(error.code(), error.to_string())
}

fn input_error(message: impl Into<String>) -> napi::Error<FokerCode> {
    napi::Error::new(FokerCode::Inp001, message.into())
}

fn internal(message: impl Into<String>) -> napi::Error<FokerCode> {
    napi::Error::new(FokerCode::Int001, message.into())
}

/// Globs que clasifican archivos. Los omitidos toman el valor por defecto.
#[napi(object)]
pub struct KindGlobsConfig {
    /// Tests.
    pub test: Option<Vec<String>>,
    /// Declaraciones.
    pub declaration: Option<Vec<String>>,
    /// Configuración.
    pub config: Option<Vec<String>>,
    /// Generados.
    pub generated: Option<Vec<String>>,
}

/// Configuración del motor (sección `map` efectiva + globs de secretos de la política).
#[napi(object)]
pub struct EngineConfig {
    /// Solo lee el disco: no aparta mapas corruptos ni guarda mapa o caché; save falla.
    pub read_only: Option<bool>,
    /// Globs incluidos (vacío = todo).
    pub include: Option<Vec<String>>,
    /// Globs excluidos.
    pub exclude: Option<Vec<String>>,
    /// tsconfig usados en la resolución.
    pub tsconfig: Option<Vec<String>>,
    /// Globs de secretos: nunca se leen.
    pub secret_globs: Option<Vec<String>>,
    /// Tamaño máximo de archivo parseado.
    pub max_file_bytes: Option<f64>,
    /// Número máximo de archivos fuente.
    pub max_files: Option<u32>,
    /// Clasificación de archivos.
    pub kinds: Option<KindGlobsConfig>,
}

fn to_map_config(config: Option<EngineConfig>) -> NativeResult<MapConfig> {
    let mut out = MapConfig::default();
    let Some(config) = config else {
        return Ok(out);
    };
    if let Some(v) = config.include {
        out.include = v;
    }
    if let Some(v) = config.exclude {
        out.exclude = v;
    }
    if let Some(v) = config.tsconfig {
        out.tsconfig = v;
    }
    if let Some(v) = config.secret_globs {
        out.secret_globs = v;
    }
    if let Some(v) = config.max_file_bytes {
        if !(v.is_finite() && (1.0..=9_007_199_254_740_991.0).contains(&v)) {
            return Err(input_error("maxFileBytes inválido"));
        }
        out.max_file_bytes = v as u64;
    }
    if let Some(v) = config.max_files {
        out.max_files = v as usize;
    }
    if let Some(kinds) = config.kinds {
        let defaults = KindGlobs::defaults();
        out.kinds = KindGlobs {
            test: kinds.test.unwrap_or(defaults.test),
            declaration: kinds.declaration.unwrap_or(defaults.declaration),
            config: kinds.config.unwrap_or(defaults.config),
            generated: kinds.generated.unwrap_or(defaults.generated),
        };
    }
    Ok(out)
}

/// Diagnóstico (código `FKR-…1xx`).
#[napi(object)]
pub struct Diagnostic {
    /// Código.
    pub code: String,
    /// Mensaje.
    pub message: String,
    /// Archivo.
    pub file: Option<String>,
    /// Sujeto (especificador, ancla…).
    pub subject: Option<String>,
}

fn diagnostic(d: &MapDiagnostic) -> Diagnostic {
    Diagnostic {
        code: d.code.clone(),
        message: d.message.clone(),
        file: d.file.clone(),
        subject: d.subject.clone(),
    }
}

/// Opciones de `refresh`.
#[napi(object)]
pub struct RefreshOptions {
    /// Reconstrucción completa.
    pub full: Option<bool>,
}

/// Resultado de `refresh`.
#[napi(object)]
pub struct RefreshReport {
    /// Archivos nuevos.
    pub added: Vec<String>,
    /// Archivos modificados.
    pub changed: Vec<String>,
    /// Archivos eliminados.
    pub removed: Vec<String>,
    /// Diagnósticos nuevos.
    pub diagnostics: Vec<Diagnostic>,
    /// Duración.
    pub duration_ms: f64,
    /// `content_hash` resultante.
    pub content_hash: String,
    /// Hubo reconstrucción completa.
    pub rebuilt: bool,
    /// No había cambios.
    pub unchanged: bool,
}

/// Estado del mapa.
#[napi(object)]
pub struct MapStatus {
    /// `content_hash` (vacío si aún no hay mapa).
    pub content_hash: String,
    /// Archivos.
    pub files: u32,
    /// Símbolos.
    pub symbols: u32,
    /// Archivos desactualizados en la última comprobación.
    pub stale_files: u32,
    /// `schema_version`.
    pub schema_version: u32,
}

/// Resultado de `save`.
#[napi(object)]
pub struct SaveReport {
    /// `.foker/project-map.json`.
    pub path: String,
    /// Bytes.
    pub bytes: f64,
    /// `content_hash`.
    pub content_hash: String,
}

/// Consulta de búsqueda.
#[napi(object)]
pub struct SearchQuery {
    /// Texto (1–200 caracteres).
    pub query: String,
    /// `file`, `symbol` o `any` (por defecto).
    pub kind: Option<String>,
    /// 1–50 (por defecto 20).
    pub limit: Option<u32>,
}

/// Resultado de búsqueda.
#[napi(object)]
pub struct SearchHit {
    /// Id.
    pub id: String,
    /// `file` o `symbol`.
    pub kind: String,
    /// Nombre.
    pub name: String,
    /// Archivo.
    pub file: String,
    /// Firma (símbolos).
    pub signature: Option<String>,
    /// Puntuación en [0, 1].
    pub score: f64,
}

/// Posición base 0.
#[napi(object)]
pub struct Position {
    /// Línea.
    pub line: u32,
    /// Columna en bytes.
    pub col: u32,
}

/// Rango.
#[napi(object)]
pub struct Range {
    /// Inicio.
    pub start: Position,
    /// Fin.
    pub end: Position,
}

/// Información de un símbolo.
#[napi(object)]
pub struct SymbolInfo {
    /// Id.
    pub id: String,
    /// Nombre.
    pub name: String,
    /// Tipo.
    pub kind: String,
    /// Etiquetas.
    pub tags: Vec<String>,
    /// Exportación.
    pub exported: String,
    /// Firma.
    pub signature: String,
    /// JSDoc.
    pub doc: Option<String>,
    /// Rango.
    pub range: Range,
    /// Contenedor.
    pub parent: Option<String>,
    /// Archivo.
    pub file: String,
}

/// Información de un archivo.
#[napi(object)]
pub struct FileInfo {
    /// Id.
    pub id: String,
    /// Paquete.
    pub package: Option<String>,
    /// Lenguaje.
    pub language: String,
    /// Tipo.
    pub kind: String,
    /// Hash.
    pub hash: String,
    /// Tamaño.
    pub size_bytes: f64,
    /// Líneas.
    pub lines: u32,
    /// Estado del parseo.
    pub parse_status: String,
    /// PageRank global.
    pub rank_global: f64,
    /// Símbolos exportados.
    pub exports: Vec<String>,
    /// Archivos que importa.
    pub imports: Vec<String>,
    /// Archivos que lo importan.
    pub imported_by: Vec<String>,
    /// Símbolos declarados.
    pub symbols: Vec<String>,
}

/// Petición de impacto.
#[napi(object)]
pub struct ImpactRequest {
    /// Archivos (≤ 20).
    pub files: Option<Vec<String>>,
    /// Símbolos (≤ 20).
    pub symbols: Option<Vec<String>>,
    /// `dependents` (por defecto), `dependencies` o `both`.
    pub direction: Option<String>,
    /// 1–3 (por defecto 2).
    pub depth: Option<u32>,
}

/// Nodo alcanzado.
#[napi(object)]
pub struct ImpactNode {
    /// Id.
    pub id: String,
    /// Distancia.
    pub distance: u32,
    /// Arista de llegada.
    pub via: Option<String>,
    /// `file` o `symbol`.
    pub kind: String,
}

/// Informe de impacto.
#[napi(object)]
pub struct ImpactReport {
    /// Nodos por distancia e id.
    pub nodes: Vec<ImpactNode>,
    /// Paquetes afectados.
    pub packages: Vec<String>,
    /// Tests afectados.
    pub tests: Vec<String>,
    /// Orígenes desconocidos.
    pub diagnostics: Vec<Diagnostic>,
}

/// Contrato de contexto: ContextAnchors.
#[napi(object)]
pub struct ContextAnchors {
    /// Campo files.
    pub files: Option<Vec<String>>,
    /// Campo symbols.
    pub symbols: Option<Vec<String>>,
}

/// Contrato de contexto: ContextSkill.
#[napi(object)]
pub struct ContextSkill {
    /// Campo name.
    pub name: String,
    /// Campo body.
    pub body: String,
    /// Campo required_files.
    pub required_files: Vec<String>,
    /// Campo required_symbols.
    pub required_symbols: Vec<String>,
}

/// Contrato de contexto: ContextTaskScope.
#[napi(object)]
pub struct ContextTaskScope {
    /// Campo task_id.
    pub task_id: String,
    /// Campo description.
    pub description: String,
    /// Campo paths.
    pub paths: Vec<String>,
    /// Campo checks.
    pub checks: Vec<String>,
}

/// Parámetros internos de calibración (sin CLI/MCP).
#[napi(object)]
pub struct ContextParams {
    /// Interno: expansión léxica es/en v1.
    pub lexical_expansion: Option<bool>,
    /// Interno: corte relativo BM25.
    pub bm25_min_relative: Option<f64>,
    /// Interno: corte relativo del ranking opcional.
    pub relevance_fraction: Option<f64>,
    /// Interno: w_anchor.
    pub w_anchor: Option<f64>,
    /// Interno: mention_factor.
    pub mention_factor: Option<f64>,
    /// Interno: w_lex.
    pub w_lex: Option<f64>,
    /// Interno: bm25_top.
    pub bm25_top: Option<f64>,
    /// Interno: w_dirty.
    pub w_dirty: Option<f64>,
    /// Interno: w_task_scope.
    pub w_task_scope: Option<f64>,
    /// Interno: w_skill.
    pub w_skill: Option<f64>,
    /// Interno: r_fix.
    pub r_fix: Option<f64>,
    /// Interno: r_modify.
    pub r_modify: Option<f64>,
    /// Interno: r_test.
    pub r_test: Option<f64>,
    /// Interno: r_refactor.
    pub r_refactor: Option<f64>,
    /// Interno: r_add.
    pub r_add: Option<f64>,
    /// Interno: r_explain.
    pub r_explain: Option<f64>,
    /// Interno: test_factor.
    pub test_factor: Option<f64>,
    /// Interno: l2_count.
    pub l2_count: Option<f64>,
    /// Interno: anchor_fraction.
    pub anchor_fraction: Option<f64>,
    /// Interno: margin_fraction.
    pub margin_fraction: Option<f64>,
    /// Interno: l0_count.
    pub l0_count: Option<f64>,
    /// Interno: l0_min_fraction.
    pub l0_min_fraction: Option<f64>,
    /// Interno: core_files.
    pub core_files: Option<f64>,
    /// Interno: core_fraction.
    pub core_fraction: Option<f64>,
    /// Interno: bm25_k1.
    pub bm25_k1: Option<f64>,
    /// Interno: bm25_b.
    pub bm25_b: Option<f64>,
}
impl TryFrom<ContextParams> for foker_context::ContextParams {
    type Error = foker_context::ContextError;
    fn try_from(value: ContextParams) -> Result<Self, Self::Error> {
        let defaults = Self::default();
        Self {
            lexical_expansion: value
                .lexical_expansion
                .unwrap_or(defaults.lexical_expansion),
            bm25_min_relative: value
                .bm25_min_relative
                .unwrap_or(defaults.bm25_min_relative),
            relevance_fraction: value
                .relevance_fraction
                .unwrap_or(defaults.relevance_fraction),
            w_anchor: value.w_anchor.unwrap_or(defaults.w_anchor),
            mention_factor: value.mention_factor.unwrap_or(defaults.mention_factor),
            w_lex: value.w_lex.unwrap_or(defaults.w_lex),
            w_dirty: value.w_dirty.unwrap_or(defaults.w_dirty),
            w_task_scope: value.w_task_scope.unwrap_or(defaults.w_task_scope),
            w_skill: value.w_skill.unwrap_or(defaults.w_skill),
            r_fix: value.r_fix.unwrap_or(defaults.r_fix),
            r_modify: value.r_modify.unwrap_or(defaults.r_modify),
            r_test: value.r_test.unwrap_or(defaults.r_test),
            r_refactor: value.r_refactor.unwrap_or(defaults.r_refactor),
            r_add: value.r_add.unwrap_or(defaults.r_add),
            r_explain: value.r_explain.unwrap_or(defaults.r_explain),
            test_factor: value.test_factor.unwrap_or(defaults.test_factor),
            anchor_fraction: value.anchor_fraction.unwrap_or(defaults.anchor_fraction),
            margin_fraction: value.margin_fraction.unwrap_or(defaults.margin_fraction),
            l0_min_fraction: value.l0_min_fraction.unwrap_or(defaults.l0_min_fraction),
            core_fraction: value.core_fraction.unwrap_or(defaults.core_fraction),
            bm25_k1: value.bm25_k1.unwrap_or(defaults.bm25_k1),
            bm25_b: value.bm25_b.unwrap_or(defaults.bm25_b),
            ..defaults
        }
        .with_counts([
            value.bm25_top,
            value.l2_count,
            value.l0_count,
            value.core_files,
        ])
    }
}

/// Contrato de contexto: ContextRequest.
#[napi(object)]
pub struct ContextRequest {
    /// Campo task.
    pub task: String,
    /// Campo anchors.
    pub anchors: Option<ContextAnchors>,
    /// Campo intent.
    #[napi(ts_type = "'fix' | 'add' | 'modify' | 'refactor' | 'test' | 'explain'")]
    pub intent: Option<String>,
    /// Campo budget_tokens.
    pub budget_tokens: Option<u32>,
    /// Interno: calibración; no se expone en CLI/MCP.
    pub params: Option<ContextParams>,
    /// Número máximo de archivos core; por defecto 15.
    pub core_files: Option<u32>,
    /// Campo explain.
    pub explain: Option<bool>,
    /// Campo rules.
    pub rules: Option<String>,
    /// Campo skill.
    pub skill: Option<ContextSkill>,
    /// Campo task_scope.
    pub task_scope: Option<ContextTaskScope>,
    /// Campo dirty_files.
    pub dirty_files: Option<Vec<String>>,
}

/// Contrato de contexto: ContextBudget.
#[napi(object)]
pub struct ContextBudget {
    /// Campo limit.
    pub limit: u32,
    /// Campo used.
    pub used: u32,
    /// Campo estimator.
    pub estimator: String,
}

/// Contrato de contexto: PackSection.
#[napi(object)]
pub struct PackSection {
    /// Campo id.
    #[napi(
        ts_type = "'rules' | 'core' | 'skill' | 'task_scope' | 'related' | 'targets' | 'request'"
    )]
    pub id: String,
    /// Campo class.
    #[napi(ts_type = "'mandatory' | 'optional'")]
    pub class: String,
    /// Campo stability.
    #[napi(ts_type = "'static' | 'session' | 'task'")]
    pub stability: String,
    /// Campo tokens.
    pub tokens: u32,
    /// Campo hash.
    pub hash: String,
}

/// Contrato de contexto: PackFile.
#[napi(object)]
pub struct PackFile {
    /// Campo id.
    pub id: String,
    /// Campo level.
    #[napi(ts_type = "'L0' | 'L1' | 'L2' | 'L3'")]
    pub level: String,
    /// Campo tokens.
    pub tokens: u32,
    /// Campo score.
    pub score: f64,
    /// Campo reasons.
    pub reasons: Vec<String>,
    /// Campo note.
    pub note: Option<String>,
}

/// Contrato de contexto: ContextExcluded.
#[napi(object)]
pub struct ContextExcluded {
    /// Campo id.
    pub id: String,
    /// Campo reason.
    #[napi(ts_type = "'BUDGET' | 'RANK_CUTOFF'")]
    pub reason: String,
    /// Campo score.
    pub score: f64,
}

/// Contrato de contexto: ContextPack.
#[napi(object)]
pub struct ContextPack {
    /// Campo pack_version.
    pub pack_version: u32,
    /// Campo pack_hash.
    pub pack_hash: String,
    /// Campo map_hash.
    pub map_hash: String,
    /// Campo intent.
    #[napi(ts_type = "'fix' | 'add' | 'modify' | 'refactor' | 'test' | 'explain'")]
    pub intent: String,
    /// Campo intent_source.
    #[napi(ts_type = "'request' | 'inferred'")]
    pub intent_source: String,
    /// Campo budget.
    pub budget: ContextBudget,
    /// Campo sections.
    pub sections: Vec<PackSection>,
    /// Campo files.
    pub files: Vec<PackFile>,
    /// Campo excluded.
    pub excluded: Vec<ContextExcluded>,
    /// Campo diagnostics.
    pub diagnostics: Vec<Diagnostic>,
    /// Campo rendered.
    pub rendered: String,
    /// Campo json.
    pub json: String,
}

fn count(n: usize) -> u32 {
    u32::try_from(n).unwrap_or(u32::MAX)
}

/// Motor del Project Map para un root. Una instancia por root y proceso.
#[napi]
pub struct FokerEngine {
    inner: Arc<RwLock<MapEngine>>,
}

/// Ejecuta trabajo de CPU fuera del hilo de Node. Las funciones `async` de napi-rs no admiten un
/// estado de error propio, así que el código viaja como prefijo `[FKR-…] ` del mensaje y
/// `@foker/core` lo recupera.
async fn blocking<T: Send + 'static>(
    f: impl FnOnce() -> NativeResult<T> + Send + 'static,
) -> napi::Result<T> {
    let result = napi::tokio::task::spawn_blocking(move || guard(f))
        .await
        .map_err(|e| internal(format!("tarea nativa interrumpida: {e}")))
        .and_then(|r| r);
    result.map_err(|e| {
        napi::Error::new(
            napi::Status::GenericFailure,
            format!("[{}] {}", e.status.as_str(), e.reason),
        )
    })
}

#[napi]
impl FokerEngine {
    /// Abre el motor para un root absoluto. Carga el mapa persistido si es válido.
    #[napi(factory)]
    pub async fn open(root: String, config: Option<EngineConfig>) -> napi::Result<FokerEngine> {
        let mode = if config.as_ref().and_then(|c| c.read_only).unwrap_or(false) {
            OpenMode::ReadOnly
        } else {
            OpenMode::ReadWrite
        };
        let config = to_map_config(config).map_err(|e| {
            napi::Error::new(
                napi::Status::InvalidArg,
                format!("[{}] {}", e.status.as_str(), e.reason),
            )
        })?;
        blocking(move || {
            let engine = MapEngine::open_with(std::path::Path::new(&root), config, mode)
                .map_err(|e| engine_error(&e))?;
            Ok(FokerEngine {
                inner: Arc::new(RwLock::new(engine)),
            })
        })
        .await
    }

    /// Diagnósticos de la carga (p. ej. `FKR-MAP-005` si el mapa estaba corrupto).
    #[napi]
    pub fn load_diagnostics(&self) -> napi::Result<Vec<Diagnostic>, FokerCode> {
        let engine = self.inner.read().map_err(|_| internal("lock envenenado"))?;
        Ok(engine.load_diagnostics.iter().map(diagnostic).collect())
    }

    /// Refresca el mapa (incremental salvo `full`).
    #[napi]
    pub async fn refresh(&self, options: Option<RefreshOptions>) -> napi::Result<RefreshReport> {
        let inner = Arc::clone(&self.inner);
        let full = options.and_then(|o| o.full).unwrap_or(false);
        blocking(move || {
            let mut engine = inner.write().map_err(|_| internal("lock envenenado"))?;
            let report = engine
                .refresh(&foker_map::engine::RefreshOptions { full })
                .map_err(|e| engine_error(&e))?;
            Ok(RefreshReport {
                added: report.added,
                changed: report.changed,
                removed: report.removed,
                diagnostics: report.diagnostics.iter().map(diagnostic).collect(),
                duration_ms: report.duration_ms as f64,
                content_hash: report.content_hash,
                rebuilt: report.rebuilt,
                unchanged: report.unchanged,
            })
        })
        .await
    }

    /// Construye contexto delegando en foker-context, fuera del hilo de Node.
    #[napi]
    pub async fn build_context(&self, request: ContextRequest) -> napi::Result<ContextPack> {
        let inner = Arc::clone(&self.inner);
        blocking(move || {
            let mut engine = inner.write().map_err(|_| internal("lock envenenado"))?;
            // Siempre refrescar (sin cambios es la ruta rápida): el pack lee el código actual del disco
            // y debe rankear con un mapa coherente con él (FOKER-SPEC §9.1).
            engine
                .refresh(&Default::default())
                .map_err(|e| engine_error(&e))?;
            let intent = match request.intent.as_deref() {
                None => None,
                Some("fix") => Some(foker_context::Intent::Fix),
                Some("add") => Some(foker_context::Intent::Add),
                Some("modify") => Some(foker_context::Intent::Modify),
                Some("refactor") => Some(foker_context::Intent::Refactor),
                Some("test") => Some(foker_context::Intent::Test),
                Some("explain") => Some(foker_context::Intent::Explain),
                Some(other) => return Err(input_error(format!("intent desconocido: {other}"))),
            };
            let anchors = request.anchors.unwrap_or(ContextAnchors {
                files: None,
                symbols: None,
            });
            let mut params = request
                .params
                .map(foker_context::ContextParams::try_from)
                .transpose()
                .map_err(|e| napi::Error::new(e.code(), e.to_string()))?;
            if let (Some(params), Some(core_files)) = (&mut params, request.core_files) {
                params.core_files = core_files as usize;
            }
            let req = foker_context::ContextRequest {
                task: request.task,
                anchors: foker_context::Anchors {
                    files: anchors.files.unwrap_or_default(),
                    symbols: anchors.symbols.unwrap_or_default(),
                },
                intent,
                params,
                budget_tokens: request
                    .budget_tokens
                    .map(|v| v as usize)
                    .unwrap_or_else(|| foker_context::ContextRequest::default().budget_tokens),
                explain: request.explain.unwrap_or(false),
                ..Default::default()
            };
            let inputs = foker_context::ContextInputs {
                rules: request.rules,
                skill: request.skill.map(|s| foker_context::SkillInput {
                    name: s.name,
                    body: s.body,
                    required_files: s.required_files,
                    required_symbols: s.required_symbols,
                }),
                task_scope: request.task_scope.map(|s| foker_context::TaskScopeInput {
                    task_id: s.task_id,
                    description: s.description,
                    paths: s.paths,
                    checks: s.checks,
                }),
                core_files: request
                    .core_files
                    .map(|v| v as usize)
                    .unwrap_or_else(|| foker_context::ContextInputs::default().core_files),
                dirty_files: request.dirty_files.unwrap_or_default(),
            };
            let state = engine
                .state()
                .ok_or_else(|| internal("no hay estado tras refresh"))?;
            let pack = foker_context::build_context(state, engine.root(), &req, &inputs)
                .map_err(|e| napi::Error::new(e.code(), e.to_string()))?;
            let json = pack.to_canonical_json();
            Ok(ContextPack {
                pack_version: pack.pack_version,
                pack_hash: pack.pack_hash,
                map_hash: pack.map_hash,
                intent: pack.intent.as_str().into(),
                intent_source: pack.intent_source,
                budget: ContextBudget {
                    limit: count(pack.budget.limit),
                    used: count(pack.budget.used),
                    estimator: pack.budget.estimator,
                },
                sections: pack
                    .sections
                    .into_iter()
                    .map(|s| PackSection {
                        id: s.id,
                        class: s.class,
                        stability: s.stability,
                        tokens: count(s.tokens),
                        hash: s.hash,
                    })
                    .collect(),
                files: pack
                    .files
                    .into_iter()
                    .map(|f| PackFile {
                        id: f.id,
                        level: f.level.as_str().into(),
                        tokens: count(f.tokens),
                        score: f.score,
                        reasons: f.reasons,
                        note: f.note,
                    })
                    .collect(),
                excluded: pack
                    .excluded
                    .into_iter()
                    .map(|f| ContextExcluded {
                        id: f.id,
                        reason: f.reason,
                        score: f.score,
                    })
                    .collect(),
                diagnostics: pack
                    .diagnostics
                    .into_iter()
                    .map(|d| Diagnostic {
                        code: d.code,
                        message: d.message,
                        file: None,
                        subject: d.subject,
                    })
                    .collect(),
                rendered: pack.rendered,
                json,
            })
        })
        .await
    }

    /// Estado del mapa en memoria.
    #[napi]
    pub fn status(&self) -> napi::Result<MapStatus, FokerCode> {
        guard(|| {
            let engine = self.inner.read().map_err(|_| internal("lock envenenado"))?;
            let status = engine.status();
            Ok(MapStatus {
                content_hash: status.content_hash,
                files: count(status.files),
                symbols: count(status.symbols),
                stale_files: count(status.stale_files),
                schema_version: status.schema_version,
            })
        })
    }

    /// Cuenta archivos desactualizados respecto al disco sin reconstruir.
    #[napi]
    pub async fn check_stale(&self) -> napi::Result<u32> {
        let inner = Arc::clone(&self.inner);
        blocking(move || {
            let mut engine = inner.write().map_err(|_| internal("lock envenenado"))?;
            engine
                .check_stale()
                .map(count)
                .map_err(|e| engine_error(&e))
        })
        .await
    }

    /// Guarda el mapa en `.foker/project-map.json` (atómico, bajo lock).
    #[napi]
    pub async fn save(&self) -> napi::Result<SaveReport> {
        let inner = Arc::clone(&self.inner);
        blocking(move || {
            let mut engine = inner.write().map_err(|_| internal("lock envenenado"))?;
            let report = engine.save().map_err(|e| engine_error(&e))?;
            Ok(SaveReport {
                path: report.path,
                bytes: report.bytes as f64,
                content_hash: report.content_hash,
            })
        })
        .await
    }

    /// JSON canónico del mapa completo.
    #[napi]
    pub async fn export_map_json(&self) -> napi::Result<String> {
        let inner = Arc::clone(&self.inner);
        blocking(move || {
            let engine = inner.read().map_err(|_| internal("lock envenenado"))?;
            let map = engine
                .map()
                .ok_or_else(|| input_error("no hay mapa: ejecuta refresh() antes"))?;
            Ok(map.to_canonical_json())
        })
        .await
    }

    /// Busca archivos y símbolos por nombre o ruta.
    #[napi]
    pub fn search(&self, query: SearchQuery) -> napi::Result<Vec<SearchHit>, FokerCode> {
        guard(|| {
            let limit = query.limit.unwrap_or(20) as usize;
            query::validate_search(&query.query, limit).map_err(|e| input_error(e.to_string()))?;
            let kind = match query.kind.as_deref() {
                None | Some("any") => SearchKind::Any,
                Some("file") => SearchKind::File,
                Some("symbol") => SearchKind::Symbol,
                Some(other) => return Err(input_error(format!("kind desconocido: {other}"))),
            };
            let engine = self.inner.read().map_err(|_| internal("lock envenenado"))?;
            let Some(map) = engine.map() else {
                return Ok(Vec::new());
            };
            Ok(query::search(map, &query.query, kind, limit)
                .into_iter()
                .map(|h| SearchHit {
                    id: h.id,
                    kind: if h.is_file { "file" } else { "symbol" }.into(),
                    name: h.name,
                    file: h.file,
                    signature: h.signature,
                    score: h.score,
                })
                .collect())
        })
    }

    /// Información de un archivo (id o ruta relativa). `null` si no está en el mapa.
    #[napi]
    pub fn file_info(&self, id: String) -> napi::Result<Option<FileInfo>, FokerCode> {
        guard(|| {
            let id =
                normalize_lexical(&id).map_err(|e| napi::Error::new(e.code(), e.to_string()))?;
            let engine = self.inner.read().map_err(|_| internal("lock envenenado"))?;
            let Some(info) = engine.map().and_then(|m| query::file_info(m, &id)) else {
                return Ok(None);
            };
            let f = info.file;
            Ok(Some(FileInfo {
                id: f.id,
                package: f.package,
                language: f.language.as_str().into(),
                kind: f.kind.as_str().into(),
                hash: f.hash,
                size_bytes: f.size_bytes as f64,
                lines: f.lines,
                parse_status: f.parse_status.as_str().into(),
                rank_global: f.rank_global,
                exports: f.exports,
                imports: info.imports,
                imported_by: info.imported_by,
                symbols: info.symbols,
            }))
        })
    }

    /// Información de un símbolo por id (`<archivo>#<nombre>`). `null` si no existe.
    #[napi]
    pub fn symbol_info(&self, id: String) -> napi::Result<Option<SymbolInfo>, FokerCode> {
        guard(|| {
            let engine = self.inner.read().map_err(|_| internal("lock envenenado"))?;
            Ok(engine
                .map()
                .and_then(|m| query::symbol_info(m, &id))
                .map(|s| SymbolInfo {
                    file: s.file().to_owned(),
                    id: s.id,
                    name: s.name,
                    kind: s.kind.as_str().into(),
                    tags: s.tags,
                    exported: s.exported.as_str().into(),
                    signature: s.signature,
                    doc: s.doc,
                    range: Range {
                        start: Position {
                            line: s.range.start.line,
                            col: s.range.start.col,
                        },
                        end: Position {
                            line: s.range.end.line,
                            col: s.range.end.col,
                        },
                    },
                    parent: s.parent,
                }))
        })
    }

    /// Radio de impacto de archivos y símbolos.
    #[napi]
    pub fn impact(&self, request: ImpactRequest) -> napi::Result<ImpactReport, FokerCode> {
        guard(|| {
            let files: Vec<String> = request
                .files
                .unwrap_or_default()
                .iter()
                .map(|f| {
                    normalize_lexical(f).map_err(|e| napi::Error::new(e.code(), e.to_string()))
                })
                .collect::<Result<_, _>>()?;
            let symbols = request.symbols.unwrap_or_default();
            let depth = request.depth.unwrap_or(2);
            query::validate_impact(&files, &symbols, depth)
                .map_err(|e| input_error(e.to_string()))?;
            let direction = match request.direction.as_deref() {
                None | Some("dependents") => Direction::Dependents,
                Some("dependencies") => Direction::Dependencies,
                Some("both") => Direction::Both,
                Some(other) => return Err(input_error(format!("direction desconocida: {other}"))),
            };
            let engine = self.inner.read().map_err(|_| internal("lock envenenado"))?;
            let Some(map) = engine.map() else {
                return Err(input_error("no hay mapa: ejecuta refresh() antes"));
            };
            let report = query::impact(map, &files, &symbols, direction, depth);
            Ok(ImpactReport {
                nodes: report
                    .nodes
                    .into_iter()
                    .map(|n| ImpactNode {
                        id: n.id,
                        distance: n.distance,
                        via: n.via.map(String::from),
                        kind: n.kind.as_str().into(),
                    })
                    .collect(),
                packages: report.packages,
                tests: report.tests,
                diagnostics: report.diagnostics.iter().map(diagnostic).collect(),
            })
        })
    }
}

/// Versiones de gramáticas para `versionInfo`.
pub fn grammars() -> HashMap<String, String> {
    foker_map::parse::grammar_versions().into_iter().collect()
}
