//! Aristas de imports relativos dentro del root (en Windows el root canónico es una ruta verbatim).
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

#[test]
fn relative_imports_produce_edges() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    write(
        root,
        "src/core.ts",
        "import { helper } from './helper';\nexport const core = helper();\n",
    );
    write(
        root,
        "src/helper.ts",
        "import { deep } from './lib/deep';\nexport const helper = () => deep;\n",
    );
    write(root, "src/lib/deep.ts", "export const deep = 1;\n");
    let mut engine = MapEngine::open(root, MapConfig::default()).unwrap();
    engine.refresh(&RefreshOptions::default()).unwrap();
    let map = engine.map().unwrap();
    let imports: Vec<(String, String)> = map
        .edges
        .iter()
        .filter(|e| format!("{:?}", e.kind).to_lowercase() == "imports")
        .map(|e| (e.from.clone(), e.to.clone()))
        .collect();
    assert!(
        imports.contains(&("src/core.ts".into(), "src/helper.ts".into())),
        "{imports:?}"
    );
    assert!(
        imports.contains(&("src/helper.ts".into(), "src/lib/deep.ts".into())),
        "{imports:?}"
    );
}
