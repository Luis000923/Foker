//! FKR-024/025: grafo, PageRank, serialización canónica y `content_hash`.

use std::path::{Path, PathBuf};

use foker_map::build::{ParseCache, build};
use foker_map::config::MapConfig;
use foker_map::model::EdgeKind;
use serde_json::{Map, Value};

fn fixture(name: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../fixtures")
        .join(name)
}

/// Copia con las claves de cada objeto ordenadas, para un dorado legible y estable.
fn sorted(value: &Value) -> Value {
    match value {
        Value::Object(map) => {
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort();
            let mut out = Map::new();
            for key in keys {
                out.insert(key.clone(), sorted(&map[key]));
            }
            Value::Object(out)
        }
        Value::Array(items) => Value::Array(items.iter().map(sorted).collect()),
        other => other.clone(),
    }
}

/// Compara con `fixtures/<name>/expected/<file>`; con `UPDATE_SNAPSHOTS=1` lo reescribe.
fn golden(name: &str, file: &str, actual: &str) {
    let path = fixture(name).join("expected").join(file);
    if std::env::var("UPDATE_SNAPSHOTS").as_deref() == Ok("1") {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, actual).unwrap();
        return;
    }
    let expected = std::fs::read_to_string(&path).unwrap_or_default();
    assert!(
        expected == actual,
        "{} difiere del dorado; revisa el cambio y regenera con UPDATE_SNAPSHOTS=1",
        path.display()
    );
}

#[test]
fn monorepo_pnpm_matches_golden_map_and_hash() {
    let state = build(
        &fixture("monorepo-pnpm"),
        &MapConfig::default(),
        &mut ParseCache::new(),
    )
    .unwrap();
    let pretty = serde_json::to_string_pretty(&sorted(&state.map.to_value(true))).unwrap() + "\n";
    golden("monorepo-pnpm", "project-map.json", &pretty);
    // REQ-MAP-002: el mismo hash en Linux, macOS y Windows (CI compara este archivo en los 3 SO).
    golden(
        "monorepo-pnpm",
        "content_hash.txt",
        &format!("{}\n", state.map.content_hash),
    );
}

#[test]
fn builds_are_deterministic_and_reuse_the_parse_cache() {
    let root = fixture("monorepo-pnpm");
    let mut cache = ParseCache::new();
    let first = build(&root, &MapConfig::default(), &mut cache).unwrap();
    let second = build(&root, &MapConfig::default(), &mut cache).unwrap();
    let cold = build(&root, &MapConfig::default(), &mut ParseCache::new()).unwrap();
    assert_eq!(first.map.content_hash, second.map.content_hash);
    assert_eq!(first.map.content_hash, cold.map.content_hash);
    assert_eq!(first.map.to_value(true), cold.map.to_value(true));
    assert_eq!(first.map.content_hash, first.map.compute_content_hash());
}

#[test]
fn parallel_builds_are_byte_identical() {
    // Regresión: resolutores con caché compartida daban aristas distintas según el orden de los hilos.
    let root = fixture("monorepo-pnpm");
    let reference = build(&root, &MapConfig::default(), &mut ParseCache::new())
        .unwrap()
        .map
        .to_value(true);
    for _ in 0..30 {
        let again = build(&root, &MapConfig::default(), &mut ParseCache::new())
            .unwrap()
            .map
            .to_value(true);
        assert_eq!(reference, again);
    }
}

#[test]
fn pagerank_sums_to_one_and_collections_are_sorted() {
    let state = build(
        &fixture("monorepo-pnpm"),
        &MapConfig::default(),
        &mut ParseCache::new(),
    )
    .unwrap();
    let map = &state.map;
    let total: f64 = map.files.iter().map(|f| f.rank_global).sum();
    assert!((total - 1.0).abs() < 1e-9, "suma {total}");
    assert!(map.files.windows(2).all(|w| w[0].id < w[1].id));
    assert!(map.symbols.windows(2).all(|w| w[0].id < w[1].id));
    assert!(
        map.edges
            .windows(2)
            .all(|w| (w[0].kind, &w[0].from, &w[0].to) < (w[1].kind, &w[1].from, &w[1].to))
    );
    // Lo más importado del fixture tiene más rango que una hoja.
    let rank = |id: &str| map.files.iter().find(|f| f.id == id).unwrap().rank_global;
    assert!(rank("packages/core/src/cart/types.ts") > rank("apps/web/src/app/page.tsx"));
}

