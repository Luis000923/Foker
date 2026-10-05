//! Vista focal de anclas grandes (ADR-033, fase 3 de ADR-031).
//!
//! Un ancla cuyo L3 supera `focal_min_tokens` puede entregarse con el cuerpo completo de sus
//! símbolos focales, la cabecera (imports), los contratos pequeños completos y el resto como
//! primera línea más una marca explícita de omisión. Sin símbolos focales, el archivo va
//! completo: nunca se omite contenido sin un foco determinista.
use crate::{ContextParams, normalize};
use foker_map::{model::MapSymbol, parse::SymbolKind};
use std::collections::{BTreeMap, BTreeSet};

/// Vista focal renderizada.
#[derive(Debug, Clone, PartialEq)]
pub struct FocalView {
    /// Texto entregado (incluye el aviso de omisión en la primera línea).
    pub body: String,
    /// Ids de símbolos con cuerpo completo por foco (orden de id).
    pub symbols: Vec<String>,
    /// Líneas del archivo que no se entregan.
    pub omitted_lines: usize,
}

/// Contratos (interfaces, tipos, enums) de hasta este número de líneas se entregan completos.
const CONTRACT_MAX_LINES: usize = 40;

/// Símbolos focales de un archivo para la petición: anclas de símbolo, identificadores
/// citados en la tarea y BM25 dentro del archivo (idf sobre sus símbolos).
pub fn focal_symbols(
    symbols: &[&MapSymbol],
    task: &str,
    anchor_symbols: &[String],
    params: &ContextParams,
) -> Vec<String> {
    let tokens = normalize::tokenize(task);
    let identifiers: BTreeSet<_> = tokens.identifiers.iter().map(String::as_str).collect();
    let mut focal = BTreeSet::new();
    for symbol in symbols {
        let qualified = symbol.id.split_once('#').map_or("", |(_, q)| q);
        if anchor_symbols
            .iter()
            .any(|a| *a == symbol.id || *a == symbol.name || *a == qualified)
            || identifiers.contains(symbol.name.as_str())
        {
            focal.insert(symbol.id.clone());
        }
    }
    let terms: BTreeSet<String> = if params.lexical_expansion {
        normalize::expand_terms(&tokens.terms)
    } else {
        tokens.terms.clone()
    }
    .into_iter()
    .collect();
    let documents: Vec<BTreeSet<String>> = symbols
        .iter()
        .map(|s| {
            let text = format!(
                "{} {} {}",
                s.name,
                s.signature,
                s.doc.as_deref().unwrap_or_default()
            );
            normalize::tokenize(&text).terms.into_iter().collect()
        })
        .collect();
    let mut df: BTreeMap<&str, usize> = BTreeMap::new();
    for document in &documents {
        for term in document {
            *df.entry(term.as_str()).or_default() += 1;
        }
    }
    let n = documents.len() as f64;
    let mut scored: Vec<(f64, &str)> = symbols
        .iter()
        .zip(&documents)
        .map(|(symbol, document)| {
            // Un término presente en todos los símbolos no discrimina dentro del archivo.
            let score = document
                .iter()
                .filter(|t| terms.contains(*t) && (df[t.as_str()] as f64) < n)
                .map(|t| {
                    let df = df[t.as_str()] as f64;
                    libm::log(1.0 + (n - df + 0.5) / (df + 0.5))
                })
                .sum::<f64>();
            (score, symbol.id.as_str())
        })
        .filter(|(score, _)| *score > 0.0)
        .collect();
    scored.sort_by(|a, b| b.0.total_cmp(&a.0).then(a.1.cmp(b.1)));
    if let Some(&(max, _)) = scored.first() {
        let room = params.focal_max_symbols.saturating_sub(focal.len());
        for (_, id) in scored
            .into_iter()
            .filter(|(score, _)| *score >= max * params.focal_relative)
            .take(room)
        {
            focal.insert(id.to_owned());
        }
    }
    focal.into_iter().collect()
}

struct Tree<'a> {
    children: BTreeMap<Option<&'a str>, Vec<&'a MapSymbol>>,
    focal: &'a BTreeSet<String>,
    /// Contenedores con algún descendiente focal.
    open: BTreeSet<&'a str>,
    /// Identificadores que aparecen en los cuerpos focales (posibles callees o tipos usados).
    referenced: BTreeSet<String>,
}

