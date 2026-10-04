//! Corpus de rutas de `tests/security/paths/` (REQ-XPLAT-001…003). Se ejecuta en los 3 SO de CI.

use foker_map::path::{PathRules, normalize_lexical_with};

#[test]
fn corpus() {
    let path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../tests/security/paths/corpus.json"
    );
    let corpus: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
    let cases = corpus["cases"].as_array().unwrap();
    assert!(cases.len() >= 40);
    let mut failures = Vec::new();
    for case in cases {
        let input = case["input"].as_str().unwrap();
        for (key, rules) in [
            ("unix", PathRules { windows: false }),
            ("windows", PathRules { windows: true }),
        ] {
            let expected = case[key].as_str().unwrap();
            let actual = match normalize_lexical_with(input, rules) {
                Ok(id) => id,
                Err(e) => e.code().as_str().to_owned(),
            };
            if actual != expected {
                failures.push(format!(
                    "{key} {input:?}: esperado {expected:?}, obtenido {actual:?}"
                ));
            }
        }
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}
