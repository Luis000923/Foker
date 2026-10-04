//! FKR-022: snapshots de la extracción sobre `fixtures/monorepo-pnpm` y `fixtures/edge-cases`.

use std::path::Path;

use foker_map::config::MapConfig;
use foker_map::discover::{Language, discover};
use foker_map::parse::{Imported, ParseStatus, parse_source};
use serde_json::{Value, json};

fn fixture(name: &str) -> std::path::PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../fixtures")
        .join(name)
}

fn extract(root: &Path) -> Value {
    let found = discover(root, &MapConfig::default()).unwrap();
    let files: Vec<Value> = found
        .sources
        .iter()
        .map(|c| {
            let bytes = std::fs::read(&c.path).unwrap();
            let parsed = parse_source(&c.id, Language::from_id(&c.id).unwrap(), &bytes);
            json!({
                "id": c.id,
                "parse_status": parsed.status.as_str(),
                "lines": parsed.lines,
                "symbols": parsed.symbols.iter().map(|s| json!({
                    "id": format!("{}#{}", c.id, s.qualified),
                    "name": s.name,
                    "kind": s.kind.as_str(),
                    "tags": s.tags,
                    "exported": s.exported.as_str(),
                    "signature": s.signature,
                    "doc": s.doc,
                    "range": [s.range.start.line, s.range.start.col, s.range.end.line, s.range.end.col],
                    "parent": s.parent,
                })).collect::<Vec<_>>(),
                "imports": parsed.imports.iter().map(|i| json!({
                    "specifier": i.specifier,
                    "kind": format!("{:?}", i.kind),
                    "type_only": i.type_only,
                    "bindings": i.bindings.iter().map(|b| {
                        let imported = match &b.imported {
                            Imported::Default => "default".to_owned(),
                            Imported::Namespace => "*".to_owned(),
                            Imported::Named(n) => n.clone(),
                        };
                        format!("{imported}{}{}", b.local.as_ref().map(|l| format!(" as {l}")).unwrap_or_default(), if b.type_only { " (type)" } else { "" })
                    }).collect::<Vec<_>>(),
                })).collect::<Vec<_>>(),
                "exports": parsed.exports.iter().map(|e| json!([e.exported, e.local, e.source, e.type_only])).collect::<Vec<_>>(),
                "import_refs": parsed.import_refs,
            })
        })
        .collect();
    json!({ "files": files, "oversized": found.oversized })
}

#[test]
fn monorepo_pnpm() {
    insta::assert_json_snapshot!(extract(&fixture("monorepo-pnpm")));
}

#[test]
fn edge_cases() {
    insta::assert_json_snapshot!(extract(&fixture("edge-cases")));
}

#[test]
fn edge_cases_generated_at_test_time() {
    // Casos que no se versionan: archivo > 1 MiB y nombres que dependen del sistema de archivos.
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    std::fs::write(root.join("big.ts"), "export const x = 1;\n".repeat(60_000)).unwrap();
    std::fs::write(root.join("cafe\u{301}.ts"), "export const nfd = 1;\n").unwrap();
    let found = discover(root, &MapConfig::default()).unwrap();
    assert_eq!(found.oversized, ["big.ts"]);
    let ids: Vec<_> = found.sources.iter().map(|c| c.id.as_str()).collect();
    assert_eq!(ids, ["big.ts", "caf\u{e9}.ts"]);
    let nfd = &found.sources[1];
    let parsed = parse_source(
        &nfd.id,
        Language::TypeScript,
        &std::fs::read(&nfd.path).unwrap(),
    );
    assert_eq!(parsed.status, ParseStatus::Ok);
    assert_eq!(parsed.symbols[0].name, "nfd");
}
