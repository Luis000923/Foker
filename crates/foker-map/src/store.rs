//! Persistencia del Project Map en `.foker/` (FOKER-SPEC §8.6; FKR-026).
//!
//! - Escritura atómica: `<archivo>.tmp-<pid>-<n>` → `fsync` → `rename` (en Windows con reintentos
//!   ante `EPERM`/`EACCES` de antivirus).
//! - Lock exclusivo `.foker/map.lock` (lock de archivo del SO) durante refresh + save; si no se
//!   obtiene en 10 s → `FKR-MAP-006`.
//! - Carga: JSON → `schema_version` → `content_hash`. Si algo falla, el archivo se mueve a
//!   `.foker/cache/corrupt-<timestamp>.json` y se reconstruye; nunca se repara parcialmente.

use std::fs::{self, File, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::thread;
use std::time::{Duration, Instant, SystemTime};

use fd_lock::RwLock;

use crate::FokerCode;
use crate::build::ParseCache;
use crate::model::ProjectMap;

/// Directorio de estado de Foker dentro del root.
pub const STATE_DIR: &str = ".foker";
/// Id del mapa persistido.
pub const MAP_FILE: &str = ".foker/project-map.json";
/// Id del lock.
pub const LOCK_FILE: &str = ".foker/map.lock";
/// Id de la caché de parseo (no normativa: acelera el primer refresco de cada proceso).
pub const PARSE_CACHE_FILE: &str = ".foker/cache/parse-cache.json";
/// Espera máxima por el lock.
pub const LOCK_TIMEOUT: Duration = Duration::from_secs(10);

static TMP_COUNTER: AtomicU64 = AtomicU64::new(0);

/// Error de persistencia.
#[derive(Debug, thiserror::Error)]
pub enum StoreError {
    /// No se pudo escribir.
    #[error("no se pudo guardar {path}: {message}")]
    Write {
        /// Ruta relativa.
        path: String,
        /// Mensaje.
        message: String,
    },
    /// Lock ocupado.
    #[error("el mapa está bloqueado por otro proceso (.foker/map.lock); reintenta")]
    Locked,
    /// No se pudo abrir el lock.
    #[error("no se pudo abrir .foker/map.lock: {0}")]
    Lock(String),
}

impl StoreError {
    /// Código público.
    pub fn code(&self) -> FokerCode {
        match self {
            StoreError::Write { .. } => FokerCode::Map004,
            StoreError::Locked => FokerCode::Map006,
            StoreError::Lock(_) => FokerCode::Map004,
        }
    }
}

/// Resultado de cargar el mapa persistido.
#[derive(Debug)]
pub enum Loaded {
    /// No había mapa.
    Missing,
    /// Mapa válido.
    Valid(Box<ProjectMap>),
    /// Mapa corrupto o incompatible (`FKR-MAP-005`): movido a `moved_to` (id relativo).
    Corrupt {
        /// Motivo.
        reason: String,
        /// Copia en `.foker/cache/`, si se pudo mover.
        moved_to: Option<String>,
    },
}

/// Informe de guardado.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SaveReport {
    /// Id relativo del mapa.
    pub path: String,
    /// Bytes escritos.
    pub bytes: u64,
    /// `content_hash`.
    pub content_hash: String,
}

/// Escribe `bytes` en `path` de forma atómica.
pub fn write_atomic(path: &Path, bytes: &[u8]) -> io::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let n = TMP_COUNTER.fetch_add(1, Ordering::Relaxed);
    let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("file");
    let tmp = path.with_file_name(format!("{name}.tmp-{}-{n}", std::process::id()));
    let result = (|| {
        let mut file = File::create(&tmp)?;
        file.write_all(bytes)?;
        file.sync_all()?;
        drop(file);
        rename_with_retries(&tmp, path)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    result
}

fn rename_with_retries(from: &Path, to: &Path) -> io::Result<()> {
    let mut attempt = 0;
    loop {
        match fs::rename(from, to) {
            Ok(()) => return Ok(()),
            // Windows: el antivirus o un lector pueden tener el destino abierto un instante.
            Err(e)
                if cfg!(windows) && attempt < 5 && e.kind() == io::ErrorKind::PermissionDenied =>
            {
                attempt += 1;
                thread::sleep(Duration::from_millis(50));
            }
            Err(e) => return Err(e),
        }
    }
}

/// Lock exclusivo del mapa de un root.
pub struct MapLock {
    lock: RwLock<File>,
}

impl MapLock {
    /// Abre (o crea) `.foker/map.lock`.
    pub fn open(root: &Path) -> Result<Self, StoreError> {
        let path = root.join(LOCK_FILE);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| StoreError::Lock(e.to_string()))?;
        }
        let file = OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(&path)
            .map_err(|e| StoreError::Lock(e.to_string()))?;
        Ok(MapLock {
            lock: RwLock::new(file),
        })
    }

    /// Ejecuta `f` con el lock exclusivo; espera como máximo `timeout`.
    pub fn with_exclusive<T>(
        &mut self,
        timeout: Duration,
        f: impl FnOnce() -> T,
    ) -> Result<T, StoreError> {
        let started = Instant::now();
        loop {
            match self.lock.try_write() {
                Ok(_guard) => return Ok(f()),
                Err(e) if e.kind() == io::ErrorKind::WouldBlock => {
                    if started.elapsed() >= timeout {
                        return Err(StoreError::Locked);
                    }
                    thread::sleep(Duration::from_millis(25));
                }
                Err(e) => return Err(StoreError::Lock(e.to_string())),
            }
        }
    }
}

