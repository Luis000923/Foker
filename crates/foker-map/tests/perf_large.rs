//! REQ-MAP-003 (TARGET): rendimiento sobre `large-10k`, generado con semilla fija.
//! Se ejecuta en nightly: `cargo nextest run -p foker-map --run-ignored only --test perf_large`.

use std::fmt::Write as _;
use std::fs;
use std::path::Path;
use std::time::Instant;

use foker_map::config::MapConfig;
use foker_map::engine::{MapEngine, RefreshOptions};

/// Generador congruencial lineal: determinista y sin dependencias.
struct Lcg(u64);

impl Lcg {
    fn next(&mut self, bound: usize) -> usize {
        self.0 = self
            .0
            .wrapping_mul(6_364_136_223_846_793_005)
            .wrapping_add(1_442_695_040_888_963_407);
        ((self.0 >> 33) as usize) % bound.max(1)
    }
}

/// Crea `files` archivos repartidos en 20 paquetes con imports aleatorios hacia archivos anteriores.
pub fn generate(root: &Path, files: usize, seed: u64) {
    let mut rng = Lcg(seed);
    let packages = 20;
    fs::write(
        root.join("pnpm-workspace.yaml"),
        "packages:\n  - packages/*\n",
    )
    .unwrap();
    for p in 0..packages {
        let dir = root.join(format!("packages/p{p}/src"));
        fs::create_dir_all(&dir).unwrap();
        fs::write(
            root.join(format!("packages/p{p}/package.json")),
            format!("{{ \"name\": \"@large/p{p}\", \"main\": \"./src/f0.ts\" }}"),
        )
        .unwrap();
    }
    for i in 0..files {
        let p = i % packages;
        let mut src = String::new();
        for _ in 0..rng.next(5) {
            if i < packages {
                break;
            }
            let target = rng.next(i);
            let tp = target % packages;
            let spec = if tp == p {
                format!("./f{target}")
            } else {
                format!("@large/p{tp}/src/f{target}")
            };
            let _ = writeln!(src, "import {{ v{target} }} from '{spec}';");
        }
        let _ = writeln!(src, "/** Valor {i}. */\nexport const v{i} = {i};");
        let _ = writeln!(
            src,
            "export function fn{i}(a: number, b: string): string {{\n  return b.repeat(a);\n}}"
        );
        let _ = writeln!(src, "export interface I{i} {{ id: number; name: string }}");
        fs::write(root.join(format!("packages/p{p}/src/f{i}.ts")), src).unwrap();
    }
}

#[test]
#[ignore = "rendimiento: solo en nightly"]
fn perf_large_10k() {
    let dir = tempfile::tempdir().unwrap();
    generate(dir.path(), 10_000, 42);
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
