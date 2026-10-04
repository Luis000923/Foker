//! Project Map de Foker (FOKER-SPEC §8).
//!
//! Descubre archivos, los parsea con tree-sitter, resuelve imports, construye el
//! grafo de dependencias, calcula el PageRank global y persiste el mapa.

pub mod error;

pub use error::FokerCode;

/// Versión del crate, en lockstep con los paquetes npm (ADR-013).
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

/// Versión del esquema de `.foker/project-map.json` (`schema_version`, FOKER-SPEC §17).
/// Un mapa con otra versión se trata como caché inválida y se reconstruye.
pub const MAP_SCHEMA_VERSION: u32 = 1;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_is_semver() {
        assert_eq!(VERSION.split('.').count(), 3);
    }
}
