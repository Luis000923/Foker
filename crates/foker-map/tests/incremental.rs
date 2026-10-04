//! FKR-027: refresco incremental. REQ-MAP-001: el resultado incremental es idéntico al completo.

use std::fs::{self, File};
use std::path::Path;
use std::time::{Duration, SystemTime};

use foker_map::build::{ParseCache, build};
use foker_map::config::MapConfig;
use foker_map::engine::{MapEngine, RefreshOptions};
use proptest::prelude::*;

const NAMES: [&str; 5] = ["a", "b", "c", "d", "e"];

#[derive(Debug, Clone)]
enum Op {
    Write {
        name: usize,
        imports: Vec<usize>,
        alias: bool,
        exports: u8,
    },
    Delete {
        name: usize,
    },
    Tsconfig {
        paths: bool,
    },
    Index {
        present: bool,
    },
}

fn op() -> impl Strategy<Value = Op> {
    prop_oneof![
        4 => (0..NAMES.len(), prop::collection::vec(0..NAMES.len(), 0..3), any::<bool>(), 0u8..3)
            .prop_map(|(name, imports, alias, exports)| Op::Write { name, imports, alias, exports }),
        2 => (0..NAMES.len()).prop_map(|name| Op::Delete { name }),
        1 => any::<bool>().prop_map(|paths| Op::Tsconfig { paths }),
        1 => any::<bool>().prop_map(|present| Op::Index { present }),
    ]
}

/// Escribe un archivo y fija un mtime nuevo y creciente, para que el cambio sea visible aunque el
/// tamaño no cambie y el sistema de archivos tenga resolución gruesa.
fn write(root: &Path, id: &str, content: &str, tick: &mut u64) {
    let path = root.join(id);
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(&path, content).unwrap();
    *tick += 1;
    let mtime = SystemTime::UNIX_EPOCH + Duration::from_secs(1_700_000_000 + *tick);
    File::options()
        .write(true)
        .open(&path)
        .unwrap()
        .set_modified(mtime)
        .unwrap();
}

fn apply(root: &Path, op: &Op, tick: &mut u64) {
    match op {
        Op::Write {
            name,
            imports,
            alias,
            exports,
        } => {
            let mut src = String::new();
            for (i, target) in imports.iter().enumerate() {
                let spec = if *alias {
                    format!("~/{}", NAMES[*target])
                } else {
                    format!("./{}", NAMES[*target])
                };
                src.push_str(&format!(
                    "import {{ x_{} as i{i} }} from '{spec}';\n",
                    NAMES[*target]
                ));
                src.push_str(&format!("export const use{i} = i{i};\n"));
            }
            src.push_str(&format!("export const x_{} = 1;\n", NAMES[*name]));
            for i in 0..*exports {
                src.push_str(&format!("export function f{i}() {{}}\n"));
            }
            write(root, &format!("src/{}.ts", NAMES[*name]), &src, tick);
        }
        Op::Delete { name } => {
            let _ = fs::remove_file(root.join(format!("src/{}.ts", NAMES[*name])));
        }
        Op::Tsconfig { paths } => {
            let content = if *paths {
                r#"{ "compilerOptions": { "baseUrl": ".", "paths": { "~/*": ["src/*"] } } }"#
            } else {
                r#"{ "compilerOptions": {} }"#
            };
            write(root, "tsconfig.json", content, tick);
        }
        Op::Index { present } => {
            if *present {
                write(
                    root,
                    "src/index.ts",
                    "export * from './a';\nexport * from './b';\n",
                    tick,
                );
            } else {
                let _ = fs::remove_file(root.join("src/index.ts"));
            }
        }
    }
}

proptest! {
    #![proptest_config(ProptestConfig { cases: 24, ..ProptestConfig::default() })]

    #[test]
    fn incremental_equals_full_rebuild(ops in prop::collection::vec(op(), 1..12)) {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let mut tick = 0;
        write(root, "src/a.ts", "export const x_a = 1;\n", &mut tick);
        let mut engine = MapEngine::open(root, MapConfig::default()).unwrap();
        engine.refresh(&RefreshOptions::default()).unwrap();
        for op in &ops {
            apply(root, op, &mut tick);
            let report = engine.refresh(&RefreshOptions::default()).unwrap();
            let full = build(root, &MapConfig::default(), &mut ParseCache::new()).unwrap();
            prop_assert_eq!(&report.content_hash, &full.map.content_hash, "tras {:?}", op);
            prop_assert_eq!(engine.map().unwrap().to_value(true), full.map.to_value(true));
        }
    }
}