/// Representación de un símbolo en la vista focal (ADR-033).
#[derive(PartialEq)]
enum Shape {
    /// Cuerpo completo: foco, una sola línea o contrato pequeño.
    Full,
    /// Contenedor del foco: cabecera, hijos clasificados y cierre.
    Open,
    /// Primera línea y comentario: referenciado por el foco.
    Signature,
    /// Solo el nombre, agrupado con símbolos contiguos en una marca de omisión.
    Reference,
}

fn is_comment(line: &str) -> bool {
    let t = line.trim_start();
    t.starts_with("//") || t.starts_with("/*") || t.starts_with('*') || t.starts_with('@')
}

/// Renderiza la vista focal; `None` si no hay foco o no reduce el archivo.
pub fn render(source: &str, symbols: &[&MapSymbol], focal: &[String]) -> Option<FocalView> {
    if focal.is_empty() {
        return None;
    }
    let lines: Vec<&str> = source.split('\n').collect();
    let focal_set: BTreeSet<String> = focal.iter().cloned().collect();
    let by_id: BTreeMap<&str, &MapSymbol> = symbols.iter().map(|s| (s.id.as_str(), *s)).collect();
    let mut children: BTreeMap<Option<&str>, Vec<&MapSymbol>> = BTreeMap::new();
    for symbol in symbols {
        let start = symbol.range.start.line as usize;
        let end = symbol.range.end.line as usize;
        if start > end || end >= lines.len() {
            return None;
        }
        // Un padre fuera del archivo/mapa se trata como raíz.
        let parent = symbol.parent.as_deref().filter(|p| by_id.contains_key(p));
        children.entry(parent).or_default().push(symbol);
    }
    for list in children.values_mut() {
        list.sort_by(|a, b| {
            a.range
                .start
                .line
                .cmp(&b.range.start.line)
                .then(b.range.end.line.cmp(&a.range.end.line))
                .then(a.id.cmp(&b.id))
        });
    }
    let mut open = BTreeSet::new();
    for id in &focal_set {
        let mut parent = by_id.get(id.as_str()).and_then(|s| s.parent.as_deref());
        while let Some(p) = parent.filter(|p| by_id.contains_key(p)) {
            open.insert(p);
            parent = by_id[p].parent.as_deref();
        }
    }
    let mut referenced = BTreeSet::new();
    for id in &focal_set {
        if let Some(symbol) = by_id.get(id.as_str()) {
            for line in &lines[symbol.range.start.line as usize..=symbol.range.end.line as usize] {
                referenced.extend(
                    line.split(|c: char| !(c.is_alphanumeric() || c == '_' || c == '$'))
                        .filter(|w| !w.is_empty())
                        .map(str::to_owned),
                );
            }
        }
    }
    let tree = Tree {
        children,
        focal: &focal_set,
        open,
        referenced,
    };
    let mut out = Vec::new();
    let mut shown = vec![false; lines.len()];
    block(
        &tree,
        &lines,
        None,
        0,
        lines.len(),
        true,
        &mut out,
        &mut shown,
    );
    let omitted_lines = shown
        .iter()
        .zip(&lines)
        .filter(|(s, l)| !**s && !l.trim().is_empty())
        .count();
    if omitted_lines == 0 {
        return None;
    }
    let names: Vec<_> = focal
        .iter()
        .map(|id| id.split_once('#').map_or(id.as_str(), |(_, n)| n))
        .collect();
    let mut body = format!(
        "// foker: vista focal; cuerpos completos: {}. Firmas de lo que usan y nombres del resto; {} líneas omitidas y marcadas. Lea el archivo completo si necesita más.\n",
        names.join(", "),
        omitted_lines
    );
    body.push_str(&out.join("\n"));
    Some(FocalView {
        body,
        symbols: focal.to_vec(),
        omitted_lines,
    })
}

