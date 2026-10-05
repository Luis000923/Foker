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
    let usage = "uso: fixture_b_eval <cases.jsonl> <trees> <salida.json>";
    let cases = std::fs::read_to_string(args.get(1).ok_or(usage)?)?;
    let trees = PathBuf::from(args.get(2).ok_or(usage)?);
    let output = args.get(3).ok_or(usage)?;
    let report = fixture_b::evaluate(&cases, &trees)?;
    std::fs::write(output, serde_json::to_string_pretty(&report)? + "\n")?;
    println!("{}", serde_json::to_string_pretty(&report["summary"])?);
    Ok(())
}
