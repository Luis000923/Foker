//! FKR-020: descubrimiento de archivos.

use std::fs;
use std::path::Path;

use foker_map::config::MapConfig;
use foker_map::discover::{DiscoveryError, discover};

fn write(root: &Path, id: &str, content: &str) {
    let path = root.join(id);
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, content).unwrap();
}

fn ids(root: &Path, config: &MapConfig) -> Vec<String> {
    discover(root, config)
        .unwrap()
        .sources
        .into_iter()
        .map(|c| c.id)
        .collect()
}

#[test]
fn finds_sources_sorted_and_manifests() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    for id in [
        "src/b.ts",
        "src/a.tsx",
        "lib/c.mjs",
        "lib/d.cjs",
        "e.jsx",
        "types/x.d.ts",
        "README.md",
        "src/s.css",
    ] {
        write(root, id, "export {}\n");
    }
    write(root, "package.json", "{}");
    write(root, "tsconfig.base.json", "{}");
    write(root, "packages/ui/package.json", "{}");
    write(root, "pnpm-workspace.yaml", "packages: []");

    let found = discover(root, &MapConfig::default()).unwrap();
    let sources: Vec<_> = found.sources.iter().map(|c| c.id.as_str()).collect();
    assert_eq!(
        sources,
        [
            "e.jsx",
            "lib/c.mjs",
            "lib/d.cjs",
            "src/a.tsx",
            "src/b.ts",
            "types/x.d.ts"
        ]
    );
    let manifests: Vec<_> = found.manifests.iter().map(|c| c.id.as_str()).collect();
    assert_eq!(
        manifests,
        [
            "package.json",
            "packages/ui/package.json",
            "pnpm-workspace.yaml",
            "tsconfig.base.json"
        ]
    );
    assert!(
        found
            .sources
            .iter()
            .all(|c| c.size == 10 && c.path.is_absolute())
    );
}

#[test]
fn respects_gitignore_and_always_skipped_dirs() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    write(root, ".gitignore", "dist/\n*.gen.ts\n");
    write(root, "packages/ui/.gitignore", "local.ts\n");
    for id in [
        "src/a.ts",
        "dist/a.js",
        "src/x.gen.ts",
        "packages/ui/local.ts",
        "packages/ui/kept.ts",
        "node_modules/react/index.js",
        "packages/ui/node_modules/x/index.js",
        ".foker/cache/x.js",
        ".git/hooks/x.js",
        ".storybook/main.ts",
    ] {
        write(root, id, "");
    }
    assert_eq!(
        ids(root, &MapConfig::default()),
        [".storybook/main.ts", "packages/ui/kept.ts", "src/a.ts"]
    );
}

#[test]
fn applies_include_and_exclude() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    for id in [
        "apps/web/a.ts",
        "apps/web/a.min.js",
        "packages/ui/b.ts",
        "scripts/c.ts",
        "packages/ui/dist/b.js",
    ] {
        write(root, id, "");
    }
    let config = MapConfig {
        include: vec!["apps/**".into(), "packages/**".into()],
        exclude: vec!["**/dist/**".into(), "**/*.min.js".into()],
        ..MapConfig::default()
    };
    assert_eq!(ids(root, &config), ["apps/web/a.ts", "packages/ui/b.ts"]);
}

#[test]
fn never_reads_secrets() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    write(root, "src/a.ts", "");
    write(root, ".env", "API_KEY=sk-falso");
    write(root, "apps/web/.env.local", "X=1");
    write(root, "src/secrets/token.ts", "export const t = 'x'");
    write(root, "certs/server.key.js", "");
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        // Si Foker intentara abrir o hacer stat de verdad sobre el contenido, un archivo ilegible
        // produciría un diagnóstico; no debe aparecer ninguno.
        fs::set_permissions(root.join(".env"), fs::Permissions::from_mode(0o000)).unwrap();
    }
    let config = MapConfig {
        secret_globs: [MapConfig::default().secret_globs, vec!["**/*.key.*".into()]].concat(),
        ..MapConfig::default()
    };
    let found = discover(root, &config).unwrap();
    assert_eq!(
        found
            .sources
            .iter()
            .map(|c| c.id.as_str())
            .collect::<Vec<_>>(),
        ["src/a.ts"]
    );
    assert!(found.diagnostics.is_empty(), "{:?}", found.diagnostics);
}

#[test]
fn marks_oversized_files_and_enforces_max_files() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    write(root, "big.ts", &"x".repeat(2048));
    write(root, "small.ts", "");
    let config = MapConfig {
        max_file_bytes: 1024,
        ..MapConfig::default()
    };
    let found = discover(root, &config).unwrap();
    assert_eq!(found.sources.len(), 2);
    assert_eq!(found.oversized, ["big.ts"]);
    assert_eq!(found.diagnostics.len(), 1);
    assert_eq!(found.diagnostics[0].code, "FKR-MAP-102");

    let limited = MapConfig {
        max_files: 1,
        ..MapConfig::default()
    };
    let error = discover(root, &limited).unwrap_err();
    assert!(matches!(error, DiscoveryError::TooManyFiles { limit: 1 }));
    assert_eq!(error.code().as_str(), "FKR-MAP-003");
}

#[test]
fn invalid_globs_are_input_errors() {
    let dir = tempfile::tempdir().unwrap();
    let config = MapConfig {
        include: vec!["src/[".into()],
        ..MapConfig::default()
    };
    assert_eq!(
        discover(dir.path(), &config).unwrap_err().code().as_str(),
        "FKR-INP-001"
    );
}

#[cfg(unix)]
#[test]
fn does_not_follow_symlinks_outside_root() {
    use std::os::unix::fs::symlink;
    let outside = tempfile::tempdir().unwrap();
    write(outside.path(), "lib/x.ts", "");
    write(outside.path(), "y.ts", "");
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    write(root, "src/a.ts", "");
    symlink(outside.path().join("lib"), root.join("linked-dir")).unwrap();
    symlink(outside.path().join("y.ts"), root.join("src/outside.ts")).unwrap();
    symlink(root.join("src/a.ts"), root.join("src/alias.ts")).unwrap();

    let found = discover(root, &MapConfig::default()).unwrap();
    let sources: Vec<_> = found.sources.iter().map(|c| c.id.as_str()).collect();
    assert_eq!(sources, ["src/a.ts", "src/alias.ts"]);
    let skipped: Vec<_> = found
        .diagnostics
        .iter()
        .map(|d| (d.code, d.subject.as_str()))
        .collect();
    assert_eq!(skipped, [("FKR-MAP-103", "src/outside.ts")]);
}

#[test]
fn ids_are_nfc() {
    let dir = tempfile::tempdir().unwrap();
    write(dir.path(), "src/cafe\u{301}.ts", "");
    assert_eq!(ids(dir.path(), &MapConfig::default()), ["src/caf\u{e9}.ts"]);
}
