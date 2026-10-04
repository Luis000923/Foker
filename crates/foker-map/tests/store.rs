//! FKR-026: persistencia atómica, lock y corrupción.

use std::fs;
use std::path::Path;
use std::sync::{Arc, Barrier};
use std::thread;
use std::time::Duration;

use foker_map::build::{ParseCache, build};
use foker_map::config::MapConfig;
use foker_map::store::{
    LOCK_FILE, Loaded, MAP_FILE, MapLock, StoreError, load_map, load_parse_cache, save_map,
    save_parse_cache,
};

fn project(root: &Path) {
    fs::write(
        root.join("a.ts"),
        "import { b } from './b';\nexport const a = b;\n",
    )
    .unwrap();
    fs::write(root.join("b.ts"), "export const b = 1;\n").unwrap();
}

#[test]
fn save_and_load_roundtrip() {
    let dir = tempfile::tempdir().unwrap();
    project(dir.path());
    let state = build(dir.path(), &MapConfig::default(), &mut ParseCache::new()).unwrap();
    let report = save_map(dir.path(), &state.map).unwrap();
    assert_eq!(report.path, MAP_FILE);
    assert_eq!(report.content_hash, state.map.content_hash);
    let Loaded::Valid(loaded) = load_map(dir.path()) else {
        panic!("se esperaba un mapa válido");
    };
    assert_eq!(loaded.to_value(false), state.map.to_value(false));
    assert_eq!(loaded.compute_content_hash(), state.map.content_hash);
    // Sin restos de escrituras temporales.
    let leftovers: Vec<_> = fs::read_dir(dir.path().join(".foker"))
        .unwrap()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_name().to_string_lossy().contains(".tmp-"))
        .collect();
    assert!(leftovers.is_empty());
    // .foker no entra en el mapa.
    let again = build(dir.path(), &MapConfig::default(), &mut ParseCache::new()).unwrap();
    assert_eq!(again.map.content_hash, state.map.content_hash);
}

#[test]
fn missing_map() {
    let dir = tempfile::tempdir().unwrap();
    assert!(matches!(load_map(dir.path()), Loaded::Missing));
}

#[test]
fn corrupt_maps_are_moved_aside() {
    let dir = tempfile::tempdir().unwrap();
    project(dir.path());
    let state = build(dir.path(), &MapConfig::default(), &mut ParseCache::new()).unwrap();
    for corrupt in [
        b"{ no es json".to_vec(),
        state
            .map
            .to_canonical_json()
            .replace("export const b = 1", "export const b = 2")
            .into_bytes(),
        state
            .map
            .to_canonical_json()
            .replace("\"schema_version\":1", "\"schema_version\":99")
            .into_bytes(),
        state
            .map
            .to_canonical_json()
            .replace("\"id\":\"a.ts\"", "\"id\":\"a.tsx\"")
            .into_bytes(),
    ] {
        fs::create_dir_all(dir.path().join(".foker")).unwrap();
        fs::write(dir.path().join(MAP_FILE), &corrupt).unwrap();
        match load_map(dir.path()) {
            Loaded::Corrupt {
                moved_to: Some(moved),
                ..
            } => {
                assert!(moved.starts_with(".foker/cache/corrupt-"), "{moved}");
                assert_eq!(fs::read(dir.path().join(&moved)).unwrap(), corrupt);
                assert!(!dir.path().join(MAP_FILE).exists());
            }
            other => panic!("se esperaba corrupción, obtenido {other:?}"),
        }
    }
    // Tras apartarlo, se reconstruye y guarda con normalidad.
    save_map(dir.path(), &state.map).unwrap();
    assert!(matches!(load_map(dir.path()), Loaded::Valid(_)));
}

#[test]
fn concurrent_writers_never_corrupt_the_map() {
    let dir = tempfile::tempdir().unwrap();
    project(dir.path());
    let state = build(dir.path(), &MapConfig::default(), &mut ParseCache::new()).unwrap();
    let root = Arc::new(dir.path().to_path_buf());
    let map = Arc::new(state.map);
    let barrier = Arc::new(Barrier::new(8));
    let handles: Vec<_> = (0..8)
        .map(|_| {
            let (root, map, barrier) = (Arc::clone(&root), Arc::clone(&map), Arc::clone(&barrier));
            thread::spawn(move || {
                // Cada hilo abre su propio descriptor, como lo haría otro proceso.
                let mut lock = MapLock::open(&root).unwrap();
                barrier.wait();
                for _ in 0..5 {
                    lock.with_exclusive(Duration::from_secs(10), || save_map(&root, &map).unwrap())
                        .unwrap();
                    assert!(matches!(load_map(&root), Loaded::Valid(_)));
                }
            })
        })
        .collect();
    for handle in handles {
        handle.join().unwrap();
    }
    assert!(matches!(load_map(&root), Loaded::Valid(_)));
    assert!(root.join(LOCK_FILE).exists());
}

