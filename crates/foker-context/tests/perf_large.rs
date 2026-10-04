//! REQ-CTX-004 TARGET: mapa caliente, sin caché de ContextPack.
use foker_context::{ContextInputs, ContextRequest, build_context};
use foker_map::{
    build::{ParseCache, build},
    config::MapConfig,
};
use std::time::Instant;

#[test]
#[ignore = "rendimiento: ejecutar en release sobre large-10k"]
fn build_context_large_10k() {
    let dir = tempfile::tempdir().unwrap();
    foker_map::testing::generate_large(dir.path(), 10_000, 42);
    let state = build(dir.path(), &MapConfig::default(), &mut ParseCache::new()).unwrap();
    assert_eq!(state.map.files.len(), 10_000);
    let request = ContextRequest {
        task: "fix fn23 and I23".into(),
        ..Default::default()
    };
    let inputs = ContextInputs::default();
    build_context(&state, dir.path(), &request, &inputs).unwrap();
    let mut samples = Vec::new();
    for _ in 0..20 {
        let start = Instant::now();
        let pack = build_context(&state, dir.path(), &request, &inputs).unwrap();
        samples.push(start.elapsed().as_secs_f64() * 1000.0);
        assert!(pack.budget.used <= request.budget_tokens);
    }
    samples.sort_by(f64::total_cmp);
    let p95 = samples[18];
    println!(
        "buildContext large-10k: p95={p95:.2} ms, mediana={:.2} ms, muestras=20, TARGET <300 ms",
        samples[9]
    );
    // Línea JSON que lee scripts/perf-check.mjs en nightly.
    println!(
        "{{\"build_context_p95_ms\":{p95:.2},\"build_context_median_ms\":{:.2}}}",
        samples[9]
    );
    // TARGET informativo: no es un gate del MVP.
}
