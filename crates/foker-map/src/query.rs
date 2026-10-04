//! Consultas sobre el Project Map: búsqueda, información de archivo y símbolo, e impacto
//! (FOKER-SPEC §7.2, §10.3; FKR-029).

use std::collections::{BTreeMap, BTreeSet};

use crate::model::{EdgeKind, FileKind, MapDiagnostic, MapFile, MapSymbol, ProjectMap};
use crate::text::{split_identifier, subterms};

/// Qué buscar.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SearchKind {
    /// Solo archivos.
    File,
    /// Solo símbolos.
    Symbol,
    /// Ambos.
    Any,
}

/// Resultado de búsqueda.
#[derive(Debug, Clone, PartialEq)]
pub struct SearchHit {
    /// Id del archivo o símbolo.
    pub id: String,
    /// `true` si es un archivo.
    pub is_file: bool,
    /// Nombre (símbolo) o nombre de archivo.
    pub name: String,
    /// Archivo.
    pub file: String,
    /// Firma (solo símbolos).
    pub signature: Option<String>,
    /// Puntuación en [0, 1].
    pub score: f64,
}

fn basename(id: &str) -> &str {
    id.rsplit('/').next().unwrap_or(id)
}

fn stem(name: &str) -> &str {
    name.split('.').next().unwrap_or(name)
}

/// Puntuación por coincidencia literal, de más a menos estricta.
fn literal_score(query: &str, name: &str, id: &str) -> f64 {
    let name_l = name.to_lowercase();
    let id_l = id.to_lowercase();
    if name_l == query || id_l == query {
        1.0
    } else if stem(&name_l) == query {
        0.95
    } else if name_l.starts_with(query) {
        0.8
    } else if id_l.ends_with(query)
        || id_l
            .rsplit_once('.')
            .is_some_and(|(stem, _)| stem.ends_with(query))
    {
        0.75
    } else if name_l.contains(query) {
        0.65
    } else if id_l.contains(query) {
        0.55
    } else {
        0.0
    }
}

/// Fracción de subtérminos de la consulta presentes en el documento (en [0, 0.5]).
fn term_score(query_terms: &BTreeSet<String>, doc_terms: &BTreeSet<String>) -> f64 {
    if query_terms.is_empty() {
        return 0.0;
    }
    let hits = query_terms
        .iter()
        .filter(|t| doc_terms.contains(*t))
        .count();
    0.5 * hits as f64 / query_terms.len() as f64
}

fn round6(x: f64) -> f64 {
    (x * 1e6).round() / 1e6
}

/// Busca archivos y símbolos por nombre o ruta. Orden: puntuación descendente, archivos antes que
/// símbolos a igual puntuación, e id ascendente.
pub fn search(map: &ProjectMap, query: &str, kind: SearchKind, limit: usize) -> Vec<SearchHit> {
    let q = query.trim().to_lowercase();
    if q.is_empty() || limit == 0 {
        return Vec::new();
    }
    let q_terms: BTreeSet<String> = subterms(query.trim()).into_iter().collect();
    let mut hits = Vec::new();
    if kind != SearchKind::Symbol {
        for file in &map.files {
            let doc: BTreeSet<String> = subterms(&file.id).into_iter().collect();
            let score =
                literal_score(&q, basename(&file.id), &file.id).max(term_score(&q_terms, &doc));
            if score > 0.0 {
                hits.push(SearchHit {
                    id: file.id.clone(),
                    is_file: true,
                    name: basename(&file.id).to_owned(),
                    file: file.id.clone(),
                    signature: None,
                    score: round6(score),
                });
            }
        }
    }
    if kind != SearchKind::File {
        for symbol in &map.symbols {
            let qualified = symbol.id.split_once('#').map_or("", |(_, q)| q);
            // `f~2` (sobrecargas) puntúa igual que `f`.
            let qualified = qualified.split_once('~').map_or(qualified, |(q, _)| q);
            let mut doc: BTreeSet<String> = split_identifier(&symbol.name).into_iter().collect();
            doc.extend(subterms(symbol.file()));
            let score = literal_score(&q, &symbol.name, qualified).max(term_score(&q_terms, &doc));
            if score > 0.0 {
                hits.push(SearchHit {
                    id: symbol.id.clone(),
                    is_file: false,
                    name: symbol.name.clone(),
                    file: symbol.file().to_owned(),
                    signature: Some(symbol.signature.clone()),
                    score: round6(score),
                });
            }
        }
    }
    hits.sort_by(|a, b| {
        b.score
            .total_cmp(&a.score)
            .then_with(|| b.is_file.cmp(&a.is_file))
            .then_with(|| a.id.cmp(&b.id))
    });
    hits.truncate(limit);
    hits
}

/// Información de un archivo con sus vecinos directos.
#[derive(Debug, Clone, PartialEq)]
pub struct FileInfo {
    /// Entrada del mapa.
    pub file: MapFile,
    /// Archivos que este importa (imports, imports_type, reexports), ordenados.
    pub imports: Vec<String>,
    /// Archivos que importan a este, ordenados.
    pub imported_by: Vec<String>,
    /// Símbolos declarados en el archivo, en orden de id.
    pub symbols: Vec<String>,
}

