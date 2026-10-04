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
