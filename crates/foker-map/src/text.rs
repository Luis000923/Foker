//! Partición de identificadores y rutas en subtérminos (FOKER-SPEC §9.3, paso 3).
//!
//! `getUserById` → `get, user, by, id`; `HTTPServer2` → `http, server, 2`;
//! `packages/ui/src/button-group.tsx` → `packages, ui, src, button, group, tsx`.

use unicode_normalization::UnicodeNormalization;

/// Parte un identificador (camelCase, PascalCase, snake_case, kebab-case) en subtérminos en minúsculas.
pub fn split_identifier(identifier: &str) -> Vec<String> {
    let mut out = Vec::new();
    for word in identifier.split(|c: char| !c.is_alphanumeric()) {
        let chars: Vec<char> = word.chars().collect();
        let mut current = String::new();
        for (i, &c) in chars.iter().enumerate() {
            let prev = i.checked_sub(1).map(|j| chars[j]);
            let next = chars.get(i + 1).copied();
            let boundary = match prev {
                None => false,
                Some(p) => {
                    (p.is_lowercase() && c.is_uppercase())
                        || (p.is_alphabetic() && c.is_numeric())
                        || (p.is_numeric() && c.is_alphabetic())
                        || (p.is_uppercase()
                            && c.is_uppercase()
                            && next.is_some_and(char::is_lowercase))
                }
            };
            if boundary && !current.is_empty() {
                out.push(std::mem::take(&mut current));
            }
            current.extend(c.to_lowercase());
        }
        if !current.is_empty() {
            out.push(current);
        }
    }
    out
}

/// Normaliza (NFC) y parte un texto cualquiera en subtérminos.
pub fn subterms(text: &str) -> Vec<String> {
    let nfc: String = text.nfc().collect();
    split_identifier(&nfc)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_identifiers() {
        assert_eq!(split_identifier("getUserById"), ["get", "user", "by", "id"]);
        assert_eq!(split_identifier("HTTPServer2"), ["http", "server", "2"]);
        assert_eq!(
            split_identifier("snake_case-and-kebab"),
            ["snake", "case", "and", "kebab"]
        );
        assert_eq!(split_identifier("useCardState"), ["use", "card", "state"]);
        assert_eq!(split_identifier("añadirÍtem"), ["añadir", "ítem"]);
        assert!(split_identifier("__").is_empty());
    }

    #[test]
    fn splits_paths() {
        assert_eq!(
            subterms("packages/ui/src/button-group.tsx"),
            ["packages", "ui", "src", "button", "group", "tsx"]
        );
    }
}
