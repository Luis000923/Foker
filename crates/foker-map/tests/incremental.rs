//! Caché incremental: sin escrituras redundantes, invalidación al editar y recuperación de
//! estado corrupto sin romper la ejecución.
use foker_map::{
    config::MapConfig,
    engine::{MapEngine, RefreshOptions},
    store::{MAP_FILE, PARSE_CACHE_FILE},
};
use std::{fs, path::Path, time::SystemTime};

fn write(root: &Path, id: &str, text: &str) {
    let path = root.join(id);
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, text).unwrap();
}

fn modified(root: &Path, id: &str) -> SystemTime {
    fs::metadata(root.join(id)).unwrap().modified().unwrap()
}

fn run(root: &Path) -> (foker_map::engine::RefreshReport, MapEngine) {
    let mut engine = MapEngine::open(root, MapConfig::default()).unwrap();
    let report = engine.refresh(&RefreshOptions::default()).unwrap();
    engine.save().unwrap();
    (report, engine)
}

fn fixture(root: &Path) {
    write(root, "src/a.ts", "export const a = 1;\n");
    write(
        root,
        "src/b.ts",
        "import { a } from './a';\nexport const b = a + 1;\n",
    );
}

#[test]
fn unchanged_process_does_not_rewrite_map_or_cache() {
    let dir = tempfile::tempdir().unwrap();
    fixture(dir.path());
    let (first, _) = run(dir.path());
    assert!(!first.unchanged);
    let map_time = modified(dir.path(), MAP_FILE);
    let cache_time = modified(dir.path(), PARSE_CACHE_FILE);
    std::thread::sleep(std::time::Duration::from_millis(20));
    let (second, _) = run(dir.path());
    assert!(second.unchanged, "mismo content_hash que el mapa en disco");
    assert_eq!(second.content_hash, first.content_hash);
    assert_eq!(modified(dir.path(), MAP_FILE), map_time);
    assert_eq!(modified(dir.path(), PARSE_CACHE_FILE), cache_time);
}

#[test]
fn editing_a_file_invalidates_only_that_entry() {
    let dir = tempfile::tempdir().unwrap();
    fixture(dir.path());
    let (first, _) = run(dir.path());
    std::thread::sleep(std::time::Duration::from_millis(20));
    write(dir.path(), "src/a.ts", "export const a = 2;\n");
    let (second, _) = run(dir.path());
    assert!(!second.unchanged);
    assert_eq!(second.changed, vec!["src/a.ts".to_owned()]);
    assert_ne!(second.content_hash, first.content_hash);
}

#[test]
fn corrupt_parse_cache_and_map_are_discarded_and_rebuilt() {
    let dir = tempfile::tempdir().unwrap();
    fixture(dir.path());
    let (clean, _) = run(dir.path());
    fs::write(dir.path().join(PARSE_CACHE_FILE), b"{ no es json").unwrap();
    fs::write(dir.path().join(MAP_FILE), b"{\"schema_version\": 999}").unwrap();
    let mut engine = MapEngine::open(dir.path(), MapConfig::default()).unwrap();
    assert!(
        engine
            .load_diagnostics
            .iter()
            .any(|d| d.code == "FKR-MAP-005")
    );
    let report = engine.refresh(&RefreshOptions::default()).unwrap();
    assert_eq!(report.content_hash, clean.content_hash);
    engine.save().unwrap();
    // El siguiente proceso vuelve a cargar estado válido.
    let (after, _) = run(dir.path());
    assert!(after.unchanged);
}

#[test]
fn incremental_and_full_rebuild_agree() {
    let dir = tempfile::tempdir().unwrap();
    fixture(dir.path());
    let (_, warm) = run(dir.path());
    let mut cold = MapEngine::open(dir.path(), MapConfig::default()).unwrap();
    cold.refresh(&RefreshOptions { full: true }).unwrap();
    let (a, b) = (warm.map().unwrap(), cold.map().unwrap());
    assert_eq!(a.content_hash, b.content_hash);
    // generated_at y stats.duration_ms son volátiles por diseño; el contenido no.
    assert_eq!(format!("{:?}", a.symbols), format!("{:?}", b.symbols));
    assert_eq!(format!("{:?}", a.edges), format!("{:?}", b.edges));
}
