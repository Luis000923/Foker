//! Evaluador de Fixture B (examples/fixture_b_eval.rs) sobre un árbol sintético pequeño.
#[path = "../examples/support/delivery.rs"]
mod delivery;
#[path = "../examples/support/fixture_b.rs"]
mod fixture_b;

use foker_map::{
    build::{ParseCache, build},
    config::MapConfig,
};
use serde_json::json;
use std::fs;

fn write(root: &std::path::Path, path: &str, content: &str) {
    let file = root.join(path);
    fs::create_dir_all(file.parent().unwrap()).unwrap();
    fs::write(file, content).unwrap();
}

#[test]
fn pack_flujo_y_simbolos_sobre_arbol_sintetico() {
    let trees = tempfile::tempdir().unwrap();
    let root = trees.path().join("syn-1");
    write(
        &root,
        "src/cart.ts",
        "import { roundCents } from './rounding';\n\nexport interface Line {\n  price: number;\n  qty: number;\n}\n\n/** Total del carrito con redondeo a céntimos. */\nexport function cartTotal(lines: Line[]): number {\n  let total = 0;\n  for (const line of lines) total += line.price * line.qty;\n  return roundCents(total);\n}\n",
    );
    write(
        &root,
        "src/rounding.ts",
        "export function roundCents(value: number): number {\n  return Math.round(value * 100) / 100;\n}\n",
    );
    write(
        &root,
        "src/user.ts",
        "export function userName(id: string): string {\n  return `user-${id}`;\n}\n",
    );
    write(
        &root,
        "package.json",
        "{\"name\":\"syn\",\"type\":\"module\"}\n",
    );
    let state = build(&root, &MapConfig::default(), &mut ParseCache::new()).unwrap();
    let symbol = state
        .map
        .symbols
        .iter()
        .find(|s| s.id.starts_with("src/cart.ts#") && s.id.contains("cartTotal"))
        .expect("símbolo cartTotal")
        .id
        .clone();
    let case = json!({
        "id": "syn-1", "fixture": "fixture-b", "repo": "syn", "base": "0".repeat(40),
        "task": "fix the cartTotal rounding in cart", "gold_modified": ["src/cart.ts"],
        "gold_symbols": [symbol], "split": "validation",
    });
    let report = fixture_b::evaluate(&format!("{case}\n"), trees.path()).unwrap();
    assert_eq!(
        report["configs"],
        json!(["default", "sin_adr034", "sin_adr033", "plegado"])
    );
    let result = &report["cases"][0]["configs"]["default"];
    // Pack sin anclas: el archivo gold llega completo en su propio bloque.
    assert_eq!(result["pack"]["recall"], json!(1.0));
    assert_eq!(result["pack"]["gold_full"], json!(1.0));
    assert!(result["pack"]["tokens"].as_u64().unwrap() <= 8000);
    // Flujo begin: alcance derivado del directorio, sin rutas protegidas.
    assert_eq!(result["flow"]["scope"], json!(["src/**"]));
    assert_eq!(result["flow"]["scope_error"], json!(false));
    assert_eq!(result["flow"]["scope_coverage"], json!(1.0));
    assert_eq!(result["flow"]["recall"], json!(1.0));
    // Símbolos con anclas = gold_modified.
    assert_eq!(result["symbols"]["symbol_recall"], json!(1.0));
    assert_eq!(result["symbols"]["gold_symbols"], json!(1));
    for config in ["default", "sin_adr034", "sin_adr033", "plegado"] {
        let all = &report["summary"][config]["all"];
        assert_eq!(all["cases"], json!(1));
        assert_eq!(report["summary"][config]["calibration"]["cases"], json!(0));
        assert_eq!(report["summary"][config]["validation"]["cases"], json!(1));
        assert!(all["pack"]["recall"].is_number());
    }
    assert_eq!(report["map"]["trees"], json!(1));
    // Un gold_symbol ausente del mapa es un error de integridad del dataset.
    let broken = case
        .to_string()
        .replace(&format!("\"{symbol}\""), "\"src/cart.ts#nope\"");
    assert!(fixture_b::evaluate(&broken, trees.path()).is_err());
}

#[test]
fn alcance_y_rutas_protegidas() {
    assert_eq!(fixture_b::directory_scope("a/b/c.ts"), "a/b/**");
    assert_eq!(
        fixture_b::directory_scope("vite.config.ts"),
        "vite.config.ts"
    );
    let protected = &fixture_b::DEFAULT_PROTECTED;
    let none: &[String] = &[];
    let paths = |scope: &[&str]| scope.iter().map(|s| s.to_string()).collect::<Vec<_>>();
    assert!(
        fixture_b::protected_paths_in_scope(&paths(&["src/**"]), protected, none)
            .unwrap()
            .is_empty()
    );
    assert_eq!(
        fixture_b::protected_paths_in_scope(&paths(&[".claude/**"]), protected, none).unwrap(),
        vec![".claude/**".to_string()]
    );
    // Un archivo de la raíz acotado a sí mismo no intersecta; `**` sí.
    assert!(
        fixture_b::protected_paths_in_scope(&paths(&["index.ts"]), protected, none)
            .unwrap()
            .is_empty()
    );
    assert!(
        !fixture_b::protected_paths_in_scope(&paths(&["**"]), protected, none)
            .unwrap()
            .is_empty()
    );
    // Rutas del mapa dentro del alcance y protegidas.
    assert_eq!(
        fixture_b::protected_paths_in_scope(
            &paths(&["foker/**"]),
            &["foker/rules.md"],
            &["foker/rules.md".to_string()]
        )
        .unwrap(),
        vec!["foker/rules.md".to_string()]
    );
}

