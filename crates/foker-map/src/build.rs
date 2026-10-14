//! Construcción del Project Map (FOKER-SPEC §8.3; FKR-024/025).

use std::collections::{BTreeMap, BTreeSet, HashSet};
use std::fs;
use std::path::Path;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use rayon::prelude::*;

use crate::FokerCode;
use crate::canonical::{hash_bytes, to_canonical_string};
use crate::config::MapConfig;
use crate::discover::{Candidate, DiscoveryError, Language, discover};
use crate::glob::{GlobError, GlobMatcher};
use crate::model::{
    Confidence, EdgeKind, FileKind, MapDiagnostic, MapEdge, MapFile, MapPackage, MapStats,
    MapSymbol, ProjectMap,
};
use crate::pagerank::WeightedGraph;
use crate::parse::{
    Exported, ImportKind, Imported, ParseStatus, ParsedFile, Relation, count_lines,
    grammar_versions, parse_source,
};
use crate::project::{Workspace, load_workspace};
use crate::resolve::{Outcome, ResolverSet};

/// Versión del extractor: forma parte de la clave de caché de parseo.
pub const EXTRACTOR_VERSION: u32 = 1;

/// Resultado de parseo reutilizable mientras no cambie el contenido.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct CachedParse {
    /// Hash del contenido.
    pub hash: String,
    /// Tamaño al leerlo.
    pub size: u64,
    /// mtime al leerlo.
    pub mtime_ns: u64,
    /// Resultado.
    pub parsed: ParsedFile,
}

/// Caché de parseo por id de archivo. Es una función pura del contenido: reutilizarla no puede
/// cambiar el resultado (REQ-MAP-001).
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct ParseCache {
    /// Versión del extractor que produjo las entradas.
    pub extractor_version: u32,
    /// Gramáticas que produjeron las entradas.
    pub grammars: BTreeMap<String, String>,
    /// Entradas.
    pub entries: BTreeMap<String, CachedParse>,
}

impl Default for ParseCache {
    fn default() -> Self {
        ParseCache::new()
    }
}

impl ParseCache {
    /// Caché vacía para la versión actual.
    pub fn new() -> Self {
        ParseCache {
            extractor_version: EXTRACTOR_VERSION,
            grammars: grammar_versions(),
            entries: BTreeMap::new(),
        }
    }

    /// `true` si fue producida por este extractor y estas gramáticas.
    pub fn is_compatible(&self) -> bool {
        self.extractor_version == EXTRACTOR_VERSION && self.grammars == grammar_versions()
    }
}

/// Error fatal al construir el mapa.
#[derive(Debug, thiserror::Error)]
pub enum BuildError {
    /// Descubrimiento.
    #[error(transparent)]
    Discovery(#[from] DiscoveryError),
    /// Glob inválido (tsconfig, kinds).
    #[error(transparent)]
    Glob(#[from] GlobError),
    /// El root no existe o no se puede leer.
    #[error("root no válido {path}: {message}")]
    Root {
        /// Ruta.
        path: String,
        /// Mensaje.
        message: String,
    },
}

impl BuildError {
    /// Código público.
    pub fn code(&self) -> FokerCode {
        match self {
            BuildError::Discovery(e) => e.code(),
            BuildError::Glob(_) => FokerCode::Inp001,
            BuildError::Root { .. } => FokerCode::Cfg002,
        }
    }
}

/// Estado completo tras un build: el mapa y los datos intermedios que usan las consultas.
#[derive(Debug, Clone)]
pub struct MapState {
    /// Project Map.
    pub map: ProjectMap,
    /// Parseo por archivo.
    pub parsed: BTreeMap<String, ParsedFile>,
    /// Resolución `(importador, especificador) → resultado`.
    pub outcomes: BTreeMap<(String, String), Outcome>,
    /// Workspace.
    pub workspace: Workspace,
    /// Descubrimiento usado (tamaños y mtimes de entrada, para comprobar frescura).
    pub discovery: crate::discover::Discovery,
}

struct Kinds {
    test: GlobMatcher,
    declaration: GlobMatcher,
    config: GlobMatcher,
    generated: GlobMatcher,
}

impl Kinds {
    fn new(config: &MapConfig) -> Result<Self, GlobError> {
        Ok(Kinds {
            test: GlobMatcher::new(&config.kinds.test, false)?,
            declaration: GlobMatcher::new(&config.kinds.declaration, false)?,
            config: GlobMatcher::new(&config.kinds.config, false)?,
            generated: GlobMatcher::new(&config.kinds.generated, false)?,
        })
    }

    /// Precedencia: declaración, generado, test, configuración, fuente.
    fn classify(&self, id: &str) -> FileKind {
        if id.ends_with(".d.ts")
            || id.ends_with(".d.mts")
            || id.ends_with(".d.cts")
            || self.declaration.is_match(id)
        {
            FileKind::Declaration
        } else if self.generated.is_match(id) {
            FileKind::Generated
        } else if self.test.is_match(id) {
            FileKind::Test
        } else if self.config.is_match(id) {
            FileKind::Config
        } else {
            FileKind::Source
        }
    }
}

/// Fecha RFC 3339 en UTC con segundos, sin dependencias externas.
pub fn rfc3339(time: SystemTime) -> String {
    let secs = time.duration_since(UNIX_EPOCH).map_or(0, |d| d.as_secs());
    let days = i64::try_from(secs / 86_400).unwrap_or(0);
    let rem = secs % 86_400;
    // Algoritmo civil_from_days de Howard Hinnant.
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}Z",
        rem / 3600,
        (rem % 3600) / 60,
        rem % 60
    )
}

