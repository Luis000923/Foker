//! Normalización y validación de rutas (REQ-XPLAT-001…003, FOKER-SPEC §7.6).
//!
//! Implementación única para todo Foker: cualquier ruta que llegue de un agente, de la CLI o de la
//! configuración pasa por aquí antes de tocar el disco. Un id de archivo es POSIX, relativo al root,
//! en NFC y sin segmentos `.` ni `..`.

use std::ffi::OsStr;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use unicode_normalization::UnicodeNormalization;

use crate::FokerCode;

/// Motivo por el que se rechaza una ruta. Todos se informan como `FKR-POL-001`.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum PathError {
    /// Cadena vacía.
    #[error("ruta vacía")]
    Empty,
    /// Contiene el carácter NUL.
    #[error("la ruta contiene el carácter NUL")]
    Nul,
    /// Empieza por `/` (o `\`).
    #[error("ruta absoluta no permitida: {0}")]
    Absolute(String),
    /// Empieza por un prefijo de unidad como `C:`.
    #[error("prefijo de unidad no permitido: {0}")]
    DrivePrefix(String),
    /// Ruta UNC (`\\servidor\recurso` o `//servidor/recurso`).
    #[error("ruta UNC no permitida: {0}")]
    Unc(String),
    /// Un `..` sale del root.
    #[error("la ruta sale del root: {0}")]
    Escapes(String),
    /// La ruta normalizada es el propio root, que no es un archivo.
    #[error("la ruta apunta al root: {0}")]
    Root(String),
    /// `:` en un nombre en Windows (flujo de datos alternativo).
    #[error("nombre con ':' no permitido en Windows (flujo alternativo): {0}")]
    AlternateStream(String),
    /// Nombre de dispositivo reservado en Windows (`CON`, `NUL`, `COM1`…).
    #[error("nombre reservado en Windows: {0}")]
    Reserved(String),
    /// Un enlace simbólico de la ruta apunta fuera del root (o no se puede resolver).
    #[error("enlace simbólico fuera del root o roto: {0}")]
    SymlinkOutside(String),
    /// Error de E/S al comprobar la ruta en disco.
    #[error("no se pudo comprobar {path}: {message}")]
    Io {
        /// Ruta afectada.
        path: String,
        /// Mensaje del sistema operativo.
        message: String,
    },
}

impl PathError {
    /// Código de error público (FOKER-SPEC §18).
    pub fn code(&self) -> FokerCode {
        FokerCode::Pol001
    }
}

/// Reglas dependientes de la plataforma.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PathRules {
    /// Aplica las restricciones de nombres de Windows (`:` y dispositivos reservados).
    pub windows: bool,
}

impl PathRules {
    /// Reglas del sistema operativo actual.
    pub const fn host() -> Self {
        PathRules {
            windows: cfg!(windows),
        }
    }
}

