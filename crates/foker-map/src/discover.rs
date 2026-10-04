//! Descubrimiento de archivos (FOKER-SPEC §8.3, pasos 1–2; FKR-020).

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use ignore::WalkBuilder;

use crate::FokerCode;
use crate::config::MapConfig;
use crate::glob::{GlobError, GlobMatcher};
use crate::path::normalize_lexical;

/// Directorios que nunca se recorren, a cualquier profundidad.
const ALWAYS_SKIPPED_DIRS: [&str; 3] = ["node_modules", ".git", ".foker"];

/// Lenguaje según la extensión (FOKER-SPEC §8.3, paso 3).
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum Language {
    /// `.ts`, `.mts`, `.cts`, `.d.ts`.
    TypeScript,
    /// `.tsx`.
    Tsx,
    /// `.js`, `.mjs`, `.cjs`.
    JavaScript,
    /// `.jsx`.
    Jsx,
}

impl Language {
    /// Lenguaje de un id por su extensión, o `None` si no es código TS/JS.
    pub fn from_id(id: &str) -> Option<Self> {
        let ext = id.rsplit_once('.')?.1;
        match ext {
            "ts" | "mts" | "cts" => Some(Language::TypeScript),
            "tsx" => Some(Language::Tsx),
            "js" | "mjs" | "cjs" => Some(Language::JavaScript),
            "jsx" => Some(Language::Jsx),
            _ => None,
        }
    }

    /// Valor en el esquema (`typescript`, `tsx`, `javascript`, `jsx`).
    pub fn as_str(self) -> &'static str {
        match self {
            Language::TypeScript => "typescript",
            Language::Tsx => "tsx",
            Language::JavaScript => "javascript",
            Language::Jsx => "jsx",
        }
    }
}

/// Archivo candidato encontrado en el árbol.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Candidate {
    /// Id normalizado.
    pub id: String,
    /// Ruta absoluta para leerlo.
    pub path: PathBuf,
    /// Tamaño en bytes.
    pub size: u64,
    /// mtime en nanosegundos desde la época Unix (0 si no disponible).
    pub mtime_ns: u64,
}

/// Diagnóstico de descubrimiento (no es un error).
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct DiscoveryDiagnostic {
    /// `FKR-MAP-102` (omitido por tamaño) o `FKR-MAP-103` (entrada omitida).
    pub code: &'static str,
    /// Id o ruta relativa afectada.
    pub subject: String,
    /// Explicación.
    pub message: String,
}

/// Resultado del descubrimiento. Todas las colecciones están ordenadas por id.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Discovery {
    /// Archivos TS/JS dentro de include/exclude, sin secretos.
    pub sources: Vec<Candidate>,
    /// Ids de archivos fuente que superan `max_file_bytes` (se registran como `skipped`).
    pub oversized: Vec<String>,
    /// `package.json`, `tsconfig*.json`, `jsconfig*.json`, `pnpm-workspace.yaml`: afectan a la resolución.
    pub manifests: Vec<Candidate>,
    /// Entradas omitidas.
    pub diagnostics: Vec<DiscoveryDiagnostic>,
}

/// Error fatal del descubrimiento.
#[derive(Debug, thiserror::Error)]
pub enum DiscoveryError {
    /// Glob inválido en la configuración.
    #[error(transparent)]
    Glob(#[from] GlobError),
    /// No se pudo recorrer el árbol.
    #[error("error de E/S al recorrer {path}: {message}")]
    Io {
        /// Ruta afectada.
        path: String,
        /// Mensaje.
        message: String,
    },
    /// Se superó `max_files`.
    #[error("hay más de {limit} archivos fuente; ajusta map.include/exclude")]
    TooManyFiles {
        /// Límite configurado.
        limit: usize,
    },
}

impl DiscoveryError {
    /// Código público (FOKER-SPEC §18).
    pub fn code(&self) -> FokerCode {
        match self {
            DiscoveryError::Glob(_) => FokerCode::Inp001,
            DiscoveryError::Io { .. } => FokerCode::Map001,
            DiscoveryError::TooManyFiles { .. } => FokerCode::Map003,
        }
    }
}

fn is_manifest(id: &str) -> bool {
    let name = id.rsplit('/').next().unwrap_or(id);
    name == "package.json"
        || name == "pnpm-workspace.yaml"
        || ((name.starts_with("tsconfig") || name.starts_with("jsconfig"))
            && name.ends_with(".json"))
}

fn mtime_ns(meta: &fs::Metadata) -> u64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| u64::try_from(d.as_nanos()).unwrap_or(u64::MAX))
        .unwrap_or(0)
}

/// Compilado de los filtros de una configuración.
struct Filters {
    include: GlobMatcher,
    exclude: GlobMatcher,
    secrets: GlobMatcher,
}

impl Filters {
    fn new(config: &MapConfig) -> Result<Self, GlobError> {
        Ok(Filters {
            include: GlobMatcher::new(&config.include, false)?,
            exclude: GlobMatcher::new(&config.exclude, false)?,
            secrets: GlobMatcher::new(&config.secret_globs, true)?,
        })
    }

