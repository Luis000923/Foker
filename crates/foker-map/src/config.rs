//! Configuración efectiva del Project Map (sección `map` de foker.config.yaml ya fusionada con los
//! defaults por `@foker/engine`, más los globs de secretos de la política).

/// Tamaño máximo por defecto de un archivo que se parsea: 1 MiB (FOKER-SPEC §8.3).
pub const DEFAULT_MAX_FILE_BYTES: u64 = 1024 * 1024;
/// Número máximo por defecto de archivos fuente: 50.000.
pub const DEFAULT_MAX_FILES: usize = 50_000;

/// Globs que asignan `files[].kind`; lo que no casa con ninguno es `source`.
#[derive(Debug, Clone, Default, PartialEq, Eq, serde::Serialize)]
pub struct KindGlobs {
    /// Tests.
    pub test: Vec<String>,
    /// Declaraciones (además de `*.d.ts`, que siempre lo son).
    pub declaration: Vec<String>,
    /// Configuración.
    pub config: Vec<String>,
    /// Generados (excluidos del Context Pack).
    pub generated: Vec<String>,
}

impl KindGlobs {
    /// Valores por defecto de Foker.
    pub fn defaults() -> Self {
        KindGlobs {
            test: vec![
                "**/*.test.*".into(),
                "**/*.spec.*".into(),
                "**/__tests__/**".into(),
                "**/test/**".into(),
                "**/tests/**".into(),
                "**/e2e/**".into(),
            ],
            declaration: vec![],
            config: vec![
                "*.config.*".into(),
                "**/.eslintrc.*".into(),
                "**/.prettierrc.*".into(),
            ],
            generated: vec![
                "**/*.generated.*".into(),
                "**/__generated__/**".into(),
                "**/generated/**".into(),
            ],
        }
    }
}

/// Configuración del mapa.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct MapConfig {
    /// Globs incluidos; vacío = todo el árbol.
    pub include: Vec<String>,
    /// Globs excluidos (después de include).
    pub exclude: Vec<String>,
    /// tsconfig a usar en la resolución.
    pub tsconfig: Vec<String>,
    /// Globs de secretos: nunca se leen ni entran en el mapa.
    pub secret_globs: Vec<String>,
    /// Archivos más grandes se registran como `skipped`.
    pub max_file_bytes: u64,
    /// Más archivos fuente → `FKR-MAP-003`.
    pub max_files: usize,
    /// Clasificación de archivos.
    pub kinds: KindGlobs,
}

impl Default for MapConfig {
    fn default() -> Self {
        MapConfig {
            include: vec![],
            exclude: vec![],
            tsconfig: vec!["tsconfig.json".into()],
            secret_globs: default_secret_globs(),
            max_file_bytes: DEFAULT_MAX_FILE_BYTES,
            max_files: DEFAULT_MAX_FILES,
            kinds: KindGlobs::defaults(),
        }
    }
}

/// Mayor entero representable sin pérdida en un `f64` de JavaScript (`Number.MAX_SAFE_INTEGER`).
pub const MAX_SAFE_INTEGER: f64 = 9_007_199_254_740_991.0;

/// Convierte un número de JavaScript en un límite de bytes. Rechaza valores no finitos, fuera de
/// `1..=MAX_SAFE_INTEGER` y decimales: `v as u64` truncaría `1.5` a `1` sin avisar.
pub fn checked_byte_limit(v: f64) -> Option<u64> {
    if v.is_finite() && v.fract() == 0.0 && (1.0..=MAX_SAFE_INTEGER).contains(&v) {
        Some(v as u64)
    } else {
        None
    }
}

/// Globs de secretos de la política por defecto (FOKER-SPEC §11.3).
pub fn default_secret_globs() -> Vec<String> {
    [
        ".env",
        ".env.*",
        "**/*.pem",
        "**/*.key",
        "**/id_rsa*",
        "**/*.p12",
        "**/.npmrc",
        "**/secrets/**",
    ]
    .into_iter()
    .map(String::from)
    .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn checked_byte_limit_rechaza_decimales() {
        assert_eq!(checked_byte_limit(1.5), None);
        assert_eq!(checked_byte_limit(1024.0001), None);
    }

    #[test]
    fn checked_byte_limit_rechaza_no_finitos_y_fuera_de_rango() {
        for v in [
            f64::NAN,
            f64::INFINITY,
            f64::NEG_INFINITY,
            0.0,
            -1.0,
            MAX_SAFE_INTEGER + 2.0,
        ] {
            assert_eq!(checked_byte_limit(v), None, "{v}");
        }
    }

    #[test]
    fn checked_byte_limit_acepta_enteros() {
        assert_eq!(checked_byte_limit(1.0), Some(1));
        assert_eq!(checked_byte_limit(2048.0), Some(2048));
        assert_eq!(
            checked_byte_limit(MAX_SAFE_INTEGER),
            Some(9_007_199_254_740_991)
        );
    }
}
