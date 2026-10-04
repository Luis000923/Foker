//! Información del workspace: tipo de monorepo y paquetes (`project` del Project Map).

use std::collections::BTreeMap;
use std::fs;

use serde_json::Value;

use crate::discover::{Candidate, Discovery};

/// Tipo de workspace (`project.workspace_kind`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum WorkspaceKind {
    /// `pnpm-workspace.yaml` en el root.
    Pnpm,
    /// `workspaces` en el package.json raíz sin `yarn.lock`.
    Npm,
    /// `workspaces` en el package.json raíz con `yarn.lock`.
    Yarn,
    /// Paquete único.
    Single,
}

impl WorkspaceKind {
    /// Valor en el esquema.
    pub fn as_str(self) -> &'static str {
        match self {
            WorkspaceKind::Pnpm => "pnpm",
            WorkspaceKind::Npm => "npm",
            WorkspaceKind::Yarn => "yarn",
            WorkspaceKind::Single => "single",
        }
    }
}

/// Paquete del workspace (un `package.json` con `name`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Package {
    /// `pkg:<name>`.
    pub id: String,
    /// Nombre npm.
    pub name: String,
    /// Directorio relativo al root (`.` para el root).
    pub path: String,
    /// Versión declarada.
    pub version: Option<String>,
    /// Dependencias con protocolo `workspace:` (nombres), ordenadas.
    pub workspace_deps: Vec<String>,
    /// `exports` del package.json, si lo tiene.
    pub exports: Option<Value>,
}

impl Package {
    /// `true` si `id` está dentro del directorio del paquete.
    pub fn contains(&self, id: &str) -> bool {
        self.path == "." || id.starts_with(&format!("{}/", self.path))
    }
}

/// Workspace del proyecto.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Workspace {
    /// Nombre del proyecto (package.json raíz o directorio).
    pub name: String,
    /// Tipo.
    pub kind: WorkspaceKind,
    /// Paquetes ordenados por id.
    pub packages: Vec<Package>,
}

impl Workspace {
    /// Paquete más profundo que contiene `id`.
    pub fn package_of(&self, id: &str) -> Option<&Package> {
        self.packages
            .iter()
            .filter(|p| p.contains(id))
            .max_by_key(|p| if p.path == "." { 0 } else { p.path.len() + 1 })
    }

    /// Paquete por nombre npm.
    pub fn by_name(&self, name: &str) -> Option<&Package> {
        self.packages.iter().find(|p| p.name == name)
    }
}

fn read_json(candidate: &Candidate) -> Option<Value> {
    serde_json::from_slice(&fs::read(&candidate.path).ok()?).ok()
}

fn parent_dir(id: &str) -> String {
    id.rsplit_once('/')
        .map_or_else(|| ".".to_owned(), |(dir, _)| dir.to_owned())
}

/// Lee los manifiestos descubiertos y construye el workspace. Determinista: no depende del orden
/// de lectura ni de la hora.
pub fn load_workspace(discovery: &Discovery, root_name: &str, has_yarn_lock: bool) -> Workspace {
    let mut packages = BTreeMap::new();
    let mut root_manifest: Option<Value> = None;
    let mut has_pnpm_workspace = false;
    for manifest in &discovery.manifests {
        if manifest.id == "pnpm-workspace.yaml" {
            has_pnpm_workspace = true;
            continue;
        }
        if !manifest.id.ends_with("package.json") {
            continue;
        }
        let Some(json) = read_json(manifest) else {
            continue;
        };
        let path = parent_dir(&manifest.id);
        if path == "." {
            root_manifest = Some(json.clone());
        }
        let Some(name) = json.get("name").and_then(Value::as_str) else {
            continue;
        };
        let mut workspace_deps: Vec<String> = [
            "dependencies",
            "devDependencies",
            "peerDependencies",
            "optionalDependencies",
        ]
        .iter()
        .filter_map(|field| json.get(*field).and_then(Value::as_object))
        .flat_map(|deps| deps.iter())
        .filter(|(_, version)| {
            version
                .as_str()
                .is_some_and(|v| v.starts_with("workspace:"))
        })
        .map(|(dep, _)| dep.clone())
        .collect();
        workspace_deps.sort();
        workspace_deps.dedup();
        let id = format!("pkg:{name}");
        packages.entry(id.clone()).or_insert(Package {
            id,
            name: name.to_owned(),
            path,
            version: json
                .get("version")
                .and_then(Value::as_str)
                .map(String::from),
            workspace_deps,
            exports: json.get("exports").cloned(),
        });
    }
    let has_workspaces_field = root_manifest
        .as_ref()
        .is_some_and(|m| m.get("workspaces").is_some());
    let kind = if has_pnpm_workspace {
        WorkspaceKind::Pnpm
    } else if has_workspaces_field && has_yarn_lock {
        WorkspaceKind::Yarn
    } else if has_workspaces_field {
        WorkspaceKind::Npm
    } else {
        WorkspaceKind::Single
    };
    let name = root_manifest
        .as_ref()
        .and_then(|m| m.get("name"))
        .and_then(Value::as_str)
        .map_or_else(|| root_name.to_owned(), String::from);
    Workspace {
        name,
        kind,
        packages: packages.into_values().collect(),
    }
}