/// Lee y parsea un candidato, reutilizando la caché si el contenido no cambió.
fn parse_candidate(
    candidate: &Candidate,
    oversized: bool,
    cached: Option<&CachedParse>,
) -> (CachedParse, bool) {
    if let Some(cached) = cached
        && cached.size == candidate.size
        && cached.mtime_ns == candidate.mtime_ns
        && candidate.mtime_ns != 0
    {
        return (cached.clone(), true);
    }
    let bytes = fs::read(&candidate.path).unwrap_or_default();
    let hash = hash_bytes(&bytes);
    if let Some(cached) = cached
        && cached.hash == hash
    {
        let mut reused = cached.clone();
        reused.size = candidate.size;
        reused.mtime_ns = candidate.mtime_ns;
        return (reused, true);
    }
    let parsed = if oversized {
        ParsedFile {
            status: ParseStatus::Skipped,
            lines: count_lines(&bytes),
            symbols: Vec::new(),
            imports: Vec::new(),
            exports: Vec::new(),
            import_refs: BTreeMap::new(),
        }
    } else {
        let language = Language::from_id(&candidate.id).unwrap_or(Language::TypeScript);
        parse_source(&candidate.id, language, &bytes)
    };
    (
        CachedParse {
            hash,
            size: candidate.size,
            mtime_ns: candidate.mtime_ns,
            parsed,
        },
        false,
    )
}

/// Índice de exports para seguir reexportaciones y bindings importados.
struct ExportIndex<'a> {
    parsed: &'a BTreeMap<String, ParsedFile>,
    outcomes: &'a BTreeMap<(String, String), Outcome>,
}

