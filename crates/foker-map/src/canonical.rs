//! JSON canónico y hashes (FOKER-SPEC §7.3, §8.2; REQ-MAP-002).
//!
//! Formato: JSON compacto (sin espacios), claves de objeto ordenadas por bytes UTF-8, números como
//! los escribe `serde_json` (enteros tal cual, `f64` con la representación más corta que vuelve al
//! mismo valor). No depende del orden de inserción de `serde_json::Map`, que puede variar según las
//! features activadas.

use serde_json::Value;

/// Escribe `value` en JSON canónico.
pub fn to_canonical_string(value: &Value) -> String {
    let mut out = String::new();
    write(value, &mut out);
    out
}

fn write(value: &Value, out: &mut String) {
    match value {
        Value::Object(map) => {
            out.push('{');
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort();
            for (i, key) in keys.into_iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                out.push_str(&serde_json::to_string(key).unwrap_or_default());
                out.push(':');
                write(&map[key], out);
            }
            out.push('}');
        }
        Value::Array(items) => {
            out.push('[');
            for (i, item) in items.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                write(item, out);
            }
            out.push(']');
        }
        other => out.push_str(&serde_json::to_string(other).unwrap_or_default()),
    }
}

/// `blake3:<64 hex>` de unos bytes.
pub fn hash_bytes(bytes: &[u8]) -> String {
    format!("blake3:{}", blake3::hash(bytes).to_hex())
}

/// Redondea a 1e-12 (FOKER-SPEC §8.5) normalizando `-0` a `0`.
pub fn round12(x: f64) -> f64 {
    let r = (x * 1e12).round() / 1e12;
    if r == 0.0 { 0.0 } else { r }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn sorts_keys_recursively_and_is_compact() {
        let value = json!({ "b": 1, "a": { "d": [3, { "z": true, "y": null }], "c": "é\n" } });
        assert_eq!(
            to_canonical_string(&value),
            r#"{"a":{"c":"é\n","d":[3,{"y":null,"z":true}]},"b":1}"#
        );
    }

    #[test]
    fn floats_and_hashes() {
        assert_eq!(
            to_canonical_string(&json!(0.1 + 0.2)),
            "0.30000000000000004"
        );
        assert_eq!(round12(0.123_456_789_012_345), 0.123_456_789_012);
        assert_eq!(round12(-1e-15).to_string(), "0");
        assert_eq!(
            hash_bytes(b""),
            "blake3:af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262"
        );
    }
}
