//! Generador determinista compartido por benchmarks.
use std::{fmt::Write as _, fs, path::Path};
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
pub fn generate_large(root: &Path, files: usize, seed: u64) {
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
