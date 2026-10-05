//! Rejilla ADR-031: solo calibration, sin ajustar pesos ni consultar validation.
use foker_context::{
    Anchors, ContextInputs, ContextParams, ContextRequest, RenderLevel, build_context,
    estimate_tokens,
};
use foker_map::{
    build::{ParseCache, build},
    config::MapConfig,
};
use serde::Deserialize;
use serde_json::{Value, json};
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
fn median(mut values: Vec<usize>) -> f64 {
    values.sort();
    let middle = values.len() / 2;
    if values.len() % 2 == 1 {
        values[middle] as f64
    } else {
        (values[middle - 1] + values[middle]) as f64 / 2.0
    }
}
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let repo = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
    let args: Vec<_> = std::env::args().collect();
    let fixture =
        PathBuf::from(args.get(1).ok_or(
            "uso: calibrate_compact <fixture-a generada> <baseline-v1.json> <salida.json>",
        )?);
    let baseline: Value = serde_json::from_str(&std::fs::read_to_string(
        args.get(2).ok_or("falta baseline")?,
    )?)?;
    let output = args.get(3).ok_or("falta salida")?;
    let cases = std::fs::read_to_string(repo.join("benchmarks/ctx-gold/cases.jsonl"))?
        .lines()
        .map(serde_json::from_str::<Case>)
        .collect::<Result<Vec<_>, _>>()?
        .into_iter()
        .filter(|c| c.split == "calibration")
        .collect::<Vec<_>>();
    assert_eq!(cases.len(), 30);
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
    let baseline_rows = baseline["rows"].as_array().ok_or("baseline sin rows")?;
    let baseline_recall: BTreeMap<_, _> = baseline_rows
        .iter()
        .filter(|r| r["split"] == "calibration")
        .map(|r| (r["id"].as_str().unwrap(), r["recall"].as_f64().unwrap()))
        .collect();
    let mut results = Vec::new();
    // Rejilla fija antes de medir: máximos más amplios en refactor/explain; anclas excluidas del límite.
    for fraction in [0.0, 0.01, 0.025, 0.05, 0.1, 0.2] {
        for limit in [8, 16, 32, 64, 128, 512] {
            for outlines in [0, 5] {
                let params = ContextParams {
                    sufficiency_fraction: fraction,
                    related_limits: [limit, limit, limit * 3 / 2, limit, limit, limit * 3 / 2],
                    outline_limits: [
                        outlines,
                        outlines,
                        outlines * 2,
                        outlines,
                        outlines,
                        outlines * 2,
                    ],
                    core_min_relative: 0.1,
                    ..Default::default()
                };
                let mut rows = Vec::new();
                for case in &cases {
                    let request = ContextRequest {
                        task: case.task.clone(),
                        anchors: case.anchors.clone(),
                        params: Some(params.clone()),
                        ..Default::default()
                    };
                    let pack = build_context(
                        &states[case.fixture.as_str()],
                        &roots[case.fixture.as_str()],
                        &request,
                        &ContextInputs::default(),
                    )?;
                    let exposed: Vec<_> = pack
                        .files
                        .iter()
                        .filter(|f| f.level != RenderLevel::L0)
                        .map(|f| &f.id)
                        .collect();
                    let recall = case
                        .gold_modified
                        .iter()
                        .filter(|id| exposed.contains(id))
                        .count() as f64
                        / case.gold_modified.len() as f64;
                    rows.push(json!({"id": case.id, "recall": recall, "tokens": pack.budget.used, "rendered_tokens": estimate_tokens(&pack.rendered)}));
                }
                let recall = rows
                    .iter()
                    .map(|r| r["recall"].as_f64().unwrap())
                    .sum::<f64>()
                    / rows.len() as f64;
                let regressions: Vec<_> = rows
                    .iter()
                    .filter(|r| {
                        r["recall"].as_f64().unwrap() < baseline_recall[r["id"].as_str().unwrap()]
                    })
                    .map(|r| r["id"].clone())
                    .collect();
                let tokens: Vec<_> = rows
                    .iter()
                    .map(|r| r["tokens"].as_u64().unwrap() as usize)
                    .collect();
                let rendered: Vec<_> = rows
                    .iter()
                    .map(|r| r["rendered_tokens"].as_u64().unwrap() as usize)
                    .collect();
                results.push(json!({"fraction": fraction, "limit": limit, "outlines": outlines, "core_min_relative": 0.1, "params": params, "recall": recall,
                    "median_tokens": median(tokens.clone()), "mean_tokens": tokens.iter().sum::<usize>() as f64 / tokens.len() as f64,
                    "median_rendered_tokens": median(rendered.clone()), "mean_rendered_tokens": rendered.iter().sum::<usize>() as f64 / rendered.len() as f64,
                    "regressions": regressions, "rows": rows}));
            }
        }
    }
    let chosen = results
        .iter()
        .enumerate()
        .filter(|(_, r)| r["regressions"].as_array().unwrap().is_empty())
        .min_by(|(_, a), (_, b)| {
            a["median_rendered_tokens"]
                .as_f64()
                .unwrap()
                .total_cmp(&b["median_rendered_tokens"].as_f64().unwrap())
                .then(
                    a["mean_rendered_tokens"]
                        .as_f64()
                        .unwrap()
                        .total_cmp(&b["mean_rendered_tokens"].as_f64().unwrap()),
                )
                .then(
                    b["recall"]
                        .as_f64()
                        .unwrap()
                        .total_cmp(&a["recall"].as_f64().unwrap()),
                )
        })
        .map(|(index, _)| index)
        .ok_or("ninguna configuración sin regresiones calibration")?;
    let report = json!({"split": "calibration", "chosen": chosen, "results": results});
    std::fs::write(
        output,
        format!("{}\n", serde_json::to_string_pretty(&report)?),
    )?;
    println!("{}", report["results"][chosen]);
    Ok(())
}
