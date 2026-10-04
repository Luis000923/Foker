//! Resolución de imports con `oxc_resolver` (FOKER-SPEC §8.3, paso 5; REQ-MAP-004; FKR-023).

use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};

use oxc_resolver::{
    AliasValue, ResolveError, ResolveOptions, Resolver, TsconfigDiscovery, TsconfigOptions,
    TsconfigReferences,
};
use serde_json::Value;

use crate::config::MapConfig;
use crate::discover::Discovery;
use crate::glob::{GlobError, GlobMatcher};
use crate::path::normalize_lexical;
use crate::project::Workspace;

/// Condiciones de `exports` en orden de preferencia (FOKER-SPEC §8.3).
pub const CONDITIONS: [&str; 5] = ["types", "import", "require", "node", "default"];

/// Resultado de resolver un especificador.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum Outcome {
    /// Archivo fuente del mapa.
    File(String),
    /// Módulo externo: `npm:<paquete>` o `node:<módulo>`.
    External(String),
    /// Resuelve a un archivo del root que no es fuente del mapa (CSS, JSON, excluido…): sin arista.
    NotSource(String),
    /// No resuelto (`FKR-MAP-104`), con el motivo.
    Unresolved(String),
}

/// Nombre del paquete npm de un especificador sin prefijo relativo, si es un nombre válido.
pub fn package_name(specifier: &str) -> Option<&str> {
    let valid = |segment: &str| {
        !segment.is_empty()
            && !segment.starts_with('.')
            && !segment.starts_with('_')
            && !segment.starts_with('~')
            && segment.chars().all(|c| {
                c.is_ascii_lowercase() || c.is_ascii_digit() || matches!(c, '-' | '.' | '_' | '~')
            })
    };
    let mut parts = specifier.splitn(3, '/');
    let first = parts.next()?;
    if let Some(scope) = first.strip_prefix('@') {
        let name = parts.next()?;
        (valid(scope) && valid(name)).then(|| &specifier[..first.len() + 1 + name.len()])
    } else {
        valid(first).then_some(first)
    }
}

fn is_relative_or_absolute(specifier: &str) -> bool {
    specifier.starts_with("./")
        || specifier.starts_with("../")
        || specifier == "."
        || specifier == ".."
        || specifier.starts_with('/')
        || specifier.starts_with('\\')
        || specifier.as_bytes().get(1) == Some(&b':')
}

/// Elige el destino de una entrada de `exports` según [`CONDITIONS`].
fn pick_export_target(value: &Value) -> Option<&str> {
    match value {
        Value::String(s) => Some(s),
        Value::Object(map) => CONDITIONS
            .iter()
            .find_map(|c| map.get(*c))
            .and_then(pick_export_target),
        Value::Array(items) => items.iter().find_map(pick_export_target),
        _ => None,
    }
}

/// Alias de los paquetes del workspace: subrutas exactas de `exports` primero y, al final, el
/// nombre del paquete apuntando a su directorio (lo resuelve `main`/`types`/`index`).
fn workspace_aliases(root: &Path, workspace: &Workspace) -> Vec<(String, Vec<AliasValue>)> {
    let mut exact = Vec::new();
    let mut dirs = Vec::new();
    for package in &workspace.packages {
        let dir = if package.path == "." {
            root.to_path_buf()
        } else {
            root.join(&package.path)
        };
        if let Some(exports) = &package.exports {
            let entries: Vec<(String, &Value)> = match exports {
                Value::Object(map) if map.keys().any(|k| k.starts_with('.')) => {
                    map.iter().map(|(k, v)| (k.clone(), v)).collect()
                }
                other => vec![(".".to_owned(), other)],
            };
            for (key, value) in entries {
                if key.contains('*') {
                    continue;
                }
                let Some(target) = pick_export_target(value) else {
                    continue;
                };
                let specifier = format!("{}{}$", package.name, key.trim_start_matches('.'));
                let file = dir.join(target.trim_start_matches("./"));
                exact.push((
                    specifier,
                    vec![AliasValue::Path(file.to_string_lossy().into_owned())],
                ));
            }
        }
        dirs.push((
            package.name.clone(),
            vec![AliasValue::Path(dir.to_string_lossy().into_owned())],
        ));
    }
    exact.sort_by(|a, b| a.0.cmp(&b.0));
    dirs.sort_by(|a, b| a.0.cmp(&b.0));
    exact.into_iter().chain(dirs).collect()
}

