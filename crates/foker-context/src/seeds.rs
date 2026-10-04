//! Fuentes de personalización y razones (§9.5 y §13.2).
use crate::{
    ContextError, ContextInputs, Diagnostic, NormalizedRequest, bm25::Bm25, normalize::Tokens,
};
use foker_map::{glob::GlobMatcher, model::ProjectMap, parse::Exported};
use std::collections::{BTreeMap, BTreeSet};

/// Vector de teletransporte y trazas por archivo.
#[derive(Debug, Clone)]
pub struct Seeds {
    /// Pesos sin normalizar, orden de map.files.
    pub weights: Vec<f64>,
    /// Anclas explícitas resueltas.
    pub anchors: BTreeSet<String>,
    /// Razones por archivo.
    pub reasons: BTreeMap<String, BTreeSet<String>>,
    /// Avisos.
    pub diagnostics: Vec<Diagnostic>,
}
impl Seeds {
    /// Número de archivos-semilla por fuente, independientemente de la selección final.
    pub fn counts(&self) -> BTreeMap<String, usize> {
        let mut counts = BTreeMap::new();
        for reasons in self.reasons.values() {
            let sources: BTreeSet<_> = reasons
                .iter()
                .map(|r| r.split(':').next().unwrap_or(r))
                .collect();
            for source in sources {
                *counts.entry(source.to_owned()).or_insert(0) += 1;
            }
        }
        counts
    }
    fn add(&mut self, map: &ProjectMap, id: &str, weight: f64, reason: &str) -> bool {
        if let Ok(index) = map.files.binary_search_by(|f| f.id.as_str().cmp(id)) {
            self.weights[index] += weight;
            self.reasons
                .entry(id.into())
                .or_default()
                .insert(reason.into());
            if reason == "ANCHOR" {
                self.anchors.insert(id.into());
            }
            true
        } else {
            false
        }
    }
    fn warn(&mut self, code: &str, subject: Option<&str>, message: &str) {
        self.diagnostics.push(Diagnostic {
            code: code.into(),
            subject: subject.map(String::from),
            message: message.into(),
        });
    }
    fn symbol(&mut self, map: &ProjectMap, name: &str, weight: f64, reason: &str) {
        let exact = map.symbols.iter().find(|s| s.id == name);
        let symbols: Vec<_> = match exact {
            Some(s) => vec![s],
            None => map.symbols.iter().filter(|s| s.name == name).collect(),
        };
        if symbols.is_empty() {
            self.warn("FKR-CTX-102", Some(name), "ancla de símbolo inexistente");
            return;
        }
        let n = symbols.len();
        if n > 1 {
            self.warn(
                "FKR-CTX-102",
                Some(name),
                "ancla de símbolo ambigua: peso repartido entre candidatos",
            );
        }
        for symbol in symbols {
            self.add(map, symbol.file(), weight / n as f64, reason);
        }
    }
}
/// Reúne las seis fuentes y required_context como anclas débiles.
pub fn build(
    map: &ProjectMap,
    req: &NormalizedRequest,
    inputs: &ContextInputs,
    tokens: &Tokens,
) -> Result<Seeds, ContextError> {
    let params = req.params.clone().unwrap_or_default();
    let mut seeds = Seeds {
        weights: vec![0.0; map.files.len()],
        anchors: BTreeSet::new(),
        reasons: BTreeMap::new(),
        diagnostics: Vec::new(),
    };
    for id in &req.anchors.files {
        if !seeds.add(map, id, params.w_anchor, "ANCHOR") {
            seeds.warn("FKR-CTX-102", Some(id), "ancla de archivo inexistente");
        }
    }
    for name in &req.anchors.symbols {
        seeds.symbol(map, name, params.w_anchor, "ANCHOR");
    }
    for candidate in &tokens.paths {
        let normalized = foker_map::path::normalize_lexical(candidate).ok();
        for file in &map.files {
            if normalized.as_deref() == Some(&file.id)
                || file.id.rsplit('/').next() == Some(candidate.as_str())
            {
                seeds.add(
                    map,
                    &file.id,
                    params.mention_factor * params.w_anchor,
                    "PATH_MENTION",
                );
            }
        }
    }
    for candidate in &tokens.identifiers {
        for symbol in map
            .symbols
            .iter()
            .filter(|s| s.name == *candidate && s.exported != Exported::None)
        {
            seeds.add(
                map,
                symbol.file(),
                params.mention_factor * params.w_anchor,
                "SYMBOL_MENTION",
            );
        }
    }
    for hit in Bm25::new(map).search_with_params(&tokens.terms, &params) {
        seeds.add(
            map,
            &hit.id,
            params.w_lex * hit.score,
            &format!("LEXICAL:{}", hit.terms[0]),
        );
        for term in hit.terms {
            seeds
                .reasons
                .entry(hit.id.clone())
                .or_default()
                .insert(format!("LEXICAL:{term}"));
        }
    }
    if req.dirty_files {
        let ids: BTreeSet<_> = inputs
            .dirty_files
            .iter()
            .map(|id| foker_map::path::normalize_lexical(id))
            .collect::<Result<_, _>>()
            .map_err(|_| ContextError::InvalidInput("dirty_files no normalizable".into()))?;
        for id in ids {
            seeds.add(map, &id, params.w_dirty, "DIRTY");
        }
    }
    if let Some(scope) = &inputs.task_scope {
        let matcher = GlobMatcher::new(&scope.paths, false)
            .map_err(|e| ContextError::InvalidInput(e.to_string()))?;
        for file in &map.files {
            if matcher.is_match(&file.id) {
                seeds.add(map, &file.id, params.w_task_scope, "TASK_SCOPE");
            }
        }
    }
    if let Some(skill) = &inputs.skill {
        let files: BTreeSet<_> = skill
            .required_files
            .iter()
            .map(|id| foker_map::path::normalize_lexical(id))
            .collect::<Result<_, _>>()
            .map_err(|_| ContextError::InvalidInput("required_files no normalizable".into()))?;
        for id in files {
            if !seeds.add(map, &id, params.w_skill, "SKILL_CONTEXT") {
                seeds.warn("FKR-CTX-102", Some(&id), "contexto de skill inexistente");
            }
        }
        let symbols: BTreeSet<_> = skill.required_symbols.iter().collect();
        for name in symbols {
            seeds.symbol(map, name, params.w_skill, "SKILL_CONTEXT");
        }
    }
    if seeds.weights.iter().all(|w| *w == 0.0) {
        seeds.weights = map.files.iter().map(|f| f.rank_global).collect();
        seeds.warn(
            "FKR-CTX-101",
            None,
            "sin semillas: contexto genérico; aporte anclas",
        );
    }
    seeds
        .diagnostics
        .sort_by(|a, b| a.code.cmp(&b.code).then(a.subject.cmp(&b.subject)));
    Ok(seeds)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn anchors_are_additive_and_missing_is_recoverable() {
        let map = &crate::fixture_state().map;
        let mut seeds = Seeds {
            weights: vec![0.0; map.files.len()],
            anchors: BTreeSet::new(),
            reasons: BTreeMap::new(),
            diagnostics: vec![],
        };
        let id = "packages/ui/src/button.tsx";
        assert!(seeds.add(map, id, 1.0, "ANCHOR"));
        assert!(seeds.add(map, id, 0.3, "DIRTY"));
        let index = map.files.iter().position(|f| f.id == id).unwrap();
        assert_eq!(seeds.weights[index], 1.3);
        assert!(seeds.anchors.contains(id));
        assert_eq!(seeds.counts()["ANCHOR"], 1);
        assert!(!seeds.add(map, "missing.ts", 1.0, "ANCHOR"));
        let req = crate::normalize::request(
            &crate::ContextRequest {
                task: "xyzzy".into(),
                ..Default::default()
            },
            &ContextInputs::default(),
        )
        .unwrap();
        let fallback = build(map, &req, &ContextInputs::default(), &Tokens::default()).unwrap();
        assert_eq!(
            fallback.weights,
            map.files.iter().map(|f| f.rank_global).collect::<Vec<_>>()
        );
        assert_eq!(fallback.diagnostics[0].code, "FKR-CTX-101");
    }
}

#[cfg(test)]
mod calibration_tests {
    use super::*;
    #[test]
    fn anchor_weight_is_shared_by_file_symbol_and_mentions() {
        let map = &crate::fixture_state().map;
        let id = "packages/ui/src/button.tsx";
        let symbol = map
            .symbols
            .iter()
            .find(|s| s.file() == id && s.exported != Exported::None)
            .unwrap();
        let request = crate::ContextRequest {
            task: id.into(),
            anchors: crate::Anchors {
                files: vec![id.into()],
                symbols: vec![symbol.id.clone()],
            },
            params: Some(crate::ContextParams {
                w_anchor: 2.0,
                mention_factor: 0.25,
                w_lex: 0.0,
                ..Default::default()
            }),
            ..Default::default()
        };
        let normalized = crate::normalize::request(&request, &ContextInputs::default()).unwrap();
        let seeds = build(
            map,
            &normalized,
            &ContextInputs::default(),
            &crate::normalize::tokenize(id),
        )
        .unwrap();
        let index = map.files.iter().position(|f| f.id == id).unwrap();
        assert_eq!(seeds.weights[index], 4.5);
    }
}
