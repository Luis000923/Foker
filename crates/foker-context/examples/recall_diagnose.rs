//! Diagnóstico de recall por caso ctx-gold (FKR-091): semillas, rango y corte que excluye cada gold.
//! Uso: recall_diagnose <fixture-a generada> [split]
use foker_context::{
    Anchors, ContextInputs, ContextParams, ContextRequest, normalize, rank, seeds,
};
use foker_map::{
    build::{ParseCache, build},
    config::MapConfig,
};
use serde::Deserialize;
use std::{collections::BTreeMap, path::PathBuf};

#[derive(Deserialize)]
struct Case {
    id: String,
    fixture: String,
    task: String,
    split: String,
    #[serde(default)]
    anchors: Anchors,
    gold_modified: Vec<String>,
}
const DIRECT: [&str; 4] = ["ANCHOR", "PATH_MENTION", "SYMBOL_MENTION", "LEXICAL:"];

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let repo = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
    let args: Vec<_> = std::env::args().collect();
    let fixture = PathBuf::from(
        args.get(1)
            .ok_or("uso: recall_diagnose <fixture-a> [split]")?,
    );
    let split = args.get(2).cloned();
    let roots = BTreeMap::from([
        ("fixture-a", fixture),
        ("monorepo-pnpm", repo.join("fixtures/monorepo-pnpm")),
    ]);
    let mut states = BTreeMap::new();
    for (id, root) in &roots {
        states.insert(
            *id,
            build(root, &MapConfig::default(), &mut ParseCache::new())?,
        );
    }
    let params = ContextParams::default();
    for line in std::fs::read_to_string(repo.join("benchmarks/ctx-gold/cases.jsonl"))?.lines() {
        let case: Case = serde_json::from_str(line)?;
        if split.as_ref().is_some_and(|s| *s != case.split) {
            continue;
        }
        let state = &states[case.fixture.as_str()];
        let request = ContextRequest {
            task: case.task.clone(),
            anchors: case.anchors.clone(),
            ..Default::default()
        };
        let inputs = ContextInputs::default();
        let normalized = normalize::request(&request, &inputs)?;
        let intent = foker_context::intent::infer(&normalized.task);
        let tokens = normalize::tokenize(&normalized.task);
        let seeds = seeds::build(&state.map, &normalized, &inputs, &tokens)?;
        let ranked = rank::rank_with_params(&state.map, &seeds, intent, &params);
        let max = ranked.first().map_or(1.0, |c| c.score);
        let best = ranked.iter().find(|c| !c.anchor).map_or(1.0, |c| c.score);
        println!(
            "{} [{}] {:?} terms={:?}",
            case.id, case.split, intent, tokens.terms
        );
        for gold in &case.gold_modified {
            let Some(pos) = ranked.iter().position(|c| &c.id == gold) else {
                println!("   {gold}: AUSENTE_DEL_MAPA");
                continue;
            };
            let c = &ranked[pos];
            let direct = c
                .reasons
                .iter()
                .any(|r| DIRECT.iter().any(|d| r.starts_with(d)));
            let cut = if c.anchor {
                "ancla"
            } else if c.score < params.relevance_fraction * max {
                "RELEVANCE_1%"
            } else if c.score < params.sufficiency_fraction * best {
                "SUFFICIENCY_2.5%"
            } else {
                "pasa_cortes"
            };
            println!(
                "   {gold}: rank {}/{} rel_max {:.4} rel_best {:.4} direct={direct} {cut} {:?}",
                pos + 1,
                ranked.len(),
                c.score / max,
                c.score / best,
                c.reasons.iter().take(4).collect::<Vec<_>>()
            );
        }
    }
    Ok(())
}