fn base_options(aliases: Vec<(String, Vec<AliasValue>)>) -> ResolveOptions {
    let strings = |items: &[&str]| items.iter().map(|s| (*s).to_owned()).collect::<Vec<_>>();
    ResolveOptions {
        alias: aliases,
        condition_names: strings(&CONDITIONS),
        extensions: strings(&[
            ".ts", ".tsx", ".d.ts", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts",
        ]),
        extension_alias: vec![
            (
                ".js".into(),
                strings(&[".ts", ".tsx", ".d.ts", ".js", ".jsx"]),
            ),
            (".jsx".into(), strings(&[".tsx", ".jsx"])),
            (".mjs".into(), strings(&[".mts", ".d.mts", ".mjs"])),
            (".cjs".into(), strings(&[".cts", ".d.cts", ".cjs"])),
        ],
        main_fields: strings(&["types", "typings", "module", "main"]),
        allow_package_exports_in_directory_resolve: true,
        builtin_modules: true,
        symlinks: true,
        ..ResolveOptions::default()
    }
}

/// Resolutores por tsconfig, cada uno con su caché.
pub struct ResolverSet {
    root: PathBuf,
    /// tsconfig (id de directorio → resolutor), ordenados del más profundo al menos profundo.
    scoped: Vec<(String, Resolver)>,
    fallback: Resolver,
    sources: BTreeSet<String>,
}

impl ResolverSet {
    /// Prepara la resolución para un árbol ya descubierto. `root` debe ser la ruta canónica.
    pub fn new(
        root: &Path,
        discovery: &Discovery,
        workspace: &Workspace,
        config: &MapConfig,
    ) -> Result<Self, GlobError> {
        let tsconfig_globs = GlobMatcher::new(&config.tsconfig, false)?;
        let fallback = Resolver::new(base_options(workspace_aliases(root, workspace)));
        let mut scoped: Vec<(String, Resolver)> = discovery
            .manifests
            .iter()
            .filter(|m| {
                let name = m.id.rsplit('/').next().unwrap_or(&m.id);
                (name.starts_with("tsconfig") || name.starts_with("jsconfig"))
                    && tsconfig_globs.is_match(&m.id)
            })
            .map(|m| {
                let dir =
                    m.id.rsplit_once('/')
                        .map_or(String::new(), |(d, _)| d.to_owned());
                let mut options = base_options(workspace_aliases(root, workspace));
                options.tsconfig = Some(TsconfigDiscovery::Manual(TsconfigOptions {
                    config_file: m.path.clone(),
                    references: TsconfigReferences::Auto,
                }));
                // Caché propia: compartirla entre opciones distintas (tsconfig) da resultados que dependen
                // del orden de ejecución en paralelo.
                (dir, Resolver::new(options))
            })
            .collect();
        // Más profundo primero; a igual profundidad, `tsconfig.json` gana por orden de id.
        scoped.sort_by(|a, b| b.0.len().cmp(&a.0.len()).then_with(|| a.0.cmp(&b.0)));
        scoped.dedup_by(|a, b| a.0 == b.0);
        Ok(ResolverSet {
            root: root.to_path_buf(),
            scoped,
            fallback,
            sources: discovery.sources.iter().map(|c| c.id.clone()).collect(),
        })
    }

    fn resolver_for(&self, importer: &str) -> &Resolver {
        self.scoped
            .iter()
            .find(|(dir, _)| dir.is_empty() || importer.starts_with(&format!("{dir}/")))
            .map_or(&self.fallback, |(_, r)| r)
    }