#[test]
fn typed_edges() {
    let state = build(
        &fixture("monorepo-pnpm"),
        &MapConfig::default(),
        &mut ParseCache::new(),
    )
    .unwrap();
    let has = |kind: EdgeKind, from: &str, to: &str| {
        state
            .map
            .edges
            .iter()
            .any(|e| e.kind == kind && e.from == from && e.to == to)
    };
    assert!(has(
        EdgeKind::Imports,
        "apps/web/src/app/page.tsx",
        "packages/ui/src/index.ts"
    ));
    assert!(has(
        EdgeKind::ImportsType,
        "apps/web/src/app/page.tsx",
        "packages/core/src/index.ts"
    ));
    assert!(has(
        EdgeKind::Reexports,
        "packages/ui/src/index.ts",
        "packages/ui/src/button.tsx"
    ));
    assert!(has(
        EdgeKind::Imports,
        "apps/web/src/app/dashboard/page.tsx",
        "apps/web/src/lib/stats.ts"
    ));
    assert!(has(
        EdgeKind::Imports,
        "packages/core/src/legacy/total.cjs",
        "packages/core/src/legacy/round.cjs"
    ));
    assert!(has(
        EdgeKind::ImportsExternal,
        "packages/ui/src/button.tsx",
        "npm:react"
    ));
    // El barrel se atraviesa hasta el símbolo real.
    assert!(has(
        EdgeKind::UsesSymbol,
        "apps/web/src/app/page.tsx",
        "packages/ui/src/button.tsx#Button"
    ));
    assert!(has(
        EdgeKind::UsesSymbol,
        "apps/web/src/app/page.tsx",
        "packages/core/src/cart/types.ts#CartItem"
    ));
    assert!(has(
        EdgeKind::PackageDepends,
        "pkg:@mono/web",
        "pkg:@mono/ui"
    ));
    // Import circular cart.ts ↔ audit.ts.
    assert!(has(
        EdgeKind::Imports,
        "packages/core/src/cart/cart.ts",
        "packages/core/src/cart/audit.ts"
    ));
    assert!(has(
        EdgeKind::ImportsType,
        "packages/core/src/cart/audit.ts",
        "packages/core/src/cart/cart.ts"
    ));
    let uses = state
        .map
        .edges
        .iter()
        .find(|e| {
            e.kind == EdgeKind::UsesSymbol && e.to == "packages/core/src/cart/types.ts#CartId"
        })
        .unwrap();
    assert_eq!(uses.weight, Some(5));
    let ui_index = state
        .map
        .files
        .iter()
        .find(|f| f.id == "packages/ui/src/index.ts")
        .unwrap();
    assert_eq!(
        ui_index.exports,
        [
            "packages/ui/src/button.tsx#Button",
            "packages/ui/src/button.tsx#ButtonProps",
            "packages/ui/src/card.tsx#Card",
            "packages/ui/src/card.tsx#CardProps",
            "packages/ui/src/card.tsx#useCardState",
        ]
    );
}

#[test]
fn heritage_edges_and_diagnostics() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    std::fs::write(
        root.join("base.ts"),
        "export class Base {}\nexport interface Shape {}\n",
    )
    .unwrap();
    std::fs::write(
        root.join("a.ts"),
        "import { Base } from './base';\nimport * as b from './base';\nimport { gone } from './gone';\nexport class A extends Base implements b.Shape {}\nclass Local {}\nexport class B extends Local {}\n",
    )
    .unwrap();
    std::fs::write(root.join("broken.ts"), "export function f(: {\n").unwrap();
    let state = build(root, &MapConfig::default(), &mut ParseCache::new()).unwrap();
    let edges: Vec<_> = state
        .map
        .edges
        .iter()
        .filter(|e| matches!(e.kind, EdgeKind::Extends | EdgeKind::Implements))
        .map(|e| (e.kind.as_str(), e.from.as_str(), e.to.as_str()))
        .collect();
    assert_eq!(
        edges,
        [
            ("extends", "a.ts#A", "base.ts#Base"),
            ("extends", "a.ts#B", "a.ts#Local"),
            ("implements", "a.ts#A", "base.ts#Shape"),
        ]
    );
    let diagnostics: Vec<_> = state
        .map
        .diagnostics
        .iter()
        .map(|d| (d.file.as_deref(), d.code.as_str(), d.subject.as_deref()))
        .collect();
    assert_eq!(
        diagnostics,
        [
            (Some("a.ts"), "FKR-MAP-104", Some("./gone")),
            (Some("broken.ts"), "FKR-MAP-101", None)
        ]
    );
    assert_eq!(state.map.stats.unresolved_imports, 1);
    assert_eq!(state.map.stats.parse_errors, 1);
}

#[test]
fn resolver_version_matches_cargo_lock() {
    let lock =
        std::fs::read_to_string(Path::new(env!("CARGO_MANIFEST_DIR")).join("../../Cargo.lock"))
            .unwrap();
    let marker = "name = \"oxc_resolver\"\nversion = \"";
    let start = lock.find(marker).unwrap() + marker.len();
    let version = lock[start..].split('"').next().unwrap();
    assert_eq!(version, foker_map::model::RESOLVER_VERSION);
}
