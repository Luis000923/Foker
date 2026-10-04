//! Bindings napi-rs de Foker (FOKER-SPEC §7).
//!
//! Este crate solo expone la API de `foker-map` y `foker-context` a Node.js.
//! No contiene lógica de dominio (REQ-NAPI-001). Los bindings llegan en FKR-005.

/// Versión del crate, en lockstep con los paquetes npm (ADR-013).
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_matches_dependencies() {
        assert_eq!(VERSION, foker_map::VERSION);
        assert_eq!(VERSION, foker_context::VERSION);
    }
}