#[test]
fn busy_lock_times_out_with_map_006() {
    let dir = tempfile::tempdir().unwrap();
    let mut holder = MapLock::open(dir.path()).unwrap();
    let root = dir.path().to_path_buf();
    holder
        .with_exclusive(Duration::from_secs(1), || {
            let waiter = thread::spawn(move || {
                let mut other = MapLock::open(&root).unwrap();
                other
                    .with_exclusive(Duration::from_millis(100), || ())
                    .unwrap_err()
            });
            let error = waiter.join().unwrap();
            assert!(matches!(error, StoreError::Locked));
            assert_eq!(error.code().as_str(), "FKR-MAP-006");
        })
        .unwrap();
}

#[test]
fn parse_cache_roundtrip_and_reuse() {
    let dir = tempfile::tempdir().unwrap();
    project(dir.path());
    let mut cache = ParseCache::new();
    let first = build(dir.path(), &MapConfig::default(), &mut cache).unwrap();
    save_parse_cache(dir.path(), &cache).unwrap();
    let mut loaded = load_parse_cache(dir.path());
    assert_eq!(loaded, cache);
    let second = build(dir.path(), &MapConfig::default(), &mut loaded).unwrap();
    assert_eq!(first.map.content_hash, second.map.content_hash);
    // Una caché corrupta se ignora.
    fs::write(dir.path().join(".foker/cache/parse-cache.json"), b"basura").unwrap();
    assert!(load_parse_cache(dir.path()).entries.is_empty());
}

#[test]
fn read_only_preserves_corrupt_map_and_rejects_save() {
    use foker_map::engine::{EngineError, MapEngine, OpenMode, RefreshOptions};
    use foker_map::store::load_map_read_only;

    let dir = tempfile::tempdir().unwrap();
    project(dir.path());
    fs::create_dir(dir.path().join(".foker")).unwrap();
    let corrupt = b"{ no es json";
    fs::write(dir.path().join(MAP_FILE), corrupt).unwrap();
    let entries = || {
        let mut names: Vec<_> = fs::read_dir(dir.path().join(".foker"))
            .unwrap()
            .map(|entry| entry.unwrap().file_name())
            .collect();
        names.sort();
        names
    };
    let before = entries();
    assert!(matches!(
        load_map_read_only(dir.path()),
        Loaded::Corrupt { moved_to: None, .. }
    ));
    let mut engine =
        MapEngine::open_with(dir.path(), MapConfig::default(), OpenMode::ReadOnly).unwrap();
    assert_eq!(engine.load_diagnostics[0].code, "FKR-MAP-005");
    assert_eq!(engine.load_diagnostics[0].subject, None);
    // Rechaza save incluso sin un mapa en memoria, antes de tocar disco.
    for refreshed in [false, true] {
        if refreshed {
            engine.refresh(&RefreshOptions::default()).unwrap();
        }
        assert!(matches!(
            engine.save(),
            Err(EngineError::Store(StoreError::Write { message, .. }))
                if message == "motor abierto en modo solo lectura"
        ));
        assert_eq!(fs::read(dir.path().join(MAP_FILE)).unwrap(), corrupt);
        assert_eq!(entries(), before);
        assert!(!dir.path().join(".foker/cache").exists());
    }
}

#[test]
fn errores_de_escritura_no_dejan_temporales() {
    use foker_map::store::write_atomic;
    let dir = tempfile::tempdir().unwrap();
    project(dir.path());
    let state = build(dir.path(), &MapConfig::default(), &mut ParseCache::new()).unwrap();
    // Un directorio en el destino fuerza fallo de rename, incluso ejecutando como root.
    fs::create_dir_all(dir.path().join(MAP_FILE)).unwrap();
    let error = save_map(dir.path(), &state.map).unwrap_err();
    assert!(matches!(error, StoreError::Write { .. }));
    assert_eq!(error.code().as_str(), "FKR-MAP-004");
    assert!(dir.path().join(MAP_FILE).is_dir());
    assert!(
        fs::read_dir(dir.path().join(".foker"))
            .unwrap()
            .all(|entry| !entry
                .unwrap()
                .file_name()
                .to_string_lossy()
                .contains(".tmp-"))
    );
    // Un archivo como padre rechaza escrituras y apertura del lock sin alterarlo.
    let blocked = dir.path().join("bloqueado");
    fs::write(&blocked, "conservar").unwrap();
    assert!(write_atomic(&blocked.join("archivo"), b"nuevo").is_err());
    let lock_error = MapLock::open(&blocked).err().unwrap();
    assert!(matches!(lock_error, StoreError::Lock(_)));
    assert_eq!(lock_error.code().as_str(), "FKR-MAP-004");
    assert_eq!(fs::read_to_string(blocked).unwrap(), "conservar");
}
