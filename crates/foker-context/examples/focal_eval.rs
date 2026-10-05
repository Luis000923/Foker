//! Evaluación de la vista focal (ADR-033) sobre ctx-gold de símbolos (FKR-095).
//! Uso: focal_eval <cases.jsonl> <dir con un árbol por commit padre> <salida.json> [umbral...]
//! Cada caso usa sus gold_modified como anclas (evaluación condicionada al archivo): mide si el
//! texto completo de cada gold_symbol llega en rendered y cuánto cuesta cada ancla.
use foker_context::{Anchors, ContextInputs, ContextParams, ContextRequest, build_context, render};
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
    commit: String,
    task: String,
    split: String,
    gold_modified: Vec<String>,
    gold_symbols: Vec<String>,
}

#[path = "support/delivery.rs"]
mod delivery;
use delivery::delivered_in_file;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().collect();
    let usage = "uso: focal_eval <cases.jsonl> <trees> <salida.json> [umbral...]";
    let cases = std::fs::read_to_string(args.get(1).ok_or(usage)?)?;
    let trees = PathBuf::from(args.get(2).ok_or(usage)?);
    let output = args.get(3).ok_or(usage)?;
    let thresholds: Vec<usize> = if args.len() > 4 {
        args[4..]
            .iter()
            .map(|a| a.parse())
            .collect::<Result<_, _>>()?
    } else {
        vec![0, 500, 1000, 2000]
    };
    let mut rows = Vec::new();
    let mut states = BTreeMap::new();
    for line in cases.lines() {
        let case: Case = serde_json::from_str(line)?;
        let root = trees.join(&case.commit);
        if !states.contains_key(&case.commit) {
            states.insert(
                case.commit.clone(),
                build(&root, &MapConfig::default(), &mut ParseCache::new())?,
            );
        }
        let state = &states[&case.commit];
        // Texto completo de cada símbolo gold en el árbol del padre, con el mismo escape que
        // rendered. Un gold ausente del mapa es un error de integridad del dataset.
        let mut gold_text = BTreeMap::new();
        for id in &case.gold_symbols {
            let symbol = state
                .map
                .symbols
                .iter()
                .find(|s| &s.id == id)
                .ok_or_else(|| format!("{}: gold_symbol ausente del mapa: {id}", case.id))?;
            let source = std::fs::read_to_string(root.join(symbol.file()))?.replace("\r\n", "\n");
            let lines: Vec<_> = source.split('\n').collect();
            let text =
                lines[symbol.range.start.line as usize..=symbol.range.end.line as usize].join("\n");
            gold_text.insert(id.clone(), (symbol.file().to_owned(), render::data(&text)));
        }
        // Informativo: recall de archivos sin anclas (repositorio real, sin vista focal posible).
        let open = ContextRequest {
            task: case.task.clone(),
            budget_tokens: 8000,
            ..Default::default()
        };
        if let Ok(pack) = build_context(state, &root, &open, &ContextInputs::default()) {
            let exposed = pack
                .files
                .iter()
                .filter(|f| f.level.as_str() != "L0")
                .filter(|f| case.gold_modified.contains(&f.id))
                .count();
            rows.push(json!({
                "id": case.id, "split": case.split, "threshold": "sin_anclas",
                "file_recall": exposed as f64 / case.gold_modified.len() as f64,
                "pack_tokens": pack.budget.used,
            }));
        }
        for &threshold in &thresholds {
            let request = ContextRequest {
                task: case.task.clone(),
                anchors: Anchors {
                    files: case.gold_modified.clone(),
                    symbols: vec![],
                },
                budget_tokens: 8000,
                params: Some(ContextParams {
                    focal_min_tokens: threshold,
                    ..Default::default()
                }),
                ..Default::default()
            };
            let row = match build_context(state, &root, &request, &ContextInputs::default()) {
                Ok(pack) => {
                    // Solo cuenta si el texto completo está en el bloque de su propio archivo.
                    let delivered = gold_text
                        .values()
                        .filter(|(file, text)| {
                            let level = pack
                                .files
                                .iter()
                                .find(|f| f.id == *file)
                                .map(|f| f.level.as_str());
                            delivered_in_file(&pack.rendered, file, level, text)
                        })
                        .count();
                    let anchors: Vec<Value> = pack
                        .files
                        .iter()
                        .filter(|f| case.gold_modified.contains(&f.id))
                        .map(|f| json!({"id": f.id, "level": f.level.as_str(), "tokens": f.tokens, "note": f.note}))
                        .collect();
                    json!({
                        "id": case.id, "split": case.split, "threshold": threshold,
                        "symbol_recall": if gold_text.is_empty() { Value::Null } else { json!(delivered as f64 / gold_text.len() as f64) },
                        "gold_symbols_found": gold_text.len(),
                        "anchor_tokens": anchors.iter().map(|a| a["tokens"].as_u64().unwrap()).sum::<u64>(),
                        "pack_tokens": pack.budget.used,
                        "anchors": anchors,
                    })
                }
                Err(error) => {
                    json!({"id": case.id, "split": case.split, "threshold": threshold, "error": error.to_string()})
                }
            };
            rows.push(row);
        }
    }
    std::fs::write(
        output,
        serde_json::to_string_pretty(&json!({"rows": rows}))?,
    )?;
    Ok(())
}
