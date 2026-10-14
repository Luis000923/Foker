//! Globs con una única semántica para todo Foker (`matchGlobs` en la API nativa).
//!
//! - Se evalúan sobre ids normalizados (POSIX, relativos al root).
//! - `*` y `?` no cruzan `/`; `**` cruza cualquier número de directorios.
//! - Un glob sin `/` se compara con el nombre del archivo a cualquier profundidad
//!   (`.env` casa con `.env` y con `apps/web/.env`), como en `.gitignore`.
//! - Un glob que termina en `/**` casa con todo lo que hay bajo ese directorio.

use globset::{GlobBuilder, GlobSet, GlobSetBuilder};

/// Error al compilar un glob.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[error("glob inválido {glob:?}: {message}")]
pub struct GlobError {
    /// Glob original.
    pub glob: String,
    /// Motivo.
    pub message: String,
}

/// Conjunto compilado de globs.
#[derive(Debug, Clone)]
pub struct GlobMatcher {
    set: GlobSet,
    empty: bool,
}

impl GlobMatcher {
    /// Compila `globs`. Con `case_insensitive` ignora mayúsculas (útil para globs de secretos).
    pub fn new<S: AsRef<str>>(globs: &[S], case_insensitive: bool) -> Result<Self, GlobError> {
        let mut builder = GlobSetBuilder::new();
        for glob in globs {
            let original = glob.as_ref();
            let trimmed = original.trim_start_matches("./");
            let pattern = if trimmed.contains('/') {
                trimmed.to_owned()
            } else {
                format!("**/{trimmed}")
            };
            let compiled = GlobBuilder::new(&pattern)
                .literal_separator(true)
                .case_insensitive(case_insensitive)
                .backslash_escape(true)
                .empty_alternates(true)
                .build()
                .map_err(|e| GlobError {
                    glob: original.to_owned(),
                    message: e.kind().to_string(),
                })?;
            builder.add(compiled);
        }
        let set = builder.build().map_err(|e| GlobError {
            glob: String::new(),
            message: e.to_string(),
        })?;
        Ok(GlobMatcher {
            set,
            empty: globs.is_empty(),
        })
    }

    /// `true` si algún glob casa con el id.
    pub fn is_match(&self, id: &str) -> bool {
        !self.empty && self.set.is_match(id)
    }

    /// `true` si no hay globs.
    pub fn is_empty(&self) -> bool {
        self.empty
    }
}

/// `true` si algún glob de `globs` casa con `id`. Globs inválidos → `Err`.
pub fn match_globs<S: AsRef<str>>(id: &str, globs: &[S]) -> Result<bool, GlobError> {
    Ok(GlobMatcher::new(globs, false)?.is_match(id))
}
