//! Context Engine de Foker (FOKER-SPEC §9).
//!
//! Construye Context Packs deterministas a partir del Project Map.

/// Versión del crate, en lockstep con los paquetes npm (ADR-013).
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_matches_map() {
        assert_eq!(VERSION, foker_map::VERSION);
    }
}
