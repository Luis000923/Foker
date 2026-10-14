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
/// Límites npm: una mención de @scope/name-extra no nombra @scope/name.
fn mentions_package(task: &str, name: &str) -> bool {
    let package_char = |c: char| c.is_ascii_alphanumeric() || "@/._-".contains(c);
    !name.is_empty()
        && task.match_indices(name).any(|(start, _)| {
            !task[..start].chars().next_back().is_some_and(package_char)
                && !task[start + name.len()..]
                    .chars()
                    .next()
                    .is_some_and(package_char)
        })
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
    let named_packages: BTreeSet<&str> = if params.package_mentions {
        map.packages
            .iter()
            .filter(|p| mentions_package(&req.task, &p.name))
            .map(|p| p.id.as_str())
            .collect()
    } else {
        BTreeSet::new()
    };
    fn restrict<'a>(
        map: &ProjectMap,
        named_packages: &BTreeSet<&str>,
        ids: Vec<&'a str>,
    ) -> Vec<&'a str> {
        if named_packages.is_empty() {
            return ids;
        }
        let packages: BTreeSet<_> = ids
            .iter()
            .filter_map(|id| map.files.iter().find(|f| f.id == *id))
            .filter_map(|f| f.package.as_deref())
            .collect();
        if packages.len() > 1 && packages.iter().any(|p| named_packages.contains(p)) {
            ids.into_iter()
                .filter(|id| {
                    map.files.iter().any(|f| {
                        f.id == *id
                            && f.package
                                .as_deref()
                                .is_some_and(|p| named_packages.contains(p))
                    })
                })
                .collect()
        } else {
            ids
        }
    }
    for candidate in &tokens.paths {
        let normalized = foker_map::path::normalize_lexical(candidate).ok();
        let ids = map
            .files
            .iter()
            .filter(|file| {
                normalized.as_deref() == Some(&file.id)
                    || file.id.rsplit('/').next() == Some(candidate.as_str())
            })
            .map(|f| f.id.as_str())
            .collect();
        for id in restrict(map, &named_packages, ids) {
            seeds.add(
                map,
                id,
                params.mention_factor * params.w_anchor,
                "PATH_MENTION",
            );
        }
    }
    for candidate in &tokens.identifiers {
        let ids = map
            .symbols
            .iter()
            .filter(|s| s.name == *candidate && s.exported != Exported::None)
            .map(|s| s.file())
            .collect();
        for id in restrict(map, &named_packages, ids) {
            seeds.add(
                map,
                id,
                params.mention_factor * params.w_anchor,
                "SYMBOL_MENTION",
            );
        }
    }
    let terms = if params.lexical_expansion {
        crate::normalize::expand_terms(&tokens.terms)
    } else {
        tokens.terms.clone()
    };
    for hit in
        Bm25::with_folding(map, params.inflection_folding).search_with_params(&terms, &params)
    {
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
        // ADR-032: el alcance es una región, no n señales independientes. Reparte una masa
        // total w_task_scope (como un ancla ambigua, 1/n) para no diluir la evidencia léxica.
        let matched: Vec<_> = map
            .files
            .iter()
            .filter(|file| matcher.is_match(&file.id))
            .map(|file| file.id.as_str())
            .collect();
        let weight = params.w_task_scope / matched.len().max(1) as f64;
        for id in matched {
            seeds.add(map, id, weight, "TASK_SCOPE");
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
