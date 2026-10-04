//! Códigos de error de Foker (FOKER-SPEC §18).

use std::fmt;

/// Código de error estable `FKR-<ÁREA>-<NNN>` que cruza la frontera nativa como `error.code`.
///
/// Solo incluye los códigos que puede producir el núcleo Rust. Los diagnósticos `1xx` no son
/// errores y viajan en `diagnostics`, no aquí (REQ-NAPI-002).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum FokerCode {
    /// Root inexistente o no es directorio.
    Cfg002,
    /// Entrada inválida (esquema o límites).
    Inp001,
    /// Error de E/S al leer el árbol.
    Map001,
    /// Límite `max_files` excedido.
    Map003,
    /// No se pudo guardar el mapa.
    Map004,
    /// Mapa corrupto o incompatible.
    Map005,
    /// Lock del mapa ocupado.
    Map006,
    /// Presupuesto insuficiente para el contexto obligatorio.
    Ctx001,
    /// Ruta inválida o fuera del root.
    Pol001,
    /// Error interno (bug o pánico capturado).
    Int001,
}

impl FokerCode {
    /// Todos los códigos, en orden estable.
    pub const ALL: [FokerCode; 10] = [
        FokerCode::Cfg002,
        FokerCode::Inp001,
        FokerCode::Map001,
        FokerCode::Map003,
        FokerCode::Map004,
        FokerCode::Map005,
        FokerCode::Map006,
        FokerCode::Ctx001,
        FokerCode::Pol001,
        FokerCode::Int001,
    ];

    /// Representación textual, p. ej. `"FKR-MAP-001"`.
    pub const fn as_str(self) -> &'static str {
        match self {
            FokerCode::Cfg002 => "FKR-CFG-002",
            FokerCode::Inp001 => "FKR-INP-001",
            FokerCode::Map001 => "FKR-MAP-001",
            FokerCode::Map003 => "FKR-MAP-003",
            FokerCode::Map004 => "FKR-MAP-004",
            FokerCode::Map005 => "FKR-MAP-005",
            FokerCode::Map006 => "FKR-MAP-006",
            FokerCode::Ctx001 => "FKR-CTX-001",
            FokerCode::Pol001 => "FKR-POL-001",
            FokerCode::Int001 => "FKR-INT-001",
        }
    }
}

impl AsRef<str> for FokerCode {
    fn as_ref(&self) -> &str {
        self.as_str()
    }
}

impl fmt::Display for FokerCode {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn codes_follow_the_format_and_are_unique() {
        let mut seen = HashSet::new();
        for code in FokerCode::ALL {
            let text = code.as_str();
            let parts: Vec<&str> = text.split('-').collect();
            assert_eq!(parts.len(), 3, "{text}");
            assert_eq!(parts[0], "FKR");
            assert!(parts[1].chars().all(|c| c.is_ascii_uppercase()), "{text}");
            assert!(
                parts[2].len() == 3 && parts[2].chars().all(|c| c.is_ascii_digit()),
                "{text}"
            );
            assert!(
                !parts[2].starts_with('1'),
                "los 1xx son diagnósticos: {text}"
            );
            assert!(seen.insert(text), "duplicado: {text}");
            assert_eq!(code.to_string(), text);
            assert_eq!(code.as_ref(), text);
        }
    }
}
