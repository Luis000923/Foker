//! Configuración efectiva del Project Map (sección `map` de foker.config.yaml ya fusionada con los
//! defaults por `@foker/engine`, más los globs de secretos de la política).

/// Tamaño máximo por defecto de un archivo que se parsea: 1 MiB (FOKER-SPEC §8.3).
pub const DEFAULT_MAX_FILE_BYTES: u64 = 1024 * 1024;
/// Número máximo por defecto de archivos fuente: 50.000.
pub const DEFAULT_MAX_FILES: usize = 50_000;

/// Globs que asignan `files[].kind`; lo que no casa con ninguno es `source`.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
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
#[derive(Debug, Clone, PartialEq, Eq)]
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
