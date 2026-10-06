//! Evaluación offline de Fixture B (FKR-014, ADR-035). Solo mide; no ajusta el motor.
//! Uso: fixture_b_eval <cases.jsonl> <trees> <salida.json>
//! `cases.jsonl` y `<trees>/<id>` proceden de benchmarks/fixture-b/ctx-gold.mjs.
#[path = "support/delivery.rs"]
mod delivery;
#[path = "support/fixture_b.rs"]
mod fixture_b;

use std::path::PathBuf;

fn main() -> Result<(), fixture_b::Error> {
    let args: Vec<_> = std::env::args().collect();
    let usage = "uso: fixture_b_eval <cases.jsonl> <trees> <salida.json> [configs.json] [split]";
    let cases = std::fs::read_to_string(args.get(1).ok_or(usage)?)?;
    let trees = PathBuf::from(args.get(2).ok_or(usage)?);
    let output = args.get(3).ok_or(usage)?;
    let extra: Vec<fixture_b::Config> = args
        .get(4)
        .map(|path| {
            Ok::<_, fixture_b::Error>(serde_json::from_str(&std::fs::read_to_string(path)?)?)
        })
        .transpose()?
        .unwrap_or_default();
    let split = args.get(5).map(String::as_str);
    if split.is_some_and(|s| !["calibration", "validation"].contains(&s)) {
        return Err("split inválido".into());
    }
    let report = if extra.is_empty() && split.is_none() {
        fixture_b::evaluate(&cases, &trees)?
    } else {
        fixture_b::evaluate_with_configs(&cases, &trees, &extra, split)?
    };
    std::fs::write(output, serde_json::to_string_pretty(&report)? + "\n")?;
    println!("{}", serde_json::to_string_pretty(&report["summary"])?);
    Ok(())
}