#[test]
fn reports_changes_and_skips_work_when_nothing_changed() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    let mut tick = 0;
    write(root, "src/a.ts", "export const a = 1;\n", &mut tick);
    write(root, "src/b.ts", "export const b = 1;\n", &mut tick);
    let mut engine = MapEngine::open(root, MapConfig::default()).unwrap();
    let first = engine.refresh(&RefreshOptions::default()).unwrap();
    assert!(first.rebuilt && !first.unchanged);
    assert_eq!(first.added, ["src/a.ts", "src/b.ts"]);

    let same = engine.refresh(&RefreshOptions::default()).unwrap();
    assert!(same.unchanged && !same.rebuilt);
    assert_eq!(same.content_hash, first.content_hash);

    write(root, "src/a.ts", "export const a = 2;\n", &mut tick);
    write(
        root,
        "src/c.ts",
        "import { gone } from './gone';\n",
        &mut tick,
    );
    fs::remove_file(root.join("src/b.ts")).unwrap();
    assert_eq!(engine.check_stale().unwrap(), 3);
    assert_eq!(engine.status().stale_files, 3);
    let second = engine.refresh(&RefreshOptions::default()).unwrap();
    assert!(!second.rebuilt && !second.unchanged);
    assert_eq!(second.added, ["src/c.ts"]);
    assert_eq!(second.changed, ["src/a.ts"]);
    assert_eq!(second.removed, ["src/b.ts"]);
    assert_eq!(second.diagnostics.len(), 1);
    assert_eq!(second.diagnostics[0].code, "FKR-MAP-104");
    assert_eq!(engine.status().stale_files, 0);

    // Un "touch" sin cambio de contenido no cambia el hash.
    write(root, "src/a.ts", "export const a = 2;\n", &mut tick);
    let touched = engine.refresh(&RefreshOptions::default()).unwrap();
    assert!(touched.changed.is_empty());
    assert_eq!(touched.content_hash, second.content_hash);

    let full = engine.refresh(&RefreshOptions { full: true }).unwrap();
    assert!(full.rebuilt);
    assert_eq!(full.content_hash, second.content_hash);
}

#[test]
fn save_reopen_and_corruption() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    let mut tick = 0;
    write(root, "src/a.ts", "export const a = 1;\n", &mut tick);
    let mut engine = MapEngine::open(root, MapConfig::default()).unwrap();
    assert_eq!(engine.status().files, 0);
    let report = engine.refresh(&RefreshOptions::default()).unwrap();
    engine.save().unwrap();

    let mut reopened = MapEngine::open(root, MapConfig::default()).unwrap();
    assert!(reopened.load_diagnostics.is_empty());
    assert_eq!(reopened.status().content_hash, report.content_hash);
    assert_eq!(reopened.check_stale().unwrap(), 0);
    let again = reopened.refresh(&RefreshOptions::default()).unwrap();
    assert_eq!(again.content_hash, report.content_hash);
    assert!(again.added.is_empty() && again.changed.is_empty());

    fs::write(root.join(".foker/project-map.json"), "{}").unwrap();
    let corrupt = MapEngine::open(root, MapConfig::default()).unwrap();
    assert_eq!(corrupt.load_diagnostics.len(), 1);
    assert_eq!(corrupt.load_diagnostics[0].code, "FKR-MAP-005");
    assert_eq!(corrupt.status().files, 0);
}

#[test]
fn open_rejects_missing_roots() {
    let error = MapEngine::open(
        Path::new("/definitivamente/no/existe"),
        MapConfig::default(),
    )
    .err()
    .unwrap();
    assert_eq!(error.code().as_str(), "FKR-CFG-002");
}
