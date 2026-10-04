//! FKR-029: search, fileInfo, symbolInfo e impact sobre `fixtures/monorepo-pnpm`.

use std::path::Path;
use std::sync::OnceLock;

use foker_map::build::{ParseCache, build};
use foker_map::config::MapConfig;
use foker_map::model::ProjectMap;
use foker_map::query::{Direction, NodeKind, SearchKind, file_info, impact, search, symbol_info};

fn map() -> &'static ProjectMap {
    static MAP: OnceLock<ProjectMap> = OnceLock::new();
    MAP.get_or_init(|| {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/monorepo-pnpm");
        build(&root, &MapConfig::default(), &mut ParseCache::new())
            .unwrap()
            .map
    })
}

fn hits(query: &str, kind: SearchKind) -> Vec<String> {
    search(map(), query, kind, 20)
        .into_iter()
        .map(|h| format!("{:.2} {}", h.score, h.id))
        .collect()
}

#[test]
fn search_snapshots() {
    insta::assert_debug_snapshot!("search_button", hits("button", SearchKind::Any));
    insta::assert_debug_snapshot!("search_cart_symbols", hits("Cart", SearchKind::Symbol));
    insta::assert_debug_snapshot!("search_path", hits("lib/format", SearchKind::File));
    insta::assert_debug_snapshot!("search_subterms", hits("card state", SearchKind::Any));
}

#[test]
fn search_preserves_camel_case_subterms() {
    let root = tempfile::tempdir().unwrap();
    std::fs::write(
        root.path().join("get-user-by-id.ts"),
        "export const user = 1;",
    )
    .unwrap();
    let map = build(root.path(), &MapConfig::default(), &mut ParseCache::new())
        .unwrap()
        .map;
    let hits = search(&map, "  getUserById  ", SearchKind::File, 20);
    assert_eq!(hits.len(), 1);
    assert_eq!(hits[0].id, "get-user-by-id.ts");
    assert_eq!(hits[0].score, 0.5);
}

#[test]
fn search_limits_and_empty_queries() {
    assert_eq!(search(map(), "cart", SearchKind::Any, 3).len(), 3);
    assert!(search(map(), "   ", SearchKind::Any, 10).is_empty());
    assert!(search(map(), "zzzz", SearchKind::Any, 10).is_empty());
    let top = &search(map(), "formatPrice", SearchKind::Any, 1)[0];
    assert_eq!(top.id, "apps/web/src/lib/format.ts#formatPrice");
    assert_eq!(top.score, 1.0);
    assert_eq!(
        top.signature.as_deref(),
        Some("export function formatPrice(cents: number): string")
    );
}

#[test]
fn file_and_symbol_info() {
    let info = file_info(map(), "packages/ui/src/button.tsx").unwrap();
    assert_eq!(info.imported_by, ["packages/ui/src/index.ts"]);
    assert!(info.imports.is_empty());
    assert_eq!(
        info.symbols,
        [
            "packages/ui/src/button.tsx#Button",
            "packages/ui/src/button.tsx#ButtonProps"
        ]
    );
    assert!(file_info(map(), "no/existe.ts").is_none());
    let symbol = symbol_info(map(), "packages/core/src/cart/cart.ts#Cart.add").unwrap();
    assert_eq!(
        symbol.parent.as_deref(),
        Some("packages/core/src/cart/cart.ts#Cart")
    );
    assert!(symbol_info(map(), "packages/core/src/cart/cart.ts#Nope").is_none());
}

fn render(files: &[&str], symbols: &[&str], direction: Direction, depth: u32) -> Vec<String> {
    let files: Vec<String> = files.iter().map(|s| (*s).to_owned()).collect();
    let symbols: Vec<String> = symbols.iter().map(|s| (*s).to_owned()).collect();
    let report = impact(map(), &files, &symbols, direction, depth);
    let mut out: Vec<String> = report
        .nodes
        .iter()
        .map(|n| {
            format!(
                "{} {} {} via {}",
                n.distance,
                n.kind.as_str(),
                n.id,
                n.via.unwrap_or("-")
            )
        })
        .collect();
    out.push(format!("packages: {:?}", report.packages));
    out.extend(
        report
            .diagnostics
            .iter()
            .map(|d| format!("{} {}", d.code, d.subject.clone().unwrap_or_default())),
    );
    out
}

#[test]
fn impact_symbol_origins_expand_files_only_towards_dependencies() {
    let file = "packages/core/src/cart/cart.ts";
    let symbols = [format!("{file}#Cart.add")];
    for direction in [Direction::Dependencies, Direction::Both] {
        let report = impact(map(), &[], &symbols, direction, 1);
        let container = report.nodes.iter().find(|node| node.id == file).unwrap();
        assert_eq!(container.distance, 0);
        assert_eq!(container.via, Some("declares"));
        assert_eq!(container.kind, NodeKind::File);
        for dependency in ["audit.ts", "types.ts"] {
            assert!(report.nodes.iter().any(|node| {
                node.id == format!("packages/core/src/cart/{dependency}")
                    && node.distance == 1
                    && node.kind == NodeKind::File
            }));
        }
    }
    let report = impact(map(), &[], &symbols, Direction::Dependents, 1);
    assert!(!report.nodes.iter().any(|node| node.id == file));
    // Un archivo explícito conserva la semántica de origen, aunque también se indique su símbolo.
    let report = impact(
        map(),
        &[file.to_owned()],
        &symbols,
        Direction::Dependencies,
        1,
    );
    let container = report.nodes.iter().find(|node| node.id == file).unwrap();
    assert_eq!(container.distance, 0);
    assert_eq!(container.via, None);
}

#[test]
fn impact_respects_direction_and_depth() {
    let types = "packages/core/src/cart/types.ts";
    insta::assert_debug_snapshot!(
        "impact_types_dependents_1",
        render(&[types], &[], Direction::Dependents, 1)
    );
    insta::assert_debug_snapshot!(
        "impact_types_dependents_3",
        render(&[types], &[], Direction::Dependents, 3)
    );
    insta::assert_debug_snapshot!(
        "impact_page_dependencies_2",
        render(
            &["apps/web/src/app/page.tsx"],
            &[],
            Direction::Dependencies,
            2
        )
    );
    insta::assert_debug_snapshot!(
        "impact_button_symbol_both",
        render(
            &[],
            &["packages/ui/src/button.tsx#Button"],
            Direction::Both,
            2
        )
    );
    insta::assert_debug_snapshot!(
        "impact_unknown",
        render(&["nope.ts"], &[], Direction::Dependents, 2)
    );
    // Profundidad fuera de rango se acota a 1–3.
    assert_eq!(
        render(&[types], &[], Direction::Dependents, 9),
        render(&[types], &[], Direction::Dependents, 3)
    );
}
