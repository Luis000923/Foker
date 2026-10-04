//! PPR compartido con foker-map, boost de tests y exclusiones duras.
use crate::{Intent, seeds::Seeds};
use foker_map::{
    canonical::round12,
    model::{FileKind, ProjectMap},
    pagerank::WeightedGraph,
    parse::ParseStatus,
};
use std::collections::{BTreeMap, BTreeSet};
/// Candidato puntuado.
#[derive(Debug, Clone)]
pub struct Candidate {
    /// Id.
    pub id: String,
    /// Puntuación redondeada.
    pub score: f64,
    /// Razones.
    pub reasons: Vec<String>,
    /// Ancla explícita.
    pub anchor: bool,
}
/// Un mapa construido ya excluye secretos y archivos fuera de include.
pub fn eligible(file: &foker_map::model::MapFile) -> bool {
    file.kind != FileKind::Generated && file.parse_status != ParseStatus::Skipped
}
/// Ordena candidatos por PPR descendente, id ascendente.
pub fn rank(map: &ProjectMap, seeds: &Seeds, intent: Intent) -> Vec<Candidate> {
    rank_with_params(map, seeds, intent, &crate::ContextParams::default())
}
/// Ranking parametrizado para calibración interna.
pub fn rank_with_params(
    map: &ProjectMap,
    seeds: &Seeds,
    intent: Intent,
    params: &crate::ContextParams,
) -> Vec<Candidate> {
    let ids: Vec<_> = map.files.iter().map(|f| f.id.as_str()).collect();
    let scores = WeightedGraph::from_map_edges(&ids, &map.edges, params.reverse(intent))
        .pagerank(Some(&seeds.weights));
    let mut reasons_by_file = seeds.reasons.clone();
    let kinds: BTreeMap<_, _> = map.files.iter().map(|f| (f.id.as_str(), f.kind)).collect();
    let mut test_anchors = BTreeSet::new();
    for edge in &map.edges {
        if !matches!(
            edge.kind,
            foker_map::model::EdgeKind::Imports
                | foker_map::model::EdgeKind::ImportsType
                | foker_map::model::EdgeKind::Reexports
                | foker_map::model::EdgeKind::UsesSymbol
        ) {
            continue;
        }
        let from = edge.from.split('#').next().unwrap_or(&edge.from);
        let to = edge.to.split('#').next().unwrap_or(&edge.to);
        if seeds.reasons.contains_key(from) {
            reasons_by_file
                .entry(to.into())
                .or_default()
                .insert(format!("DEPENDENCY_OF:{from}"));
        }
        if seeds.reasons.contains_key(to) {
            reasons_by_file
                .entry(from.into())
                .or_default()
                .insert(format!("DEPENDENT_OF:{to}"));
        }
        if kinds.get(from) == Some(&FileKind::Test) && seeds.anchors.contains(to) {
            reasons_by_file
                .entry(from.into())
                .or_default()
                .insert(format!("TEST_OF:{to}"));
            test_anchors.insert(from);
        }
    }
    let mut candidates = Vec::new();
    for (file, score) in map.files.iter().zip(scores) {
        if !eligible(file) {
            continue;
        }
        let mut reasons = reasons_by_file.remove(&file.id).unwrap_or_default();
        let test_of_anchor = test_anchors.contains(file.id.as_str());
        // Un candidato sin señal directa puede alcanzarse por varios saltos o por el prior global.
        if reasons.is_empty() {
            reasons = BTreeSet::from(["CORE".into()]);
        }
        candidates.push(Candidate {
            id: file.id.clone(),
            score: round12(
                score
                    * if file.kind == FileKind::Test && (intent == Intent::Test || test_of_anchor) {
                        params.test_factor
                    } else {
                        1.0
                    },
            ),
            reasons: reasons.into_iter().collect(),
            anchor: seeds.anchors.contains(&file.id),
        });
    }
    candidates.sort_by(|a, b| b.score.total_cmp(&a.score).then(a.id.cmp(&b.id)));
    candidates
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn ppr_order_and_hard_exclusions() {
        let mut map = crate::fixture_state().map.clone();
        let req = crate::normalize::request(
            &crate::ContextRequest {
                task: "xyzzy".into(),
                anchors: crate::Anchors {
                    files: vec!["packages/ui/src/button.tsx".into()],
                    symbols: vec![],
                },
                ..Default::default()
            },
            &crate::ContextInputs::default(),
        )
        .unwrap();
        let seeds = crate::seeds::build(
            &map,
            &req,
            &crate::ContextInputs::default(),
            &crate::normalize::Tokens::default(),
        )
        .unwrap();
        let ranked = rank(&map, &seeds, Intent::Add);
        assert_eq!(ranked.len(), map.files.len());
        assert!(
            ranked
                .windows(2)
                .all(|p| p[0].score > p[1].score || p[0].score == p[1].score && p[0].id < p[1].id)
        );
        let removed = map.files[0].id.clone();
        map.files[0].kind = FileKind::Generated;
        assert!(
            !rank(&map, &seeds, Intent::Add)
                .iter()
                .any(|c| c.id == removed)
        );
        map.files[0].kind = FileKind::Source;
        map.files[0].parse_status = ParseStatus::Skipped;
        assert!(
            !rank(&map, &seeds, Intent::Add)
                .iter()
                .any(|c| c.id == removed)
        );
    }
}
