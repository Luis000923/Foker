//! Project Map de Foker (FOKER-SPEC §8).
//!
//! Descubre archivos, los parsea con tree-sitter, resuelve imports, construye el
//! grafo de dependencias, calcula el PageRank global y persiste el mapa.

pub mod build;
pub mod canonical;
pub mod config;
pub mod discover;
pub mod engine;
pub mod error;
pub mod glob;
pub mod model;
pub mod pagerank;
pub mod parse;
pub mod path;
pub mod project;
pub mod query;
pub mod resolve;
pub mod store;
pub mod text;

pub use error::FokerCode;

/// Versión del crate, en lockstep con los paquetes npm (ADR-013).
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

/// Versión del esquema de `.foker/project-map.json` (`schema_version`, FOKER-SPEC §17).
/// Un mapa con otra versión se trata como caché inválida y se reconstruye.
pub const MAP_SCHEMA_VERSION: u32 = 1;
#[doc(hidden)]
pub mod testing;
