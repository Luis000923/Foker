//! Ablación del render de fase 1: las 32 combinaciones, sin reconstruir selección.
use foker_context::{PackSection, compact, estimate_tokens, render::SectionText};
use serde_json::{Value, json};

fn sections(text: &str) -> Vec<SectionText> {
    let mut result = Vec::new();
    let mut current = String::new();
    let mut id = String::new();
    let mut wrapper = false;
    let flush = |result: &mut Vec<SectionText>, current: &mut String, id: &str| {
        if !current.is_empty() {
            result.push(SectionText {
                section: PackSection {
                    id: id.into(),
                    class: "mandatory".into(),
                    stability: "task".into(),
                    tokens: estimate_tokens(current),
                    hash: String::new(),
                },
                text: std::mem::take(current),
            });
        }
    };
    for line in text.split_inclusive('\n') {
        if !wrapper && let Some(heading) = line.strip_prefix("## ") {
            flush(&mut result, &mut current, &id);
            id = heading.trim().to_owned();
        }
        if line.starts_with("<foker:") {
            wrapper = true;
        }
        if line.starts_with("</foker:") {
            wrapper = false;
        }
        current.push_str(line);
    }
    flush(&mut result, &mut current, &id);
    result
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().collect();
    let input: Value = serde_json::from_slice(&std::fs::read(
        args.get(1).ok_or("informe fase 1 requerido")?,
    )?)?;
    let rows = input["rows"].as_array().ok_or("filas ausentes")?;
    let mut experiments = Vec::new();
    for mask in 0_u8..32 {
        let options = compact::Options {
            patterns: mask & 1 != 0,
            rules: mask & 2 != 0,
            request: mask & 4 != 0,
            wrappers: mask & 8 != 0,
            inline: mask & 16 != 0,
        };
        let mut output = Vec::new();
        for row in rows {
            let before = row["rendered"].as_str().ok_or("rendered ausente")?;
            let parts: Vec<_> = sections(before)
                .into_iter()
                .map(|s| compact::section(s, options))
                .collect();
            let rendered: String = parts.iter().map(|s| s.text.as_str()).collect();
            let used: usize = parts.iter().map(|s| s.section.tokens).sum();
            assert!(rendered.len() <= before.len());
            assert!(estimate_tokens(&rendered) <= used);
            output.push(json!({
                "id": row["id"], "split": row["split"], "recall": row["recall"],
                "tokens": used, "rendered_tokens": estimate_tokens(&rendered), "rendered": rendered,
            }));
        }
        experiments.push(json!({"mask": mask, "rows": output}));
    }
    std::fs::write(
        args.get(2).ok_or("salida requerida")?,
        serde_json::to_vec(&experiments)?,
    )?;
    Ok(())
}