fn corrupt_name() -> String {
    let nanos = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map_or(0, |d| d.as_nanos());
    format!(".foker/cache/corrupt-{nanos}.json")
}

/// Carga `.foker/project-map.json`. Un archivo inválido se aparta a `.foker/cache/`.
pub fn load_map(root: &Path) -> Loaded {
    load_map_with(root, true)
}

/// Valida el mapa sin apartar archivos corruptos ni crear directorios.
pub fn load_map_read_only(root: &Path) -> Loaded {
    load_map_with(root, false)
}

fn load_map_with(root: &Path, move_corrupt: bool) -> Loaded {
    let path = root.join(MAP_FILE);
    let bytes = match fs::read(&path) {
        Ok(bytes) => bytes,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Loaded::Missing,
        Err(e) => {
            return Loaded::Corrupt {
                reason: format!("no se pudo leer: {e}"),
                moved_to: None,
            };
        }
    };
    let parsed = serde_json::from_slice::<serde_json::Value>(&bytes)
        .map_err(|e| format!("JSON inválido: {e}"))
        .and_then(|doc| ProjectMap::from_value(&doc).map_err(|e| e.to_string()));
    match parsed {
        Ok(map) => Loaded::Valid(Box::new(map)),
        Err(reason) => {
            if !move_corrupt {
                return Loaded::Corrupt {
                    reason,
                    moved_to: None,
                };
            }
            let target = corrupt_name();
            let moved = fs::create_dir_all(root.join(".foker/cache"))
                .and_then(|()| fs::rename(&path, root.join(&target)))
                .is_ok();
            Loaded::Corrupt {
                reason,
                moved_to: moved.then_some(target),
            }
        }
    }
}

/// Guarda el mapa (JSON canónico + salto de línea final).
pub fn save_map(root: &Path, map: &ProjectMap) -> Result<SaveReport, StoreError> {
    let json = map.to_canonical_json() + "\n";
    let path = root.join(MAP_FILE);
    let mut last_error = None;
    // FOKER-SPEC §18: FKR-MAP-004 se reintenta automáticamente hasta 3 veces.
    for _ in 0..3 {
        match write_atomic(&path, json.as_bytes()) {
            Ok(()) => {
                return Ok(SaveReport {
                    path: MAP_FILE.to_owned(),
                    bytes: json.len() as u64,
                    content_hash: map.content_hash.clone(),
                });
            }
            Err(e) => last_error = Some(e),
        }
    }
    Err(StoreError::Write {
        path: MAP_FILE.to_owned(),
        message: last_error.map(|e| e.to_string()).unwrap_or_default(),
    })
}

/// Carga la caché de parseo; si falta o es de otra versión, devuelve una vacía.
pub fn load_parse_cache(root: &Path) -> ParseCache {
    fs::read(root.join(PARSE_CACHE_FILE))
        .ok()
        .and_then(|bytes| serde_json::from_slice::<ParseCache>(&bytes).ok())
        .filter(ParseCache::is_compatible)
        .unwrap_or_default()
}

/// Guarda la caché de parseo. Un fallo no es grave: solo hace más lento el siguiente proceso.
pub fn save_parse_cache(root: &Path, cache: &ParseCache) -> io::Result<()> {
    let json = serde_json::to_vec(cache).map_err(io::Error::other)?;
    write_atomic(&root.join(PARSE_CACHE_FILE), &json)
}

/// Ruta absoluta de un archivo de estado.
pub fn state_path(root: &Path, id: &str) -> PathBuf {
    root.join(id)
}
