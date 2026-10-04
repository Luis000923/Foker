//! Project Map de Foker (FOKER-SPEC §8).
//!
//! Descubre archivos, los parsea con tree-sitter, resuelve imports, construye el
//! grafo de dependencias, calcula el PageRank global y persiste el mapa.

/// Versión del crate, en lockstep con los paquetes npm (ADR-013).
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_is_semver() {
        assert_eq!(VERSION.split('.').count(), 3);
    }
}
