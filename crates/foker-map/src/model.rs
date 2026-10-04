//! Modelo del Project Map y su serialización conforme a `project-map.schema.json` (FKR-024/025).

use serde_json::{Map, Value, json};

use crate::canonical::{hash_bytes, to_canonical_string};
use crate::discover::Language;
use crate::parse::{Exported, ParseStatus, Range, SymbolKind};

/// `schema_version` del mapa.
pub use crate::MAP_SCHEMA_VERSION;

/// Versión de `oxc_resolver` enlazada (`generator.resolver`). Un test la compara con `Cargo.lock`.
pub const RESOLVER_VERSION: &str = "11.24.3";

/// `files[].kind`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum FileKind {
    /// Código fuente.
    Source,
    /// Test.
    Test,
    /// Declaraciones de tipos.
    Declaration,
    /// Configuración.
    Config,
    /// Generado.
    Generated,
}

impl FileKind {
    /// Valor en el esquema.
    pub fn as_str(self) -> &'static str {
        match self {
            FileKind::Source => "source",
            FileKind::Test => "test",
            FileKind::Declaration => "declaration",
            FileKind::Config => "config",
            FileKind::Generated => "generated",
        }
    }
}

/// Tipo de arista (`edges[].kind`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum EdgeKind {
    /// `extends` (símbolo → símbolo).
    Extends,
    /// `implements` (símbolo → símbolo).
    Implements,
    /// Import de valor (archivo → archivo).
    Imports,
    /// Import de paquete externo (archivo → módulo).
    ImportsExternal,
    /// `import type` (archivo → archivo).
    ImportsType,
    /// Dependencia `workspace:` (paquete → paquete).
    PackageDepends,
    /// Reexportación (archivo → archivo).
    Reexports,
    /// Uso de un símbolo importado (archivo → símbolo).
    UsesSymbol,
}

impl EdgeKind {
    /// Valor en el esquema. El orden de las variantes coincide con el orden alfabético de este valor.
    pub fn as_str(self) -> &'static str {
        match self {
            EdgeKind::Extends => "extends",
            EdgeKind::Implements => "implements",
            EdgeKind::Imports => "imports",
            EdgeKind::ImportsExternal => "imports_external",
            EdgeKind::ImportsType => "imports_type",
            EdgeKind::PackageDepends => "package_depends",
            EdgeKind::Reexports => "reexports",
            EdgeKind::UsesSymbol => "uses_symbol",
        }
    }
}

/// `edges[].confidence`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum Confidence {
    /// Resuelto por el resolutor o por un import.
    Resolved,
    /// Por nombre, sin resolución.
    Heuristic,
    /// Declarado en package.json.
    Declared,
}

impl Confidence {
    /// Valor en el esquema.
    pub fn as_str(self) -> &'static str {
        match self {
            Confidence::Resolved => "resolved",
            Confidence::Heuristic => "heuristic",
            Confidence::Declared => "declared",
        }
    }
}

/// Paquete del workspace en el mapa.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MapPackage {
    /// `pkg:<name>`.
    pub id: String,
    /// Nombre npm.
    pub name: String,
    /// Directorio.
    pub path: String,
    /// Versión.
    pub version: Option<String>,
}

/// Archivo del mapa.
#[derive(Debug, Clone, PartialEq)]
pub struct MapFile {
    /// Id normalizado.
    pub id: String,
    /// Paquete que lo contiene.
    pub package: Option<String>,
    /// Lenguaje.
    pub language: Language,
    /// Clasificación.
    pub kind: FileKind,
    /// `blake3:` del contenido.
    pub hash: String,
    /// Tamaño.
    pub size_bytes: u64,
    /// Líneas.
    pub lines: u32,
    /// mtime (excluido del hash).
    pub mtime_ns: u64,
    /// Estado del parseo.
    pub parse_status: ParseStatus,
    /// PageRank global.
    pub rank_global: f64,
    /// Ids de símbolos exportados (incluidas reexportaciones), ordenados.
    pub exports: Vec<String>,
}

/// Símbolo del mapa.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MapSymbol {
    /// `<file_id>#<qualified>`.
    pub id: String,
    /// Nombre simple.
    pub name: String,
    /// Tipo.
    pub kind: SymbolKind,
    /// Etiquetas.
    pub tags: Vec<String>,
    /// Exportación.
    pub exported: Exported,
    /// Firma.
    pub signature: String,
    /// JSDoc.
    pub doc: Option<String>,
    /// Rango.
    pub range: Range,
    /// Id del contenedor.
    pub parent: Option<String>,
}

impl MapSymbol {
    /// Id del archivo que lo declara.
    pub fn file(&self) -> &str {
        self.id.split_once('#').map_or(self.id.as_str(), |(f, _)| f)
    }
}

/// Arista del mapa.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct MapEdge {
    /// Tipo.
    pub kind: EdgeKind,
    /// Origen.
    pub from: String,
    /// Destino.
    pub to: String,
    /// Confianza.
    pub confidence: Confidence,
    /// Referencias (solo `uses_symbol`).
    pub weight: Option<u32>,
}

/// Diagnóstico del mapa.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct MapDiagnostic {
    /// Archivo, si aplica (primera clave de orden).
    pub file: Option<String>,
    /// Código `FKR-MAP-1xx`.
    pub code: String,
    /// Sujeto (especificador, ruta…).
    pub subject: Option<String>,
    /// Mensaje.
    pub message: String,
}

