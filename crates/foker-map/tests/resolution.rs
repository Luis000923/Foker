//! REQ-MAP-004 (FKR-023): resolución sobre `fixtures/resolution-cases` contra `expected/resolution.json`.

use std::collections::BTreeMap;
use std::path::Path;

use foker_map::config::MapConfig;
use foker_map::discover::{Language, discover};
use foker_map::parse::parse_source;
use foker_map::project::load_workspace;
use foker_map::resolve::{Outcome, ResolverSet};

fn render(outcome: &Outcome) -> String {
    match outcome {
        Outcome::File(id) => format!("file:{id}"),
        Outcome::External(m) => format!("external:{m}"),
        Outcome::NotSource(id) => format!("not-source:{id}"),
        Outcome::Unresolved(_) => "unresolved".into(),
    }
}

fn resolve_fixture(name: &str) -> BTreeMap<String, BTreeMap<String, String>> {
    let root = std::fs::canonicalize(
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../fixtures")
            .join(name),
    )
    .unwrap();
    let config = MapConfig::default();
    let discovery = discover(&root, &config).unwrap();
    let workspace = load_workspace(&discovery, name, false);
    let set = ResolverSet::new(&root, &discovery, &workspace, &config).unwrap();
    let mut out: BTreeMap<String, BTreeMap<String, String>> = BTreeMap::new();
    for source in &discovery.sources {
        let parsed = parse_source(
            &source.id,
            Language::from_id(&source.id).unwrap(),
            &std::fs::read(&source.path).unwrap(),
        );
        for import in &parsed.imports {
            let outcome = set.resolve(&source.id, &import.specifier);
            out.entry(source.id.clone())
                .or_default()
                .insert(import.specifier.clone(), render(&outcome));
        }
    }
    out
}

#[test]
fn resolution_cases_match_golden() {
    let actual = resolve_fixture("resolution-cases");
    let golden_path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../fixtures/resolution-cases/expected/resolution.json");
    let golden: BTreeMap<String, BTreeMap<String, String>> =
        serde_json::from_str(&std::fs::read_to_string(golden_path).unwrap()).unwrap();
    assert_eq!(actual, golden);
}

#[test]
fn monorepo_pnpm_resolves_workspace_and_paths() {
    let actual = resolve_fixture("monorepo-pnpm");
    let page = &actual["apps/web/src/app/page.tsx"];
    assert_eq!(page["@mono/ui"], "file:packages/ui/src/index.ts");
    assert_eq!(page["@/lib/format"], "file:apps/web/src/lib/format.ts");
    assert_eq!(page["@mono/core"], "file:packages/core/src/index.ts");
    let core = &actual["packages/core/src/index.ts"];
    assert_eq!(core["./cart/cart"], "file:packages/core/src/cart/cart.ts");
    assert_eq!(
        core["./legacy/total.cjs"],
        "file:packages/core/src/legacy/total.cjs"
    );
    assert_eq!(
        actual["packages/ui/src/button.tsx"]["react"],
        "external:npm:react"
    );
    assert_eq!(
        actual["apps/web/src/app/dashboard/page.tsx"]["../../lib/stats"],
        "file:apps/web/src/lib/stats.ts"
    );
}
