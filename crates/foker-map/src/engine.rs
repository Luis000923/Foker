//! Motor del Project Map para un root: carga, refresco incremental, estado y guardado
//! (FOKER-SPEC §8.4; FKR-027). La API nativa (`FokerEngine`) delega aquí.

use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};
use std::time::Instant;

use crate::FokerCode;
use crate::build::{BuildError, MapState, ParseCache, build};
use crate::config::MapConfig;
use crate::discover::{Discovery, discover};
use crate::model::{MapDiagnostic, ProjectMap};
use crate::store::{
    Loaded, MapLock, SaveReport, StoreError, load_map, load_parse_cache, save_map, save_parse_cache,
};

/// Opciones de refresco.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct RefreshOptions {
    /// Reconstrucción completa ignorando la caché de parseo.
    pub full: bool,
}

/// Resultado de un refresco.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RefreshReport {
    /// Archivos nuevos.
    pub added: Vec<String>,
    /// Archivos con contenido distinto.
    pub changed: Vec<String>,
    /// Archivos eliminados.
    pub removed: Vec<String>,
    /// Diagnósticos que no estaban en el mapa anterior.
    pub diagnostics: Vec<MapDiagnostic>,
    /// Duración.
    pub duration_ms: u64,
    /// `content_hash` resultante.
    pub content_hash: String,
    /// `true` si se reconstruyó el mapa (no había estado en memoria, o `full`).
    pub rebuilt: bool,
    /// `true` si nada había cambiado y no se recalculó.
    pub unchanged: bool,
}

/// Estado resumido.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MapStatus {
    /// `content_hash` del mapa en memoria (vacío si no hay mapa).
    pub content_hash: String,
    /// Archivos.
    pub files: usize,
    /// Símbolos.
    pub symbols: usize,
    /// Archivos que difieren del disco en la última comprobación.
    pub stale_files: usize,
    /// `schema_version`.
    pub schema_version: u32,
}