impl ExportIndex<'_> {
    fn target_file(&self, file: &str, specifier: &str) -> Option<&str> {
        match self.outcomes.get(&(file.to_owned(), specifier.to_owned())) {
            Some(Outcome::File(id)) => Some(id.as_str()),
            _ => None,
        }
    }

    /// Símbolo al que apunta el nombre exportado `name` de `file`.
    fn resolve(
        &self,
        file: &str,
        name: &str,
        visited: &mut HashSet<(String, String)>,
    ) -> Option<String> {
        if !visited.insert((file.to_owned(), name.to_owned())) {
            return None;
        }
        let parsed = self.parsed.get(file)?;
        let top_level = |n: &str| {
            parsed
                .symbols
                .iter()
                .find(|s| s.parent.is_none() && s.name == n)
        };
        // 1. Declaraciones exportadas directamente.
        let direct = parsed.symbols.iter().find(|s| {
            s.parent.is_none()
                && if name == "default" {
                    s.exported == Exported::Default
                } else {
                    s.exported == Exported::Named && s.name == name
                }
        });
        if let Some(symbol) = direct {
            return Some(format!("{file}#{}", symbol.qualified));
        }
        // 2. Entradas `export { … }`, `export … from`, CommonJS.
        if let Some(entry) = parsed.exports.iter().find(|e| e.exported == name) {
            let local = entry.local.as_deref()?;
            if let Some(source) = &entry.source {
                let target = self.target_file(file, source)?;
                return self.resolve(target, local, visited);
            }
            if let Some(symbol) = top_level(local) {
                return Some(format!("{file}#{}", symbol.qualified));
            }
            return self.resolve_binding(file, local, visited);
        }
        // 3. `export * from`.
        if name != "default" {
            for entry in parsed.exports.iter().filter(|e| e.exported == "*") {
                let Some(target) = entry
                    .source
                    .as_deref()
                    .and_then(|s| self.target_file(file, s))
                else {
                    continue;
                };
                if let Some(found) = self.resolve(target, name, visited) {
                    return Some(found);
                }
            }
        }
        None
    }

    /// Símbolo al que apunta el binding importado `local` de `file`.
    fn resolve_binding(
        &self,
        file: &str,
        local: &str,
        visited: &mut HashSet<(String, String)>,
    ) -> Option<String> {
        let parsed = self.parsed.get(file)?;
        for import in &parsed.imports {
            for binding in &import.bindings {
                if binding.local.as_deref() != Some(local) {
                    continue;
                }
                let target = self.target_file(file, &import.specifier)?;
                return match &binding.imported {
                    Imported::Named(name) => self.resolve(target, name, visited),
                    Imported::Default => self.resolve(target, "default", visited),
                    Imported::Namespace => None,
                };
            }
        }
        None
    }

    /// Todos los nombres exportados por `file` (incluidos los de `export *`, salvo `default`).
    fn names(&self, file: &str, visited: &mut HashSet<String>) -> BTreeSet<String> {
        let mut names = BTreeSet::new();
        if !visited.insert(file.to_owned()) {
            return names;
        }
        let Some(parsed) = self.parsed.get(file) else {
            return names;
        };
        for symbol in parsed.symbols.iter().filter(|s| s.parent.is_none()) {
            match symbol.exported {
                Exported::Default => {
                    names.insert("default".to_owned());
                }
                Exported::Named => {
                    names.insert(symbol.name.clone());
                }
                _ => {}
            }
        }
        for entry in &parsed.exports {
            if entry.exported != "*" {
                names.insert(entry.exported.clone());
            } else if let Some(target) = entry
                .source
                .as_deref()
                .and_then(|s| self.target_file(file, s))
            {
                names.extend(
                    self.names(target, visited)
                        .into_iter()
                        .filter(|n| n != "default"),
                );
            }
        }
        names
    }
}

fn edge(
    kind: EdgeKind,
    from: &str,
    to: &str,
    confidence: Confidence,
    weight: Option<u32>,
) -> MapEdge {
    MapEdge {
        kind,
        from: from.to_owned(),
        to: to.to_owned(),
        confidence,
        weight,
    }
}

