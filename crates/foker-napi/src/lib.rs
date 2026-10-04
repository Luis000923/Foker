//! Bindings napi-rs de Foker (FOKER-SPEC §7).
//!
//! Este crate solo expone la API de `foker-map` y `foker-context` a Node.js.
//! No contiene lógica de dominio (REQ-NAPI-001).

use std::collections::HashMap;
use std::panic::{AssertUnwindSafe, catch_unwind};

use foker_map::FokerCode;
use napi_derive::napi;

mod engine;

pub use engine::FokerEngine;

/// Versión de la API nativa. Se incrementa al romper el contrato de `foker-core.d.ts`.
const NATIVE_API: u32 = 1;

/// Resultado interno con código `FKR-…` en `error.code`. Las funciones `#[napi]` deben escribir
/// `napi::Result<T, FokerCode>` de forma literal: la macro no reconoce alias de tipo.
pub(crate) type NativeResult<T> = napi::Result<T, FokerCode>;

/// Ejecuta `body` y convierte un pánico en `FKR-INT-001` en vez de abortar el proceso Node
/// (FOKER-SPEC §7.4). Toda función exportada pasa por aquí.
pub(crate) fn guard<T>(body: impl FnOnce() -> NativeResult<T>) -> NativeResult<T> {
    match catch_unwind(AssertUnwindSafe(body)) {
        Ok(result) => result,
        Err(payload) => {
            let detail = payload
                .downcast_ref::<&str>()
                .map(|s| (*s).to_owned())
                .or_else(|| payload.downcast_ref::<String>().cloned())
                .unwrap_or_else(|| "pánico sin mensaje".to_owned());
            Err(napi::Error::new(
                FokerCode::Int001,
                format!("error interno en el núcleo nativo: {detail}"),
            ))
        }
    }
}

/// Versiones del núcleo nativo y de los formatos que produce.
#[napi(object)]
pub struct VersionInfo {
    /// Versión del núcleo; debe coincidir exactamente con la de `@foker/core` (REQ-NAPI-003).
    pub core_version: String,
    /// Versión entera de la API nativa.
    pub native_api: u32,
    /// `schema_version` del Project Map.
    pub map_schema: u32,
    /// `pack_version` del Context Pack.
    pub context_schema: u32,
    /// Versiones de las gramáticas tree-sitter enlazadas, por lenguaje.
    pub grammars: HashMap<String, String>,
}

/// Devuelve las versiones del núcleo nativo.
#[napi]
pub fn version_info() -> napi::Result<VersionInfo, FokerCode> {
    guard(|| {
        Ok(VersionInfo {
            core_version: env!("CARGO_PKG_VERSION").to_owned(),
            native_api: NATIVE_API,
            map_schema: foker_map::MAP_SCHEMA_VERSION,
            context_schema: foker_context::PACK_VERSION,
            grammars: engine::grammars(),
        })
    })
}

/// Normaliza `input` respecto al root absoluto `root` (REQ-XPLAT-001…003).
/// Lanza `FKR-POL-001` si la ruta es inválida o sale del root.
#[napi]
pub fn normalize_path(root: String, input: String) -> napi::Result<String, FokerCode> {
    guard(|| {
        foker_map::path::normalize_path(std::path::Path::new(&root), &input)
            .map_err(|e| napi::Error::new(e.code(), e.to_string()))
    })
}

/// `true` si algún glob casa con el id (misma semántica que el motor). Lanza `FKR-INP-001` si un
/// glob es inválido.
#[napi]
pub fn match_globs(id: String, globs: Vec<String>) -> napi::Result<bool, FokerCode> {
    guard(|| {
        foker_map::glob::match_globs(&id, &globs)
            .map_err(|e| napi::Error::new(FokerCode::Inp001, e.to_string()))
    })
}
