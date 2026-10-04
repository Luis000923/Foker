//! REQ-MAP-003 (TARGET): rendimiento sobre `large-10k`, generado con semilla fija.
//! Se ejecuta en nightly: `cargo nextest run -p foker-map --run-ignored only --test perf_large`.

use std::fs;
use std::time::Instant;

use foker_map::config::MapConfig;
use foker_map::engine::{MapEngine, RefreshOptions};

#[test]
#[ignore = "rendimiento: solo en nightly"]
fn perf_large_10k() {
    let dir = tempfile::tempdir().unwrap();
    foker_map::testing::generate_large(dir.path(), 10_000, 42);
    let mut engine = MapEngine::open(dir.path(), MapConfig::default()).unwrap();

    let t = Instant::now();
    let first = engine.refresh(&RefreshOptions::default()).unwrap();
    let full_ms = t.elapsed().as_millis();

    let t = Instant::now();
    let unchanged = engine.refresh(&RefreshOptions::default()).unwrap();
    let check_ms = t.elapsed().as_millis();
    assert!(unchanged.unchanged);

    fs::write(
        dir.path().join("packages/p3/src/f23.ts"),
        "export const v23 = 0;\n",
    )
    .unwrap();
    let t = Instant::now();
    let incremental = engine.refresh(&RefreshOptions::default()).unwrap();
    let incremental_ms = t.elapsed().as_millis();
    assert_eq!(incremental.changed, ["packages/p3/src/f23.ts"]);

    let t = Instant::now();
    let report = engine.save().unwrap();
    let save_ms = t.elapsed().as_millis();

    println!(
        "{{\"files\":{},\"edges\":{},\"full_build_ms\":{full_ms},\"unchanged_check_ms\":{check_ms},\"incremental_ms\":{incremental_ms},\"save_ms\":{save_ms},\"map_bytes\":{}}}",
        engine.status().files,
        engine.map().unwrap().edges.len(),
        report.bytes
    );
    assert_eq!(first.added.len(), 10_000);
}