impl Tree<'_> {
    fn shape(&self, node: &MapSymbol) -> Shape {
        let (s, e) = (node.range.start.line as usize, node.range.end.line as usize);
        if self.focal.contains(&node.id)
            || s == e
            || (matches!(
                node.kind,
                SymbolKind::Interface | SymbolKind::TypeAlias | SymbolKind::Enum
            ) && e - s < CONTRACT_MAX_LINES)
        {
            Shape::Full
        } else if self.open.contains(node.id.as_str()) {
            Shape::Open
        } else if self.referenced.contains(&node.name) {
            Shape::Signature
        } else {
            Shape::Reference
        }
    }
}

/// Símbolos contiguos en forma Reference: una sola marca con sus nombres.
struct Run {
    from: usize,
    to: usize,
    names: Vec<String>,
}
fn flush(run: &mut Option<Run>, out: &mut Vec<String>) {
    if let Some(run) = run.take() {
        out.push(format!(
            "// foker: líneas {}–{} omitidas: {}",
            run.from + 1,
            run.to + 1,
            run.names.join(", ")
        ));
    }
}

#[allow(clippy::too_many_arguments)]
fn block(
    tree: &Tree<'_>,
    lines: &[&str],
    parent: Option<&str>,
    start: usize,
    end: usize,
    header: bool,
    out: &mut Vec<String>,
    shown: &mut [bool],
) {
    let mut cursor = start;
    let nodes = tree.children.get(&parent).cloned().unwrap_or_default();
    let mut first = true;
    let mut run: Option<Run> = None;
    for node in nodes {
        let (s, e) = (node.range.start.line as usize, node.range.end.line as usize);
        if s < cursor || e >= end {
            continue;
        }
        // Comentarios/decoradores contiguos sobre el símbolo se entregan con él.
        let mut doc = s;
        while doc > cursor && is_comment(lines[doc - 1]) {
            doc -= 1;
        }
        let shape = tree.shape(node);
        if shape == Shape::Reference {
            if header && first {
                gap(lines, cursor, doc, true, out, shown);
                cursor = doc;
            }
            first = false;
            let run = run.get_or_insert(Run {
                from: cursor,
                to: e,
                names: Vec::new(),
            });
            run.to = e;
            run.names.push(node.name.clone());
            cursor = e + 1;
            continue;
        }
        flush(&mut run, out);
        gap(lines, cursor, doc, header && first, out, shown);
        first = false;
        emit(lines, doc, s, out, shown);
        match shape {
            Shape::Full => emit(lines, s, e + 1, out, shown),
            Shape::Open => {
                emit(lines, s, s + 1, out, shown);
                block(tree, lines, Some(&node.id), s + 1, e, false, out, shown);
                emit(lines, e, e + 1, out, shown);
            }
            _ => {
                shown[s] = true;
                out.push(format!(
                    "{} // foker: líneas {}–{} omitidas",
                    lines[s].trim_end(),
                    s + 2,
                    e + 1
                ));
            }
        }
        cursor = e + 1;
    }
    flush(&mut run, out);
    gap(lines, cursor, end, header && first, out, shown);
}

fn emit(lines: &[&str], from: usize, to: usize, out: &mut Vec<String>, shown: &mut [bool]) {
    for (i, line) in lines.iter().enumerate().take(to).skip(from) {
        shown[i] = true;
        out.push((*line).to_owned());
    }
}