fn is_file_edge(kind: EdgeKind) -> bool {
    matches!(
        kind,
        EdgeKind::Imports | EdgeKind::ImportsType | EdgeKind::Reexports
    )
}

/// Información de un archivo por id.
pub fn file_info(map: &ProjectMap, id: &str) -> Option<FileInfo> {
    let file = map.files.iter().find(|f| f.id == id)?.clone();
    let mut imports = BTreeSet::new();
    let mut imported_by = BTreeSet::new();
    for edge in map.edges.iter().filter(|e| is_file_edge(e.kind)) {
        if edge.from == id {
            imports.insert(edge.to.clone());
        }
        if edge.to == id {
            imported_by.insert(edge.from.clone());
        }
    }
    let prefix = format!("{id}#");
    let symbols = map
        .symbols
        .iter()
        .filter(|s| s.id.starts_with(&prefix))
        .map(|s| s.id.clone())
        .collect();
    Some(FileInfo {
        file,
        imports: imports.into_iter().collect(),
        imported_by: imported_by.into_iter().collect(),
        symbols,
    })
}

/// Información de un símbolo por id.
pub fn symbol_info(map: &ProjectMap, id: &str) -> Option<MapSymbol> {
    map.symbols
        .binary_search_by(|s| s.id.as_str().cmp(id))
        .ok()
        .map(|i| map.symbols[i].clone())
}

/// Dirección del análisis de impacto.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Direction {
    /// Qué depende de los orígenes.
    Dependents,
    /// De qué dependen los orígenes.
    Dependencies,
    /// Ambas.
    Both,
}

/// Tipo de nodo en el informe de impacto.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum NodeKind {
    /// Archivo.
    File,
    /// Símbolo.
    Symbol,
}

impl NodeKind {
    /// Valor en el esquema.
    pub fn as_str(self) -> &'static str {
        match self {
            NodeKind::File => "file",
            NodeKind::Symbol => "symbol",
        }
    }
}

/// Nodo alcanzado.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct ImpactNode {
    /// Distancia al origen más cercano.
    pub distance: u32,
    /// Id.
    pub id: String,
    /// Tipo de arista por la que se llegó (`None` en los orígenes).
    pub via: Option<&'static str>,
    /// Tipo de nodo.
    pub kind: NodeKind,
}

/// Informe de impacto.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ImpactReport {
    /// Nodos ordenados por distancia e id.
    pub nodes: Vec<ImpactNode>,
    /// Paquetes de los archivos alcanzados (incluidos los orígenes), ordenados.
    pub packages: Vec<String>,
    /// Archivos de test alcanzados, ordenados.
    pub tests: Vec<String>,
    /// Orígenes desconocidos (`FKR-CTX-102`).
    pub diagnostics: Vec<MapDiagnostic>,
}