/// Recuentos del último build.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct MapStats {
    /// Archivos.
    pub files: usize,
    /// Símbolos.
    pub symbols: usize,
    /// Aristas.
    pub edges: usize,
    /// Archivos `partial` o `failed`.
    pub parse_errors: usize,
    /// Imports no resueltos.
    pub unresolved_imports: usize,
    /// Duración (excluida del hash).
    pub duration_ms: u64,
}

/// Project Map completo.
#[derive(Debug, Clone, PartialEq)]
pub struct ProjectMap {
    /// Versión de Foker.
    pub foker_version: String,
    /// Gramática → versión.
    pub parsers: std::collections::BTreeMap<String, String>,
    /// Fecha de generación (excluida del hash).
    pub generated_at: String,
    /// Hash del contenido.
    pub content_hash: String,
    /// Hash de la configuración del mapa.
    pub config_hash: String,
    /// Nombre del proyecto.
    pub project_name: String,
    /// Tipo de workspace.
    pub workspace_kind: String,
    /// Paquetes ordenados por id.
    pub packages: Vec<MapPackage>,
    /// Archivos ordenados por id.
    pub files: Vec<MapFile>,
    /// Símbolos ordenados por id.
    pub symbols: Vec<MapSymbol>,
    /// Aristas ordenadas por (kind, from, to).
    pub edges: Vec<MapEdge>,
    /// Módulos externos ordenados.
    pub external_modules: Vec<String>,
    /// Diagnósticos ordenados por (file, code, subject).
    pub diagnostics: Vec<MapDiagnostic>,
    /// Recuentos.
    pub stats: MapStats,
}

fn range_json(range: &Range) -> Value {
    json!({
        "start": { "line": range.start.line, "col": range.start.col },
        "end": { "line": range.end.line, "col": range.end.col },
    })
}

impl ProjectMap {
    /// Documento JSON conforme al esquema. Con `for_hash` omite los campos excluidos de
    /// `content_hash` (`generated_at`, `content_hash`, `stats.duration_ms`, `files[].mtime_ns`).
    pub fn to_value(&self, for_hash: bool) -> Value {
        let files: Vec<Value> = self
            .files
            .iter()
            .map(|f| {
                let mut v = json!({
                    "id": f.id,
                    "package": f.package,
                    "language": f.language.as_str(),
                    "kind": f.kind.as_str(),
                    "hash": f.hash,
                    "size_bytes": f.size_bytes,
                    "lines": f.lines,
                    "parse_status": f.parse_status.as_str(),
                    "rank": { "global": f.rank_global },
                    "exports": f.exports,
                });
                if !for_hash {
                    v["mtime_ns"] = json!(f.mtime_ns);
                }
                v
            })
            .collect();
        let symbols: Vec<Value> = self
            .symbols
            .iter()
            .map(|s| {
                json!({
                    "id": s.id,
                    "name": s.name,
                    "kind": s.kind.as_str(),
                    "tags": s.tags,
                    "exported": s.exported.as_str(),
                    "signature": s.signature,
                    "doc": s.doc,
                    "range": range_json(&s.range),
                    "parent": s.parent,
                })
            })
            .collect();
        let edges: Vec<Value> = self
            .edges
            .iter()
            .map(|e| {
                let mut v = json!({
                    "kind": e.kind.as_str(),
                    "from": e.from,
                    "to": e.to,
                    "confidence": e.confidence.as_str(),
                });
                if let Some(weight) = e.weight {
                    v["weight"] = json!(weight);
                }
                v
            })
            .collect();
        let diagnostics: Vec<Value> = self
            .diagnostics
            .iter()
            .map(|d| {
                let mut v = Map::new();
                v.insert("code".into(), json!(d.code));
                v.insert("message".into(), json!(d.message));
                if let Some(file) = &d.file {
                    v.insert("file".into(), json!(file));
                }
                if let Some(subject) = &d.subject {
                    v.insert("subject".into(), json!(subject));
                }
                Value::Object(v)
            })
            .collect();
        let packages: Vec<Value> = self
            .packages
            .iter()
            .map(|p| json!({ "id": p.id, "name": p.name, "path": p.path, "version": p.version }))
            .collect();
        let mut stats = json!({
            "files": self.stats.files,
            "symbols": self.stats.symbols,
            "edges": self.stats.edges,
            "parse_errors": self.stats.parse_errors,
            "unresolved_imports": self.stats.unresolved_imports,
        });
        let mut doc = json!({
            "$schema": "https://foker.dev/schemas/project-map/v1.json",
            "schema_version": MAP_SCHEMA_VERSION,
            "foker_version": self.foker_version,
            "generator": {
                "engine": self.foker_version,
                "parsers": self.parsers,
                "resolver": RESOLVER_VERSION,
            },
            "config_hash": self.config_hash,
            "project": {
                "name": self.project_name,
                "workspace_kind": self.workspace_kind,
                "packages": packages,
            },
            "files": files,
            "symbols": symbols,
            "edges": edges,
            "external_modules": self.external_modules,
            "diagnostics": diagnostics,
        });
        if !for_hash {
            stats["duration_ms"] = json!(self.stats.duration_ms);
            doc["generated_at"] = json!(self.generated_at);
            doc["content_hash"] = json!(self.content_hash);
        }
        doc["stats"] = stats;
        doc
    }

    /// Calcula `content_hash` sobre el JSON canónico sin los campos volátiles.
    pub fn compute_content_hash(&self) -> String {
        hash_bytes(to_canonical_string(&self.to_value(true)).as_bytes())
    }

    /// JSON canónico completo (lo que se persiste y lo que devuelve `exportMapJson`).
    pub fn to_canonical_json(&self) -> String {
        to_canonical_string(&self.to_value(false))
    }
}