const RESERVED: [&str; 22] = [
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
    "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

fn is_reserved(segment: &str) -> bool {
    let stem = segment
        .split('.')
        .next()
        .unwrap_or(segment)
        .trim_end_matches(' ');
    RESERVED.iter().any(|r| r.eq_ignore_ascii_case(stem))
}

fn check_segment(segment: &str, rules: PathRules) -> Result<(), PathError> {
    if rules.windows {
        if segment.contains(':') {
            return Err(PathError::AlternateStream(segment.to_owned()));
        }
        if is_reserved(segment) {
            return Err(PathError::Reserved(segment.to_owned()));
        }
    }
    Ok(())
}

/// Normaliza una ruta de forma léxica (sin tocar el disco) con las reglas del sistema actual.
pub fn normalize_lexical(input: &str) -> Result<String, PathError> {
    normalize_lexical_with(input, PathRules::host())
}

/// Normaliza una ruta de forma léxica con reglas explícitas.
///
/// `\` se trata como separador en todas las plataformas, para que una misma entrada produzca el
/// mismo id en Linux, macOS y Windows.
pub fn normalize_lexical_with(input: &str, rules: PathRules) -> Result<String, PathError> {
    if input.is_empty() {
        return Err(PathError::Empty);
    }
    if input.contains('\0') {
        return Err(PathError::Nul);
    }
    let unified = input.replace('\\', "/");
    if unified.starts_with("//") {
        return Err(PathError::Unc(input.to_owned()));
    }
    if unified.starts_with('/') {
        return Err(PathError::Absolute(input.to_owned()));
    }
    let bytes = unified.as_bytes();
    if bytes.len() >= 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':' {
        return Err(PathError::DrivePrefix(input.to_owned()));
    }

    let nfc: String = unified.nfc().collect();
    let mut parts: Vec<&str> = Vec::new();
    for segment in nfc.split('/') {
        match segment {
            "" | "." => {}
            ".." => {
                if parts.pop().is_none() {
                    return Err(PathError::Escapes(input.to_owned()));
                }
            }
            name => {
                check_segment(name, rules)?;
                parts.push(name);
            }
        }
    }
    if parts.is_empty() {
        return Err(PathError::Root(input.to_owned()));
    }
    Ok(parts.join("/"))
}

fn io_error(path: &Path, error: &io::Error) -> PathError {
    PathError::Io {
        path: path.display().to_string(),
        message: error.to_string(),
    }
}

fn nfc(name: &OsStr) -> Option<String> {
    name.to_str().map(|s| s.nfc().collect())
}

/// Nombre real en disco de `segment` dentro de `dir`, en NFC.
///
/// En sistemas de archivos que no distinguen mayúsculas, devuelve la grafía del disco
/// (REQ-XPLAT-002). Requiere que la entrada exista.
fn disk_name(dir: &Path, segment: &str) -> Result<String, PathError> {
    let entries = fs::read_dir(dir).map_err(|e| io_error(dir, &e))?;
    let wanted_lower = segment.to_lowercase();
    let mut folded: Option<String> = None;
    for entry in entries {
        let entry = entry.map_err(|e| io_error(dir, &e))?;
        let Some(name) = nfc(&entry.file_name()) else {
            continue;
        };
        if name == segment {
            return Ok(name);
        }
        if folded.is_none() && name.to_lowercase() == wanted_lower {
            folded = Some(name);
        }
    }
    // Existe (symlink_metadata lo encontró) pero el listado no lo muestra con esa grafía:
    // sistema de archivos que pliega mayúsculas o normaliza Unicode.
    Ok(folded.unwrap_or_else(|| segment.to_owned()))
}

/// Normaliza `input` respecto a `root` y lo valida contra el disco (REQ-XPLAT-001…003).
///
/// - Aplica [`normalize_lexical`].
/// - Si la ruta (o parte de ella) existe, usa la grafía real del disco y rechaza cualquier enlace
///   simbólico cuyo destino real quede fuera del root.
/// - Una ruta inexistente es válida (p. ej. un archivo que el agente va a crear).
pub fn normalize_path(root: &Path, input: &str) -> Result<String, PathError> {
    normalize_path_with(root, input, PathRules::host())
}

/// [`normalize_path`] con reglas explícitas.
pub fn normalize_path_with(
    root: &Path,
    input: &str,
    rules: PathRules,
) -> Result<String, PathError> {
    let lexical = normalize_lexical_with(input, rules)?;
    let root_real = fs::canonicalize(root).map_err(|e| io_error(root, &e))?;
    let segments: Vec<&str> = lexical.split('/').collect();

    let mut current: PathBuf = root_real.clone();
    let mut out: Vec<String> = Vec::with_capacity(segments.len());
    for (i, segment) in segments.iter().enumerate() {
        let candidate = current.join(segment);
        let meta = match fs::symlink_metadata(&candidate) {
            Ok(meta) => meta,
            Err(e) if e.kind() == io::ErrorKind::NotFound => {
                out.extend(segments[i..].iter().map(|s| (*s).to_owned()));
                return Ok(out.join("/"));
            }
            Err(e) => return Err(io_error(&candidate, &e)),
        };
        let name = disk_name(&current, segment)?;
        let next = current.join(&name);
        if meta.file_type().is_symlink() {
            match fs::canonicalize(&next) {
                Ok(target) if target.starts_with(&root_real) => {}
                _ => return Err(PathError::SymlinkOutside(lexical.clone())),
            }
        }
        out.push(name);
        current = next;
    }
    Ok(out.join("/"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    const UNIX: PathRules = PathRules { windows: false };
    const WINDOWS: PathRules = PathRules { windows: true };

    #[test]
    fn normalizes_separators_and_dots() {
        assert_eq!(
            normalize_lexical_with("src/a.ts", UNIX).unwrap(),
            "src/a.ts"
        );
        assert_eq!(
            normalize_lexical_with("./src//a.ts/", UNIX).unwrap(),
            "src/a.ts"
        );
        assert_eq!(
            normalize_lexical_with("src\\lib\\a.ts", UNIX).unwrap(),
            "src/lib/a.ts"
        );
        assert_eq!(normalize_lexical_with("a/b/../c", UNIX).unwrap(), "a/c");
        assert_eq!(
            normalize_lexical_with(".foker/x.json", UNIX).unwrap(),
            ".foker/x.json"
        );
    }

    #[test]
    fn converts_to_nfc() {
        let nfd = "cafe\u{301}.ts";
        assert_eq!(normalize_lexical_with(nfd, UNIX).unwrap(), "caf\u{e9}.ts");
    }

    #[test]
    fn rejects_dangerous_inputs() {
        type Check = fn(&PathError) -> bool;
        let cases: [(&str, Check); 9] = [
            ("", |e| matches!(e, PathError::Empty)),
            ("a\0b", |e| matches!(e, PathError::Nul)),
            ("/etc/passwd", |e| matches!(e, PathError::Absolute(_))),
            ("\\Windows\\x", |e| matches!(e, PathError::Absolute(_))),
            ("C:/x", |e| matches!(e, PathError::DrivePrefix(_))),
            ("c:x", |e| matches!(e, PathError::DrivePrefix(_))),
            ("\\\\server\\share", |e| matches!(e, PathError::Unc(_))),
            ("a/../../b", |e| matches!(e, PathError::Escapes(_))),
            ("a/..", |e| matches!(e, PathError::Root(_))),
        ];
        for (input, check) in cases {
            let error = normalize_lexical_with(input, UNIX).unwrap_err();
            assert!(check(&error), "{input:?} → {error:?}");
            assert_eq!(error.code(), FokerCode::Pol001);
        }
    }

    #[test]
    fn windows_rules_reject_streams_and_devices() {
        assert!(matches!(
            normalize_lexical_with("a.ts:secret", WINDOWS),
            Err(PathError::AlternateStream(_))
        ));
        for name in [
            "CON",
            "con.ts",
            "src/nul.txt",
            "Com1",
            "LPT9.log",
            "aux .md",
        ] {
            assert!(
                matches!(
                    normalize_lexical_with(name, WINDOWS),
                    Err(PathError::Reserved(_))
                ),
                "{name}"
            );
        }
        assert_eq!(
            normalize_lexical_with("console.ts", WINDOWS).unwrap(),
            "console.ts"
        );
        assert_eq!(
            normalize_lexical_with("src/aux.ts", UNIX).unwrap(),
            "src/aux.ts"
        );
        assert_eq!(
            normalize_lexical_with("src/a:b.ts", UNIX).unwrap(),
            "src/a:b.ts"
        );
    }

    #[test]
    fn resolves_against_disk() {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir_all(dir.path().join("src/lib")).unwrap();
        fs::write(dir.path().join("src/lib/a.ts"), "").unwrap();
        assert_eq!(
            normalize_path(dir.path(), "src/lib/a.ts").unwrap(),
            "src/lib/a.ts"
        );
        assert_eq!(
            normalize_path(dir.path(), "src/new/b.ts").unwrap(),
            "src/new/b.ts"
        );
        assert!(matches!(
            normalize_path(dir.path(), "../x"),
            Err(PathError::Escapes(_))
        ));
    }

    #[test]
    fn disk_names_are_nfc() {
        let dir = tempfile::tempdir().unwrap();
        let nfd = "cafe\u{301}.ts";
        if fs::write(dir.path().join(nfd), "").is_ok() {
            assert_eq!(normalize_path(dir.path(), nfd).unwrap(), "caf\u{e9}.ts");
        }
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlinks_outside_root() {
        use std::os::unix::fs::symlink;
        let outside = tempfile::tempdir().unwrap();
        fs::write(outside.path().join("secret.txt"), "x").unwrap();
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir(dir.path().join("src")).unwrap();
        fs::write(dir.path().join("src/a.ts"), "").unwrap();
        symlink(outside.path(), dir.path().join("out")).unwrap();
        symlink(dir.path().join("src"), dir.path().join("inside")).unwrap();
        symlink(dir.path().join("missing"), dir.path().join("broken")).unwrap();

        assert!(matches!(
            normalize_path(dir.path(), "out/secret.txt"),
            Err(PathError::SymlinkOutside(_))
        ));
        assert!(matches!(
            normalize_path(dir.path(), "out"),
            Err(PathError::SymlinkOutside(_))
        ));
        assert!(matches!(
            normalize_path(dir.path(), "broken"),
            Err(PathError::SymlinkOutside(_))
        ));
        assert_eq!(
            normalize_path(dir.path(), "inside/a.ts").unwrap(),
            "inside/a.ts"
        );
    }

    fn segment() -> impl Strategy<Value = String> {
        prop_oneof![
            Just("a".to_owned()),
            Just("b".to_owned()),
            Just(".".to_owned()),
            Just("..".to_owned()),
            Just("".to_owned()),
            "[a-z]{1,3}".prop_map(|s| s),
        ]
    }

    fn joined() -> impl Strategy<Value = String> {
        (
            prop::collection::vec(segment(), 1..8),
            prop::collection::vec(prop_oneof![Just('/'), Just('\\')], 8),
        )
            .prop_map(|(segments, seps)| {
                let mut out = String::new();
                for (i, s) in segments.iter().enumerate() {
                    if i > 0 {
                        out.push(seps[i % seps.len()]);
                    }
                    out.push_str(s);
                }
                out
            })
    }

    /// Profundidad mínima alcanzada al recorrer los segmentos: < 0 significa que sale del root.
    fn min_depth(input: &str) -> i32 {
        let mut depth = 0;
        let mut min = 0;
        for s in input.split(['/', '\\']) {
            match s {
                "" | "." => {}
                ".." => depth -= 1,
                _ => depth += 1,
            }
            min = min.min(depth);
        }
        min
    }

    proptest! {
        #[test]
        fn lexical_is_idempotent_and_never_escapes(input in joined()) {
            match normalize_lexical_with(&input, UNIX) {
                Ok(id) => {
                    prop_assert_eq!(normalize_lexical_with(&id, UNIX).unwrap(), id.clone());
                    prop_assert!(!id.starts_with('/'));
                    prop_assert!(id.split('/').all(|s| !s.is_empty() && s != "." && s != ".."));
                    prop_assert!(min_depth(&input) >= 0);
                }
                Err(PathError::Escapes(_)) => prop_assert!(min_depth(&input) < 0),
                Err(PathError::Root(_)) => prop_assert!(min_depth(&input) >= 0),
                Err(PathError::Empty) => prop_assert!(input.is_empty()),
                Err(PathError::Absolute(_) | PathError::Unc(_)) => prop_assert!(input.starts_with(['/', '\\'])),
                Err(other) => prop_assert!(false, "error inesperado {:?}", other),
            }
        }
    }
}
