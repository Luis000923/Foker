//! Índice léxico de un documento por archivo (FKR-031).
use crate::normalize::tokenize;
use foker_map::model::ProjectMap;
use foker_map::parse::Exported;
use std::collections::{BTreeMap, BTreeSet};

#[derive(Debug)]
struct Document {
    id: String,
    terms: BTreeMap<String, usize>,
    len: usize,
}
/// Índice BM25 determinista con k1=1,2 y b=0,75.
#[derive(Debug)]
pub struct Bm25 {
    documents: Vec<Document>,
    frequencies: BTreeMap<String, usize>,
    average: f64,
}
/// Coincidencia léxica normalizada.
#[derive(Debug, Clone)]
pub struct Hit {
    /// Id de archivo.
    pub id: String,
    /// Puntuación dividida por el máximo.
    pub score: f64,
    /// Términos que contribuyen.
    pub terms: Vec<String>,
}
impl Bm25 {
    /// Construye documentos desde rutas y símbolos exportados del mapa.
    pub fn new(map: &ProjectMap) -> Self {
        let mut documents = Vec::new();
        let mut frequencies = BTreeMap::new();
        let by_id: BTreeMap<_, _> = map.symbols.iter().map(|s| (s.id.as_str(), s)).collect();
        let mut by_file: BTreeMap<&str, BTreeSet<&str>> = BTreeMap::new();
        for symbol in &map.symbols {
            if symbol.exported != Exported::None {
                by_file.entry(symbol.file()).or_default().insert(&symbol.id);
            }
        }
        for file in &map.files {
            let mut text = file.id.clone();
            let mut ids = by_file.get(file.id.as_str()).cloned().unwrap_or_default();
            ids.extend(file.exports.iter().map(String::as_str));
            for symbol in ids
                .into_iter()
                .filter_map(|id| by_id.get(id))
                .filter(|s| s.exported != Exported::None)
            {
                text.push(' ');
                text.push_str(&symbol.name);
                text.push(' ');
                text.push_str(&symbol.signature);
                if let Some(doc) = &symbol.doc {
                    text.push(' ');
                    text.push_str(doc);
                }
            }
            let terms = tokenize(&text).terms;
            let len = terms.len();
            let mut counts = BTreeMap::new();
            for term in terms {
                *counts.entry(term).or_insert(0) += 1;
            }
            for term in counts.keys() {
                *frequencies.entry(term.clone()).or_insert(0) += 1;
            }
            documents.push(Document {
                id: file.id.clone(),
                terms: counts,
                len,
            });
        }
        documents.sort_by(|a, b| a.id.cmp(&b.id));
        let average = if documents.is_empty() {
            1.0
        } else {
            (documents.iter().map(|d| d.len).sum::<usize>() as f64 / documents.len() as f64)
                .max(1.0)
        };
        Self {
            documents,
            frequencies,
            average,
        }
    }
    /// Top 20 puntuaciones positivas, normalizadas por el máximo, empates por id.
    pub fn search(&self, terms: &[String]) -> Vec<Hit> {
        self.search_with_params(terms, &crate::ContextParams::default())
    }
    /// Búsqueda parametrizada para calibración interna.
    pub fn search_with_params(&self, terms: &[String], params: &crate::ContextParams) -> Vec<Hit> {
        let mut hits = Vec::new();
        for document in &self.documents {
            let mut score = 0.0;
            let mut matched = Vec::new();
            for term in terms {
                if let Some(&count) = document.terms.get(term) {
                    let df = self.frequencies[term] as f64;
                    let idf =
                        libm::log(1.0 + (self.documents.len() as f64 - df + 0.5) / (df + 0.5));
                    let tf = count as f64;
                    score += idf * tf * (params.bm25_k1 + 1.0)
                        / (tf
                            + params.bm25_k1
                                * (1.0 - params.bm25_b
                                    + params.bm25_b * document.len as f64 / self.average));
                    matched.push(term.clone());
                }
            }
            if score > 0.0 {
                matched.sort();
                matched.dedup();
                hits.push(Hit {
                    id: document.id.clone(),
                    score,
                    terms: matched,
                });
            }
        }
        hits.sort_by(|a, b| b.score.total_cmp(&a.score).then(a.id.cmp(&b.id)));
        if let Some(max) = hits.first().map(|h| h.score) {
            for hit in &mut hits {
                hit.score /= max;
            }
        }
        hits.truncate(params.bm25_top);
        hits
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn known_query_normalization_and_ties() {
        let index = Bm25 {
            documents: vec![
                Document {
                    id: "a".into(),
                    terms: BTreeMap::from([("cart".into(), 2)]),
                    len: 2,
                },
                Document {
                    id: "b".into(),
                    terms: BTreeMap::from([("cart".into(), 2)]),
                    len: 2,
                },
            ],
            frequencies: BTreeMap::from([("cart".into(), 2)]),
            average: 2.0,
        };
        let hits = index.search(&["cart".into()]);
        assert_eq!(
            hits.iter().map(|h| (&*h.id, h.score)).collect::<Vec<_>>(),
            [("a", 1.0), ("b", 1.0)]
        );
        assert!(index.search(&["missing".into()]).is_empty());
    }
}