/// Radio de impacto de archivos y símbolos (BFS determinista por niveles, profundidad 1–3).
pub fn impact(
    map: &ProjectMap,
    files: &[String],
    symbols: &[String],
    direction: Direction,
    depth: u32,
) -> ImpactReport {
    let depth = depth.clamp(1, 3);
    // Adyacencia: nodo → [(vecino, via)] en cada sentido, ordenada.
    let mut forward: BTreeMap<&str, BTreeSet<(&str, &'static str)>> = BTreeMap::new();
    let mut backward: BTreeMap<&str, BTreeSet<(&str, &'static str)>> = BTreeMap::new();
    for edge in &map.edges {
        let relevant = is_file_edge(edge.kind)
            || matches!(
                edge.kind,
                EdgeKind::UsesSymbol | EdgeKind::Extends | EdgeKind::Implements
            );
        if relevant {
            forward
                .entry(&edge.from)
                .or_default()
                .insert((&edge.to, edge.kind.as_str()));
            backward
                .entry(&edge.to)
                .or_default()
                .insert((&edge.from, edge.kind.as_str()));
        }
    }
    let file_ids: BTreeSet<&str> = map.files.iter().map(|f| f.id.as_str()).collect();
    let symbol_ids: BTreeSet<&str> = map.symbols.iter().map(|s| s.id.as_str()).collect();

    let mut diagnostics = Vec::new();
    let mut seen: BTreeMap<String, ImpactNode> = BTreeMap::new();
    let mut frontier: BTreeSet<String> = BTreeSet::new();
    for (ids, known, kind) in [
        (files, &file_ids, NodeKind::File),
        (symbols, &symbol_ids, NodeKind::Symbol),
    ] {
        for id in ids {
            if known.contains(id.as_str()) {
                seen.insert(
                    id.clone(),
                    ImpactNode {
                        distance: 0,
                        id: id.clone(),
                        via: None,
                        kind,
                    },
                );
                frontier.insert(id.clone());
            } else {
                diagnostics.push(MapDiagnostic {
                    file: None,
                    code: "FKR-CTX-102".into(),
                    subject: Some(id.clone()),
                    message: format!("no existe en el mapa: {id}"),
                });
            }
        }
    }

    // Los orígenes símbolo también siembran su archivo para recorrer sus dependencias.
    if matches!(direction, Direction::Dependencies | Direction::Both) {
        for id in symbols.iter().filter(|id| symbol_ids.contains(id.as_str())) {
            if let Some((file, _)) = id.split_once('#') {
                seen.entry(file.to_owned()).or_insert_with(|| ImpactNode {
                    distance: 0,
                    id: file.to_owned(),
                    via: Some("declares"),
                    kind: NodeKind::File,
                });
                frontier.insert(file.to_owned());
            }
        }
    }

    for distance in 1..=depth {
        let mut next: BTreeMap<String, &'static str> = BTreeMap::new();
        for node in &frontier {
            let mut neighbours: Vec<(&str, &'static str)> = Vec::new();
            if matches!(direction, Direction::Dependents | Direction::Both) {
                neighbours.extend(backward.get(node.as_str()).into_iter().flatten().copied());
            }
            if matches!(direction, Direction::Dependencies | Direction::Both) {
                neighbours.extend(forward.get(node.as_str()).into_iter().flatten().copied());
            }
            for (neighbour, via) in neighbours {
                // Hacia dependencias, un `uses_symbol` lleva al símbolo; se sigue por su archivo.
                if seen.contains_key(neighbour) {
                    continue;
                }
                next.entry(neighbour.to_owned())
                    .and_modify(|v| {
                        if via < *v {
                            *v = via;
                        }
                    })
                    .or_insert(via);
            }
        }
        frontier.clear();
        for (id, via) in next {
            let kind = if file_ids.contains(id.as_str()) {
                NodeKind::File
            } else {
                NodeKind::Symbol
            };
            seen.insert(
                id.clone(),
                ImpactNode {
                    distance,
                    id: id.clone(),
                    via: Some(via),
                    kind,
                },
            );
            frontier.insert(id);
        }
        // Un símbolo alcanzado arrastra a su archivo en el mismo nivel (para seguir el grafo de archivos).
        let symbol_files: Vec<String> = frontier
            .iter()
            .filter(|id| symbol_ids.contains(id.as_str()))
            .filter_map(|id| id.split_once('#').map(|(f, _)| f.to_owned()))
            .filter(|f| !seen.contains_key(f))
            .collect();
        for file in symbol_files {
            seen.insert(
                file.clone(),
                ImpactNode {
                    distance,
                    id: file.clone(),
                    via: Some("declares"),
                    kind: NodeKind::File,
                },
            );
            frontier.insert(file);
        }
    }

    let mut nodes: Vec<ImpactNode> = seen.into_values().collect();
    nodes.sort();
    let files_reached: BTreeSet<&str> = nodes
        .iter()
        .filter(|n| n.kind == NodeKind::File)
        .map(|n| n.id.as_str())
        .chain(
            nodes
                .iter()
                .filter(|n| n.kind == NodeKind::Symbol)
                .filter_map(|n| n.id.split_once('#').map(|(f, _)| f)),
        )
        .collect();
    let mut packages = BTreeSet::new();
    let mut tests = BTreeSet::new();
    for file in map
        .files
        .iter()
        .filter(|f| files_reached.contains(f.id.as_str()))
    {
        if let Some(package) = &file.package {
            packages.insert(package.clone());
        }
        if file.kind == FileKind::Test {
            tests.insert(file.id.clone());
        }
    }
    ImpactReport {
        nodes,
        packages: packages.into_iter().collect(),
        tests: tests.into_iter().collect(),
        diagnostics,
    }
}

/// Error de entrada de una consulta (`FKR-INP-001`).
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[error("entrada inválida: {0}")]
pub struct InvalidInput(pub String);

/// Valida los límites de `search` (FOKER-SPEC §10.3).
pub fn validate_search(query: &str, limit: usize) -> Result<(), InvalidInput> {
    let len = query.chars().count();
    if len == 0 || len > 200 {
        return Err(InvalidInput(
            "query debe tener entre 1 y 200 caracteres".into(),
        ));
    }
    if !(1..=50).contains(&limit) {
        return Err(InvalidInput("limit debe estar entre 1 y 50".into()));
    }
    Ok(())
}

/// Valida los límites de `impact` (FOKER-SPEC §10.3).
pub fn validate_impact(
    files: &[String],
    symbols: &[String],
    depth: u32,
) -> Result<(), InvalidInput> {
    if files.is_empty() && symbols.is_empty() {
        return Err(InvalidInput("indica al menos un archivo o símbolo".into()));
    }
    if files.len() > 20 || symbols.len() > 20 {
        return Err(InvalidInput("máximo 20 archivos y 20 símbolos".into()));
    }
    if !(1..=3).contains(&depth) {
        return Err(InvalidInput("depth debe estar entre 1 y 3".into()));
    }
    Ok(())
}