/// Error del motor.
#[derive(Debug, thiserror::Error)]
pub enum EngineError {
    /// Construcción.
    #[error(transparent)]
    Build(#[from] BuildError),
    /// Persistencia.
    #[error(transparent)]
    Store(#[from] StoreError),
}

impl EngineError {
    /// Código público.
    pub fn code(&self) -> FokerCode {
        match self {
            EngineError::Build(e) => e.code(),
            EngineError::Store(e) => e.code(),
        }
    }
}

/// Huella (tamaño, mtime) de cada archivo relevante: si no cambia, el mapa sigue fresco.
type Fingerprint = BTreeMap<String, (u64, u64)>;

fn fingerprint(discovery: &Discovery) -> Fingerprint {
    discovery
        .sources
        .iter()
        .chain(&discovery.manifests)
        .map(|c| (c.id.clone(), (c.size, c.mtime_ns)))
        .collect()
}

/// Motor de un root.
pub struct MapEngine {
    root: PathBuf,
    config: MapConfig,
    cache: ParseCache,
    /// Mapa cargado del disco (antes del primer refresco) o construido.
    map: Option<ProjectMap>,
    /// Estado completo en memoria tras un build.
    state: Option<MapState>,
    fingerprint: Fingerprint,
    stale_files: usize,
    /// Avisos de carga (p. ej. `FKR-MAP-005` si el mapa estaba corrupto).
    pub load_diagnostics: Vec<MapDiagnostic>,
}

impl MapEngine {
    /// Abre el motor: carga el mapa persistido si es válido y la caché de parseo.
    pub fn open(root: &Path, config: MapConfig) -> Result<Self, EngineError> {
        let root = std::fs::canonicalize(root).map_err(|e| BuildError::Root {
            path: root.display().to_string(),
            message: e.to_string(),
        })?;
        if !root.is_dir() {
            return Err(BuildError::Root {
                path: root.display().to_string(),
                message: "no es un directorio".into(),
            }
            .into());
        }
        let mut load_diagnostics = Vec::new();
        let map = match load_map(&root) {
            Loaded::Valid(map) => Some(*map),
            Loaded::Missing => None,
            Loaded::Corrupt { reason, moved_to } => {
                load_diagnostics.push(MapDiagnostic {
                    file: None,
                    code: "FKR-MAP-005".into(),
                    subject: moved_to,
                    message: format!("mapa corrupto o incompatible; se reconstruye: {reason}"),
                });
                None
            }
        };
        Ok(MapEngine {
            cache: load_parse_cache(&root),
            root,
            config,
            map,
            state: None,
            fingerprint: Fingerprint::new(),
            stale_files: 0,
            load_diagnostics,
        })
    }

    /// Root canónico.
    pub fn root(&self) -> &Path {
        &self.root
    }

    /// Configuración.
    pub fn config(&self) -> &MapConfig {
        &self.config
    }

    /// Mapa actual, si existe.
    pub fn map(&self) -> Option<&ProjectMap> {
        self.state.as_ref().map(|s| &s.map).or(self.map.as_ref())
    }

    /// Estado completo (tras al menos un refresco).
    pub fn state(&self) -> Option<&MapState> {
        self.state.as_ref()
    }

    /// Refresca el mapa (FOKER-SPEC §8.4). Sin cambios en disco no recalcula nada (REQ-MAP-003).
    pub fn refresh(&mut self, options: &RefreshOptions) -> Result<RefreshReport, EngineError> {
        let started = Instant::now();
        let previous = self.map().cloned();
        if !options.full && self.state.is_some() {
            let discovery = discover(&self.root, &self.config).map_err(BuildError::from)?;
            if fingerprint(&discovery) == self.fingerprint {
                self.stale_files = 0;
                return Ok(RefreshReport {
                    added: Vec::new(),
                    changed: Vec::new(),
                    removed: Vec::new(),
                    diagnostics: Vec::new(),
                    duration_ms: elapsed_ms(started),
                    content_hash: self
                        .map()
                        .map(|m| m.content_hash.clone())
                        .unwrap_or_default(),
                    rebuilt: false,
                    unchanged: true,
                });
            }
        }
        let rebuilt = options.full || self.state.is_none();
        if options.full {
            self.cache = ParseCache::new();
        }
        let state = build(&self.root, &self.config, &mut self.cache)?;
        // La huella es la de los archivos que leyó este build: un cambio posterior se detectará.
        self.fingerprint = fingerprint(&state.discovery);
        self.stale_files = 0;

        let old: BTreeMap<&str, &str> = previous
            .as_ref()
            .map(|m| {
                m.files
                    .iter()
                    .map(|f| (f.id.as_str(), f.hash.as_str()))
                    .collect()
            })
            .unwrap_or_default();
        let new: BTreeMap<&str, &str> = state
            .map
            .files
            .iter()
            .map(|f| (f.id.as_str(), f.hash.as_str()))
            .collect();
        let added = new
            .keys()
            .filter(|id| !old.contains_key(*id))
            .map(|s| (*s).to_owned())
            .collect();
        let removed = old
            .keys()
            .filter(|id| !new.contains_key(*id))
            .map(|s| (*s).to_owned())
            .collect();
        let changed = new
            .iter()
            .filter(|(id, hash)| old.get(*id).is_some_and(|h| h != *hash))
            .map(|(id, _)| (*id).to_owned())
            .collect();
        let old_diags: BTreeSet<&MapDiagnostic> = previous
            .as_ref()
            .map(|m| m.diagnostics.iter().collect())
            .unwrap_or_default();
        let diagnostics = state
            .map
            .diagnostics
            .iter()
            .filter(|d| !old_diags.contains(d))
            .cloned()
            .collect();
        let content_hash = state.map.content_hash.clone();
        self.state = Some(state);
        self.map = None;
        Ok(RefreshReport {
            added,
            changed,
            removed,
            diagnostics,
            duration_ms: elapsed_ms(started),
            content_hash,
            rebuilt,
            unchanged: false,
        })
    }

    /// Estado resumido. `stale_files` refleja la última comprobación (ver [`MapEngine::check_stale`]).
    pub fn status(&self) -> MapStatus {
        let map = self.map();
        MapStatus {
            content_hash: map.map(|m| m.content_hash.clone()).unwrap_or_default(),
            files: map.map_or(0, |m| m.files.len()),
            symbols: map.map_or(0, |m| m.symbols.len()),
            stale_files: self.stale_files,
            schema_version: crate::MAP_SCHEMA_VERSION,
        }
    }

    /// Cuenta archivos cuyo tamaño o mtime difiere del mapa (sin reconstruir).
    pub fn check_stale(&mut self) -> Result<usize, EngineError> {
        let discovery = discover(&self.root, &self.config).map_err(BuildError::from)?;
        let (current, reference) = if self.state.is_some() {
            (fingerprint(&discovery), self.fingerprint.clone())
        } else {
            // Mapa cargado del disco: solo conocemos los archivos fuente.
            let current: Fingerprint = discovery
                .sources
                .iter()
                .map(|c| (c.id.clone(), (c.size, c.mtime_ns)))
                .collect();
            let reference: Fingerprint = self
                .map
                .as_ref()
                .map(|m| {
                    m.files
                        .iter()
                        .map(|f| (f.id.clone(), (f.size_bytes, f.mtime_ns)))
                        .collect()
                })
                .unwrap_or_default();
            (current, reference)
        };
        let ids: BTreeSet<&String> = current.keys().chain(reference.keys()).collect();
        self.stale_files = ids
            .into_iter()
            .filter(|id| current.get(*id) != reference.get(*id))
            .count();
        Ok(self.stale_files)
    }

    /// Guarda el mapa y la caché de parseo bajo el lock del root.
    pub fn save(&mut self) -> Result<SaveReport, EngineError> {
        let map = self.map().cloned().ok_or_else(|| StoreError::Write {
            path: crate::store::MAP_FILE.into(),
            message: "no hay mapa: ejecuta refresh antes de save".into(),
        })?;
        let mut lock = MapLock::open(&self.root)?;
        let cache = &self.cache;
        let root = &self.root;
        let report = lock.with_exclusive(crate::store::LOCK_TIMEOUT, || {
            let report = save_map(root, &map);
            // La caché solo acelera; un fallo al guardarla no invalida el mapa.
            let _ = save_parse_cache(root, cache);
            report
        })??;
        Ok(report)
    }
}

fn elapsed_ms(started: Instant) -> u64 {
    u64::try_from(started.elapsed().as_millis()).unwrap_or(u64::MAX)
}