    fn selected(&self, id: &str) -> bool {
        (self.include.is_empty() || self.include.is_match(id)) && !self.exclude.is_match(id)
    }
}

/// Recorre `root` y devuelve los candidatos (FKR-020).
///
/// - Respeta los `.gitignore` del árbol (no el global ni `.git/info/exclude`, que no son
///   reproducibles entre equipos).
/// - Nunca entra en `node_modules`, `.git` ni `.foker`, y nunca abre archivos que casan con
///   `secret_globs` (solo se compara su id).
/// - No sigue enlaces simbólicos a directorios; un enlace a archivo solo se incluye si su destino
///   real está dentro del root.
pub fn discover(root: &Path, config: &MapConfig) -> Result<Discovery, DiscoveryError> {
    let filters = Filters::new(config)?;
    let root_real = fs::canonicalize(root).map_err(|e| DiscoveryError::Io {
        path: root.display().to_string(),
        message: e.to_string(),
    })?;

    let walker = WalkBuilder::new(&root_real)
        .hidden(false)
        .parents(false)
        .ignore(false)
        .git_ignore(true)
        .git_global(false)
        .git_exclude(false)
        .require_git(false)
        .follow_links(false)
        .filter_entry(|entry| {
            let is_dir = entry.file_type().is_some_and(|t| t.is_dir());
            !(is_dir
                && entry.depth() > 0
                && ALWAYS_SKIPPED_DIRS.iter().any(|d| entry.file_name() == *d))
        })
        .build();

    let mut sources = BTreeMap::new();
    let mut manifests = BTreeMap::new();
    let mut oversized = Vec::new();
    let mut diagnostics = Vec::new();

    for entry in walker {
        let entry = match entry {
            Ok(entry) => entry,
            Err(e) => {
                diagnostics.push(DiscoveryDiagnostic {
                    code: "FKR-MAP-103",
                    subject: String::new(),
                    message: format!("entrada omitida: {e}"),
                });
                continue;
            }
        };
        let Some(file_type) = entry.file_type() else {
            continue;
        };
        if file_type.is_dir() {
            continue;
        }
        let Ok(relative) = entry.path().strip_prefix(&root_real) else {
            continue;
        };
        let Some(raw) = relative.to_str() else {
            diagnostics.push(DiscoveryDiagnostic {
                code: "FKR-MAP-103",
                subject: relative.to_string_lossy().into_owned(),
                message: "nombre de archivo no UTF-8".into(),
            });
            continue;
        };
        let id = match normalize_lexical(raw) {
            Ok(id) => id,
            Err(e) => {
                diagnostics.push(DiscoveryDiagnostic {
                    code: "FKR-MAP-103",
                    subject: raw.replace('\\', "/"),
                    message: format!("ruta no válida: {e}"),
                });
                continue;
            }
        };
        // Los secretos se descartan antes de cualquier stat o lectura.
        if filters.secrets.is_match(&id) {
            continue;
        }
        let manifest = is_manifest(&id);
        let language = Language::from_id(&id);
        if !manifest && language.is_none() {
            continue;
        }
        if language.is_some() && !filters.selected(&id) {
            continue;
        }

        let path = entry.path().to_path_buf();
        if file_type.is_symlink() {
            match fs::canonicalize(&path) {
                Ok(target) if target.starts_with(&root_real) && target.is_file() => {}
                _ => {
                    diagnostics.push(DiscoveryDiagnostic {
                        code: "FKR-MAP-103",
                        subject: id,
                        message: "enlace simbólico fuera del root, roto o a un directorio".into(),
                    });
                    continue;
                }
            }
        }
        let meta = match fs::metadata(&path) {
            Ok(meta) => meta,
            Err(e) => {
                diagnostics.push(DiscoveryDiagnostic {
                    code: "FKR-MAP-103",
                    subject: id,
                    message: format!("no se pudo leer: {e}"),
                });
                continue;
            }
        };
        let candidate = Candidate {
            id: id.clone(),
            path,
            size: meta.len(),
            mtime_ns: mtime_ns(&meta),
        };
        if manifest {
            manifests.insert(id, candidate);
        } else {
            if candidate.size > config.max_file_bytes {
                diagnostics.push(DiscoveryDiagnostic {
                    code: "FKR-MAP-102",
                    subject: id.clone(),
                    message: format!(
                        "archivo de {} bytes supera map.max_file_bytes ({}); no se parsea",
                        candidate.size, config.max_file_bytes
                    ),
                });
                oversized.push(id.clone());
            }
            sources.insert(id, candidate);
            if sources.len() > config.max_files {
                return Err(DiscoveryError::TooManyFiles {
                    limit: config.max_files,
                });
            }
        }
    }

    diagnostics.sort();
    oversized.sort();
    Ok(Discovery {
        sources: sources.into_values().collect(),
        oversized,
        manifests: manifests.into_values().collect(),
        diagnostics,
    })
}