/// Huecos entre símbolos: la cabecera del archivo va completa; el resto se marca si tiene código.
fn gap(
    lines: &[&str],
    from: usize,
    to: usize,
    header: bool,
    out: &mut Vec<String>,
    shown: &mut [bool],
) {
    if from >= to {
        return;
    }
    if header || lines[from..to].iter().all(|l| l.trim().is_empty()) {
        emit(lines, from, to, out, shown);
    } else {
        out.push(format!("// foker: líneas {}–{} omitidas", from + 1, to));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use foker_map::parse::{Exported, Position, Range};

    fn symbol(id: &str, kind: SymbolKind, lines: (u32, u32), parent: Option<&str>) -> MapSymbol {
        MapSymbol {
            id: format!("a.ts#{id}"),
            name: id.rsplit('.').next().unwrap().into(),
            kind,
            tags: vec![],
            exported: Exported::None,
            signature: format!("function {id}()"),
            doc: None,
            range: Range {
                start: Position {
                    line: lines.0,
                    col: 0,
                },
                end: Position {
                    line: lines.1,
                    col: 1,
                },
            },
            parent: parent.map(|p| format!("a.ts#{p}")),
        }
    }
    const SOURCE: &str = "import { x } from './x';\n\n/** Calcula el ranking. */\nexport function calculateRanking() {\n  return helper();\n}\n\nfunction helper() {\n  return 2;\n}\nexport interface Shape {\n  a: number;\n}\nclass Box {\n  open() {\n    return 3;\n  }\n  close() {\n    return 4;\n  }\n}\nconst trailing = 1;\nconsole.log(trailing);";

    fn symbols() -> Vec<MapSymbol> {
        vec![
            symbol("calculateRanking", SymbolKind::Function, (3, 5), None),
            symbol("helper", SymbolKind::Function, (7, 9), None),
            symbol("Shape", SymbolKind::Interface, (10, 12), None),
            symbol("Box", SymbolKind::Class, (13, 20), None),
            symbol("Box.open", SymbolKind::Method, (14, 16), Some("Box")),
            symbol("Box.close", SymbolKind::Method, (17, 19), Some("Box")),
            symbol("trailing", SymbolKind::Variable, (21, 21), None),
        ]
    }

    #[test]
    fn foco_completo_resto_firmas_y_omision_explicita() {
        let owned = symbols();
        let refs: Vec<_> = owned.iter().collect();
        let view = render(
            SOURCE,
            &refs,
            &["a.ts#Box.close".into(), "a.ts#calculateRanking".into()],
        )
        .unwrap();
        let body = &view.body;
        assert!(
            body.starts_with(
                "// foker: vista focal; cuerpos completos: Box.close, calculateRanking."
            )
        );
        assert!(body.contains("import { x } from './x';"));
        assert!(body.contains(
            "/** Calcula el ranking. */\nexport function calculateRanking() {\n  return helper();\n}"
        ));
        assert!(body.contains("function helper() { // foker: líneas 9–10 omitidas"));
        assert!(!body.contains("return 2;"));
        assert!(body.contains("export interface Shape {\n  a: number;\n}"));
        // El contenedor del foco se abre: cabecera, hermano como firma, foco completo, cierre.
        // Hermano no referenciado: solo su nombre en la marca de omisión.
        assert!(body.contains(
            "class Box {\n// foker: líneas 15–17 omitidas: open\n  close() {\n    return 4;\n  }\n}"
        ));
        assert!(body.contains("// foker: líneas 23–23 omitidas"));
        assert_eq!(view.omitted_lines, 6);
    }

    #[test]
    fn sin_foco_o_sin_reduccion_entrega_el_archivo_completo() {
        let owned = symbols();
        let refs: Vec<_> = owned.iter().collect();
        assert_eq!(render(SOURCE, &refs, &[]), None);
        let all: Vec<String> = owned
            .iter()
            .filter(|s| s.parent.is_none())
            .map(|s| s.id.clone())
            .collect();
        let mut source = SOURCE.to_owned();
        source.truncate(source.rfind("\nconsole").unwrap());
        assert_eq!(render(&source, &refs, &all), None);
    }

    #[test]
    fn rango_invalido_no_produce_vista() {
        let mut owned = symbols();
        owned[0].range.end.line = 999;
        let refs: Vec<_> = owned.iter().collect();
        assert_eq!(render(SOURCE, &refs, &["a.ts#helper".into()]), None);
    }

    #[test]
    fn seleccion_por_identificador_ancla_y_lexico_determinista() {
        let mut owned = symbols();
        owned[1].doc = Some("Ordena el ranking de resultados".into());
        let refs: Vec<_> = owned.iter().collect();
        let params = ContextParams::default();
        let by_identifier = focal_symbols(&refs, "arregla calculateRanking", &[], &params);
        assert!(by_identifier.contains(&"a.ts#calculateRanking".to_string()));
        let by_anchor = focal_symbols(&refs, "xyzzy", &["Box.close".into()], &params);
        assert_eq!(by_anchor, ["a.ts#Box.close"]);
        let lexical = focal_symbols(&refs, "ordena resultados", &[], &params);
        assert_eq!(lexical, ["a.ts#helper"]);
        assert!(focal_symbols(&refs, "xyzzy", &[], &params).is_empty());
        assert_eq!(
            lexical,
            focal_symbols(&refs, "ordena resultados", &[], &params)
        );
    }
}