/// Construye el mapa completo de `root`. `cache` se actualiza con los parseos nuevos.
pub fn build(
    root: &Path,
    config: &MapConfig,
    cache: &mut ParseCache,
) -> Result<MapState, BuildError> {
    let started = Instant::now();
    if !cache.is_compatible() {
        *cache = ParseCache::new();
    }
    let root_real = fs::canonicalize(root).map_err(|e| BuildError::Root {
        path: root.display().to_string(),
        message: e.to_string(),
    })?;
    if !root_real.is_dir() {
        return Err(BuildError::Root {
            path: root.display().to_string(),
            message: "no es un directorio".into(),
        });
    }
    let kinds = Kinds::new(config)?;
    let discovery = discover(&root_real, config)?;
    let root_name = root_real
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("root")
        .to_owned();
    let workspace = load_workspace(
        &discovery,
        &root_name,
        root_real.join("yarn.lock").is_file(),
    );

    // Parseo en paralelo; `collect` conserva el orden por id del descubrimiento.
    let oversized: HashSet<&str> = discovery.oversized.iter().map(String::as_str).collect();
    let results: Vec<(CachedParse, bool)> = discovery
        .sources
        .par_iter()
        .map(|c| {
            parse_candidate(
                c,
                oversized.contains(c.id.as_str()),
                cache.entries.get(&c.id),
            )
        })
        .collect();
    let mut entries = BTreeMap::new();
    let mut parsed: BTreeMap<String, ParsedFile> = BTreeMap::new();
    for (candidate, (entry, _reused)) in discovery.sources.iter().zip(results) {
        parsed.insert(candidate.id.clone(), entry.parsed.clone());
        entries.insert(candidate.id.clone(), entry);
    }
    cache.entries = entries;

    // Resolución en paralelo por archivo.
    let resolver = ResolverSet::new(&root_real, &discovery, &workspace, config)?;
    let resolved: Vec<Vec<((String, String), Outcome)>> = parsed
        .par_iter()
        .map(|(id, file)| {
            let specifiers: BTreeSet<&str> =
                file.imports.iter().map(|i| i.specifier.as_str()).collect();
            specifiers
                .into_iter()
                .map(|s| ((id.clone(), s.to_owned()), resolver.resolve(id, s)))
                .collect()
        })
        .collect();
    let outcomes: BTreeMap<(String, String), Outcome> = resolved.into_iter().flatten().collect();

    let index = ExportIndex {
        parsed: &parsed,
        outcomes: &outcomes,
    };

    let mut edges: BTreeMap<(EdgeKind, String, String), MapEdge> = BTreeMap::new();
    let mut add_edge = |e: MapEdge| {
        edges
            .entry((e.kind, e.from.clone(), e.to.clone()))
            .and_modify(|existing| {
                if let (Some(a), Some(b)) = (existing.weight, e.weight) {
                    existing.weight = Some(a.saturating_add(b));
                }
            })
            .or_insert(e);
    };
    let mut externals = BTreeSet::new();
    let mut diagnostics: Vec<MapDiagnostic> = Vec::new();
    let mut unresolved = 0usize;

    for (id, file) in &parsed {
        if file.status == ParseStatus::Partial {
            diagnostics.push(MapDiagnostic {
                file: Some(id.clone()),
                code: "FKR-MAP-101".into(),
                subject: None,
                message: "archivo con errores de sintaxis; símbolos extraídos parcialmente".into(),
            });
        }
        let mut reported = BTreeSet::new();
        for import in &file.imports {
            let Some(outcome) = outcomes.get(&(id.clone(), import.specifier.clone())) else {
                continue;
            };
            match outcome {
                Outcome::File(target) => {
                    let all_types = import.type_only
                        || (!import.bindings.is_empty()
                            && import.bindings.iter().all(|b| b.type_only));
                    let kind = match import.kind {
                        ImportKind::ReexportNamed | ImportKind::ReexportAll => EdgeKind::Reexports,
                        ImportKind::Static if all_types => EdgeKind::ImportsType,
                        _ => EdgeKind::Imports,
                    };
                    add_edge(edge(kind, id, target, Confidence::Resolved, None));
                    if import.kind == ImportKind::Static {
                        for binding in &import.bindings {
                            let Some(local) = binding.local.as_deref() else {
                                continue;
                            };
                            let refs = file.import_refs.get(local).copied().unwrap_or(0);
                            if refs == 0 {
                                continue;
                            }
                            let name = match &binding.imported {
                                Imported::Named(name) => name.as_str(),
                                Imported::Default => "default",
                                Imported::Namespace => continue,
                            };
                            if let Some(symbol) = index.resolve(target, name, &mut HashSet::new()) {
                                add_edge(edge(
                                    EdgeKind::UsesSymbol,
                                    id,
                                    &symbol,
                                    Confidence::Resolved,
                                    Some(refs),
                                ));
                            }
                        }
                    }
                }
                Outcome::External(module) => {
                    externals.insert(module.clone());
                    add_edge(edge(
                        EdgeKind::ImportsExternal,
                        id,
                        module,
                        Confidence::Resolved,
                        None,
                    ));
                }
                Outcome::NotSource(_) => {}
                Outcome::Unresolved(reason) => {
                    if reported.insert(import.specifier.clone()) {
                        unresolved += 1;
                        diagnostics.push(MapDiagnostic {
                            file: Some(id.clone()),
                            code: "FKR-MAP-104".into(),
                            subject: Some(import.specifier.clone()),
                            message: format!("import no resuelto: {} ({reason})", import.specifier),
                        });
                    }
                }
            }
        }
        // Herencia: nombre local, binding importado o `ns.Nombre` con ns importado como namespace.
        for symbol in &file.symbols {
            for heritage in &symbol.heritage {
                let target = match heritage.name.split_once('.') {
                    None => file
                        .symbols
                        .iter()
                        .find(|s| s.parent.is_none() && s.name == heritage.name)
                        .map(|s| format!("{id}#{}", s.qualified))
                        .or_else(|| index.resolve_binding(id, &heritage.name, &mut HashSet::new())),
                    Some((ns, member)) if !member.contains('.') => file
                        .imports
                        .iter()
                        .find(|i| {
                            i.bindings.iter().any(|b| {
                                b.imported == Imported::Namespace && b.local.as_deref() == Some(ns)
                            })
                        })
                        .and_then(|i| index.target_file(id, &i.specifier))
                        .and_then(|t| index.resolve(t, member, &mut HashSet::new())),
                    Some(_) => None,
                };
                if let Some(target) = target {
                    let kind = match heritage.relation {
                        Relation::Extends => EdgeKind::Extends,
                        Relation::Implements => EdgeKind::Implements,
                    };
                    add_edge(edge(
                        kind,
                        &format!("{id}#{}", symbol.qualified),
                        &target,
                        Confidence::Resolved,
                        None,
                    ));
                }
            }
        }
    }
    for package in &workspace.packages {
        for dep in &package.workspace_deps {
            if let Some(target) = workspace.by_name(dep) {
                add_edge(edge(
                    EdgeKind::PackageDepends,
                    &package.id,
                    &target.id,
                    Confidence::Declared,
                    None,
                ));
            }
        }
    }
    for d in &discovery.diagnostics {
        let is_file = d.code == "FKR-MAP-102";
        diagnostics.push(MapDiagnostic {
            file: is_file.then(|| d.subject.clone()),
            code: d.code.to_owned(),
            subject: (!is_file && !d.subject.is_empty()).then(|| d.subject.clone()),
            message: d.message.clone(),
        });
    }
    diagnostics.sort();
    diagnostics.dedup();
    let edges: Vec<MapEdge> = edges.into_values().collect();

    // PageRank global sobre archivos (FOKER-SPEC §8.5).
    let ids: Vec<&String> = parsed.keys().collect();
    let file_ids: Vec<&str> = ids.iter().map(|id| id.as_str()).collect();
    let graph = WeightedGraph::from_map_edges(&file_ids, &edges, 0.0);
    let ranks = graph.pagerank(None);

    let files: Vec<MapFile> = discovery
        .sources
        .iter()
        .zip(&ranks)
        .map(|(candidate, rank)| {
            let entry = &cache.entries[&candidate.id];
            let exports: BTreeSet<String> = index
                .names(&candidate.id, &mut HashSet::new())
                .into_iter()
                .filter_map(|name| index.resolve(&candidate.id, &name, &mut HashSet::new()))
                .collect();
            MapFile {
                id: candidate.id.clone(),
                package: workspace.package_of(&candidate.id).map(|p| p.id.clone()),
                language: Language::from_id(&candidate.id).unwrap_or(Language::TypeScript),
                kind: kinds.classify(&candidate.id),
                hash: entry.hash.clone(),
                size_bytes: candidate.size,
                lines: entry.parsed.lines,
                mtime_ns: candidate.mtime_ns,
                parse_status: entry.parsed.status,
                rank_global: *rank,
                exports: exports.into_iter().collect(),
            }
        })
        .collect();

    let mut symbols: Vec<MapSymbol> = parsed
        .iter()
        .flat_map(|(id, file)| {
            file.symbols.iter().map(move |s| MapSymbol {
                id: format!("{id}#{}", s.qualified),
                name: s.name.clone(),
                kind: s.kind,
                tags: s.tags.clone(),
                exported: s.exported,
                signature: s.signature.clone(),
                doc: s.doc.clone(),
                range: s.range,
                parent: s.parent.as_ref().map(|p| format!("{id}#{p}")),
            })
        })
        .collect();
    symbols.sort_by(|a, b| a.id.cmp(&b.id));

    let config_value = serde_json::to_value(config).unwrap_or_default();
    let stats = MapStats {
        files: files.len(),
        symbols: symbols.len(),
        edges: edges.len(),
        parse_errors: files
            .iter()
            .filter(|f| matches!(f.parse_status, ParseStatus::Partial | ParseStatus::Failed))
            .count(),
        unresolved_imports: unresolved,
        duration_ms: u64::try_from(started.elapsed().as_millis()).unwrap_or(u64::MAX),
    };
    let mut map = ProjectMap {
        foker_version: crate::VERSION.to_owned(),
        parsers: grammar_versions(),
        generated_at: rfc3339(SystemTime::now()),
        content_hash: String::new(),
        config_hash: hash_bytes(to_canonical_string(&config_value).as_bytes()),
        project_name: workspace.name.clone(),
        workspace_kind: workspace.kind.as_str().to_owned(),
        packages: workspace
            .packages
            .iter()
            .map(|p| MapPackage {
                id: p.id.clone(),
                name: p.name.clone(),
                path: p.path.clone(),
                version: p.version.clone(),
            })
            .collect(),
        files,
        symbols,
        edges,
        external_modules: externals.into_iter().collect(),
        diagnostics,
        stats,
    };
    map.content_hash = map.compute_content_hash();
    Ok(MapState {
        map,
        parsed,
        outcomes,
        workspace,
        discovery,
    })
}