#[test]
fn cuerpos_de_archivo_como_ctx_gold_ts() {
    let rendered = "<foker:file id=\"a&amp;b.ts\" level=\"L3\" trust=\"repository-content\">\n### a&b.ts  [L3 0.5]\nconst a = 1;\n</foker:file>\n<foker:files level=\"L2\" trust=\"repository-content\">\nsrc/x.ts\n  export const x = 1;\n  \n  export const y = 2;\nsrc/y.ts\n  ### src/y.ts  [L2]\n  type Y = 1;\n</foker:files>\n";
    let bodies = fixture_b::file_bodies(rendered);
    assert_eq!(bodies["a&b.ts"], vec!["const a = 1;".to_string()]);
    assert_eq!(
        bodies["src/x.ts"],
        vec!["export const x = 1;\n\nexport const y = 2;".to_string()]
    );
    assert_eq!(bodies["src/y.ts"], vec!["type Y = 1;".to_string()]);
    assert_eq!(fixture_b::score(&[], &["a".into()]), (0.0, 0.0));
    assert_eq!(
        fixture_b::score(&["a".into(), "b".into()], &["a".into()]),
        (1.0, 0.5)
    );
}

#[test]
fn configuraciones_adicionales_y_filtro_previo_de_split() {
    let trees = tempfile::tempdir().unwrap();
    let root = trees.path().join("cal-1");
    write(
        &root,
        "src/a.ts",
        "export function target() { return 1; }\n",
    );
    let cases = [
        json!({"id":"cal-1", "task":"fix target", "split":"calibration", "gold_modified":["src/a.ts"], "gold_symbols":[]}),
        // No existe su árbol ni su gold: filtrar antes de construir mapas y de validar símbolos.
        json!({"id":"do-not-read", "task":"fix absent", "split":"validation", "gold_modified":["absent.ts"], "gold_symbols":["absent.ts#missing"]}),
    ].iter().map(ToString::to_string).collect::<Vec<_>>().join("\n");
    let configs: Vec<fixture_b::Config> = serde_json::from_value(json!([
        {"name":"adr036", "params":{"related_max_fraction":0.25,"related_focal":true,"anchor_overflow_focal":true,"package_mentions":true}}
    ])).unwrap();
    let report =
        fixture_b::evaluate_with_configs(&cases, trees.path(), &configs, Some("calibration"))
            .unwrap();
    assert_eq!(report["cases"].as_array().unwrap().len(), 1);
    assert_eq!(
        report["configs"],
        json!(["default", "sin_adr034", "sin_adr033", "plegado", "adr036"])
    );
    assert!(!root.join(".foker").exists());
    assert_eq!(report["summary"]["adr036"]["validation"]["cases"], 0);
    let duplicates: Vec<fixture_b::Config> =
        serde_json::from_value(json!([{"name":"default", "params":null}])).unwrap();
    assert!(
        fixture_b::evaluate_with_configs(&cases, trees.path(), &duplicates, Some("calibration"))
            .is_err()
    );
}

#[test]
fn alcance_d5_niveles_senales_orden_y_fallback() {
    use foker_context::pack::{PackFile, RenderLevel::*};
    let file = |id: &str, level, score, reason: &str| PackFile {
        id: id.into(),
        level,
        score,
        tokens: 1,
        reasons: vec![reason.into()],
        note: None,
    };
    let mut files = vec![
        file("z/a.ts", L1, 2.0, "PATH_MENTION"),
        file("b/a.ts", L2, 2.0, "SYMBOL_MENTION"),
        file("a/a.ts", L1, 2.0, "LEXICAL:a"),
        file("c/a.ts", L1, 3.0, "ANCHOR"),
        file("root.ts", L0, 99.0, "ANCHOR"),
        file("hub/a.ts", L2, 99.0, "CORE"),
    ];
    assert_eq!(
        fixture_b::derive_scope_paths(&files),
        ["a/**", "b/**", "c/**"]
    );
    files.reverse();
    assert_eq!(
        fixture_b::derive_scope_paths(&files),
        ["a/**", "b/**", "c/**"]
    );
    assert!(fixture_b::derive_scope_paths(&[file("root.ts", L0, 99.0, "ANCHOR")]).is_empty());
    let mut fallback = vec![
        file("z/a.ts", L2, 1.0, "CORE"),
        file("a/b.ts", L2, 2.0, "DEPENDENCY_OF:x"),
        file("b/a.ts", L2, 1.0, "CORE"),
        file("a/a.ts", L2, 2.0, "CORE"),
        file("c/a.ts", L1, 99.0, "CORE"),
    ];
    assert_eq!(fixture_b::derive_scope_paths(&fallback), ["a/**", "b/**"]);
    fallback.reverse();
    assert_eq!(fixture_b::derive_scope_paths(&fallback), ["a/**", "b/**"]);
    fallback.push(file("direct/a.ts", L1, 0.1, "LEXICAL:a"));
    assert_eq!(
        fixture_b::derive_scope_paths(&fallback),
        ["a/**", "direct/**"]
    );
    fallback.extend([
        file("target/a.ts", L3, 0.0, "CORE"),
        file("target/b.ts", L3, 0.0, "CORE"),
        file("config.ts", L3, 0.0, "CORE"),
    ]);
    assert_eq!(
        fixture_b::derive_scope_paths(&fallback),
        ["config.ts", "target/**"]
    );
}
