//! Aristas entre paquetes del workspace cuando `exports` apunta a código compilado fuera del mapa.
use foker_map::{
    config::MapConfig,
    engine::{MapEngine, RefreshOptions},
};
use std::{fs, path::Path};

fn write(root: &Path, id: &str, text: &str) {
    let path = root.join(id);
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, text).unwrap();
}

fn imports_of(root: &Path, from: &str) -> Vec<String> {
    let mut engine = MapEngine::open(root, MapConfig::default()).unwrap();
    engine.refresh(&RefreshOptions::default()).unwrap();
    let map = engine.map().unwrap();
    map.edges
        .iter()
        .filter(|e| e.from == from && format!("{:?}", e.kind).to_lowercase() == "imports")
        .map(|e| e.to.clone())
        .collect()
}

fn monorepo(root: &Path, exports: &str) {
    write(root, "pnpm-workspace.yaml", "packages:\n  - packages/*\n");
    write(
        root,
        "packages/lib/package.json",
        &format!("{{ \"name\": \"@x/lib\", \"exports\": {exports} }}"),
    );
    write(root, "packages/lib/src/index.ts", "export const lib = 1;\n");
    write(
        root,
        "packages/app/package.json",
        "{ \"name\": \"@x/app\" }",
    );
    write(
        root,
        "packages/app/src/main.ts",
        "import { lib } from '@x/lib';\nexport const app = lib;\n",
    );
}

#[test]
fn source_condition_wins_over_missing_dist_types() {
    let dir = tempfile::tempdir().unwrap();
    monorepo(
        dir.path(),
        r#"{ ".": { "@x/source": "./src/index.ts", "types": "./dist/index.d.ts", "default": "./dist/index.js" } }"#,
    );
    assert_eq!(
        imports_of(dir.path(), "packages/app/src/main.ts"),
        vec!["packages/lib/src/index.ts".to_owned()]
    );
}

#[test]
fn built_dist_outside_the_map_does_not_hide_the_source() {
    let dir = tempfile::tempdir().unwrap();
    monorepo(
        dir.path(),
        r#"{ ".": { "@x/source": "./src/index.ts", "types": "./dist/index.d.ts", "default": "./dist/index.js" } }"#,
    );
    write(
        dir.path(),
        "packages/lib/dist/index.js",
        "export const lib = 1;\n",
    );
    write(dir.path(), ".gitignore", "dist/\n");
    assert_eq!(
        imports_of(dir.path(), "packages/app/src/main.ts"),
        vec!["packages/lib/src/index.ts".to_owned()]
    );
}

#[test]
fn plain_source_exports_keep_resolving() {
    let dir = tempfile::tempdir().unwrap();
    monorepo(dir.path(), r#""./src/index.ts""#);
    assert_eq!(
        imports_of(dir.path(), "packages/app/src/main.ts"),
        vec!["packages/lib/src/index.ts".to_owned()]
    );
}
