//! Barrera ADR-036: los 60 casos fijos de Fixture A, sin selección ni ajuste de parámetros.
//! Uso: fixture_a_barrier <fixture-a generada> <configs.json> <salida.json>
#[path = "support/delivery.rs"]
mod delivery;
#[path = "support/fixture_b.rs"]
mod fixture_b;
use foker_map::{
    build::{ParseCache, build},
    config::MapConfig,
};
use serde_json::json;
use std::{collections::BTreeMap, path::PathBuf};
fn main() -> Result<(), fixture_b::Error> {
    let args: Vec<_> = std::env::args().collect();
    let repo = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
    let roots = BTreeMap::from([
        (
            "fixture-a".to_string(),
            PathBuf::from(args.get(1).ok_or("fixture-a requerida")?),
        ),
        (
            "monorepo-pnpm".to_string(),
            repo.join("fixtures/monorepo-pnpm"),
        ),
    ]);
    let extra: Vec<fixture_b::Config> = serde_json::from_str(&std::fs::read_to_string(
        args.get(2).ok_or("configs requeridas")?,
    )?)?;
    let mut configs = fixture_b::configs();
    configs.extend(extra);
    let mut states = BTreeMap::new();
    for (name, root) in &roots {
        states.insert(
            name.clone(),
            build(root, &MapConfig::default(), &mut ParseCache::new())?,
        );
    }
    let mut rows = Vec::new();
    for line in std::fs::read_to_string(repo.join("benchmarks/ctx-gold/cases.jsonl"))?.lines() {
        let value: serde_json::Value = serde_json::from_str(line)?;
        let case: fixture_b::Case = serde_json::from_value(value.clone())?;
        if std::env::var_os("FOKER_EVAL_PROGRESS").is_some() {
            eprintln!("evaluando {}", case.id);
        }
        let fixture = value["fixture"].as_str().ok_or("fixture ausente")?;
        let state = &states[fixture];
        let files: Vec<_> = state.map.files.iter().map(|f| f.id.clone()).collect();
        let mut results = serde_json::Map::new();
        for config in &configs {
            if let Some(params) = &config.params {
                params.validate()?;
            }
            results.insert(
                config.name.clone(),
                fixture_b::evaluate_config(state, &roots[fixture], &case, config, &[], &files),
            );
        }
        rows.push(json!({"id": case.id, "gold_modified": case.gold_modified, "configs": results}));
    }
    if rows.len() != 60 {
        return Err("se requieren los 60 casos".into());
    }
    let mut summaries = serde_json::Map::new();
    for config in &configs {
        let entries: Vec<_> = rows.iter().map(|r| &r["configs"][&config.name]).collect();
        let losses: Vec<_> = rows
            .iter()
            .filter(|r| {
                r["gold_modified"].as_array().unwrap().iter().any(|id| {
                    r["configs"]["default"]["pack"]["exposed"]
                        .as_array()
                        .is_some_and(|e| e.contains(id))
                        && !r["configs"][&config.name]["pack"]["exposed"]
                            .as_array()
                            .is_some_and(|e| e.contains(id))
                })
            })
            .map(|r| r["id"].clone())
            .collect();
        summaries.insert(
            config.name.clone(),
            json!({"metrics": fixture_b::summarize(&entries), "gold_losses": losses}),
        );
    }
    // Estas funciones pertenecen al evaluador B; mantener este ejemplo compatible con su soporte.
    let _ = fixture_b::evaluate
        as fn(&str, &std::path::Path) -> Result<serde_json::Value, fixture_b::Error>;
    let report = json!({"summary": summaries, "cases": rows});
    std::fs::write(
        args.get(3).ok_or("salida requerida")?,
        serde_json::to_vec_pretty(&report)?,
    )?;
    println!("{}", serde_json::to_string_pretty(&report["summary"])?);
    Ok(())
}