    fn to_id(&self, path: &Path) -> Option<String> {
        let relative = path.strip_prefix(&self.root).ok()?;
        normalize_lexical(relative.to_str()?).ok()
    }

    /// Resuelve `specifier` importado desde el archivo `importer` (id).
    pub fn resolve(&self, importer: &str, specifier: &str) -> Outcome {
        let importer_path = self.root.join(importer);
        match self
            .resolver_for(importer)
            .resolve_file(&importer_path, specifier)
        {
            Ok(resolution) => {
                let path = resolution.path();
                let inside_node_modules =
                    path.components().any(|c| c.as_os_str() == "node_modules");
                match self.to_id(path) {
                    Some(id) if !inside_node_modules && self.sources.contains(&id) => {
                        Outcome::File(id)
                    }
                    Some(id) if !inside_node_modules => Outcome::NotSource(id),
                    _ => match package_name(specifier) {
                        Some(name) => Outcome::External(format!("npm:{name}")),
                        None => Outcome::Unresolved("resuelve fuera del root".into()),
                    },
                }
            }
            Err(ResolveError::Builtin { resolved, .. }) => {
                Outcome::External(format!("node:{}", resolved.trim_start_matches("node:")))
            }
            Err(ResolveError::Ignored(_)) => {
                Outcome::Unresolved("ignorado por el resolutor".into())
            }
            Err(error) => {
                // Un paquete npm sin instalar es externo; un relativo o un alias que no resuelve es un error.
                if !is_relative_or_absolute(specifier)
                    && let Some(name) = package_name(specifier)
                {
                    return Outcome::External(format!("npm:{name}"));
                }
                Outcome::Unresolved(reason(&error).to_owned())
            }
        }
    }
}

/// Motivo estable (sin rutas absolutas, para que el mapa sea idéntico entre equipos).
fn reason(error: &ResolveError) -> &'static str {
    match error {
        ResolveError::NotFound(_) => "módulo no encontrado",
        ResolveError::MatchedAliasNotFound(..) => "alias sin destino existente",
        ResolveError::TsconfigNotFound(_) => "tsconfig no encontrado",
        ResolveError::TsconfigSelfReference(_) | ResolveError::TsconfigCircularExtend(_) => {
            "tsconfig inválido"
        }
        ResolveError::IOError(_) => "error de E/S al resolver",
        ResolveError::Json(_) => "package.json o tsconfig con JSON inválido",
        _ => "no resoluble",
    }
}

/// Resuelve todos los especificadores únicos de cada archivo: `importer → specifier → outcome`.
pub fn resolve_all<'a>(
    set: &ResolverSet,
    imports: impl IntoIterator<Item = (&'a str, &'a str)>,
) -> BTreeMap<(String, String), Outcome> {
    let mut out = BTreeMap::new();
    for (importer, specifier) in imports {
        out.entry((importer.to_owned(), specifier.to_owned()))
            .or_insert_with(|| set.resolve(importer, specifier));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn package_names() {
        assert_eq!(package_name("react"), Some("react"));
        assert_eq!(package_name("react/jsx-runtime"), Some("react"));
        assert_eq!(package_name("@scope/pkg/sub"), Some("@scope/pkg"));
        assert_eq!(package_name("@/lib/x"), None);
        assert_eq!(package_name("~/lib"), None);
        assert_eq!(package_name("Upper"), None);
        assert_eq!(package_name("./a"), None);
    }

    #[test]
    fn export_targets_follow_condition_order() {
        let value: Value =
            serde_json::json!({ "import": "./a.js", "types": "./a.d.ts", "default": "./a.cjs" });
        assert_eq!(pick_export_target(&value), Some("./a.d.ts"));
        let nested: Value =
            serde_json::json!({ "node": { "require": "./n.cjs" }, "default": "./d.js" });
        assert_eq!(pick_export_target(&nested), Some("./n.cjs"));
    }
}
