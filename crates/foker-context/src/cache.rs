//! LRU opcional en memoria (§9.10), separado de la función pura de construcción.
use crate::{
    ContextError, ContextInputs, ContextPack, ContextRequest, build_with_seed_counts, normalize,
};
use foker_map::{
    build::MapState,
    canonical::{hash_bytes, to_canonical_string},
};
use std::{
    collections::{BTreeMap, VecDeque},
    path::Path,
    time::Instant,
};
/// Métricas de ejecución fuera de los bytes deterministas del pack.
#[derive(Debug, Clone)]
pub struct BuildMetrics {
    /// Duración de esta llamada.
    pub duration_micros: u128,
    /// Hit de caché Foker.
    pub cache_hit: bool,
    /// Archivos por nivel L0–L3.
    pub files_per_level: [usize; 4],
    /// Fracción de presupuesto utilizada.
    pub utilization: f64,
    /// Tokens por sección, incluidos cabeceras y delimitadores.
    pub section_tokens: BTreeMap<String, usize>,
    /// Archivos-semilla por fuente (antes de la poda).
    pub seeds_per_source: BTreeMap<String, usize>,
}
/// Caché LRU de 64 packs; el propietario del motor sincroniza su acceso.
#[derive(Debug, Default)]
pub struct ContextCache {
    entries: VecDeque<(String, ContextPack, BTreeMap<String, usize>)>,
}
impl ContextCache {
    /// Construye o reutiliza un pack. Los inputs son parte de la configuración efectiva.
    pub fn build(
        &mut self,
        state: &MapState,
        root: &Path,
        request: &ContextRequest,
        inputs: &ContextInputs,
    ) -> Result<(ContextPack, BuildMetrics), ContextError> {
        let start = Instant::now();
        let normalized = normalize::request(request, inputs)?;
        let key = hash_bytes(
            to_canonical_string(&serde_json::json!([
                crate::VERSION,
                state.map.config_hash,
                state.map.content_hash,
                normalized,
                inputs
            ]))
            .as_bytes(),
        );
        let (pack, counts, cache_hit) =
            if let Some(index) = self.entries.iter().position(|(k, _, _)| k == &key) {
                let entry = self.entries.remove(index).expect("índice existente");
                let pack = entry.1.clone();
                let counts = entry.2.clone();
                self.entries.push_front(entry);
                (pack, counts, true)
            } else {
                let (pack, counts) = build_with_seed_counts(state, root, request, inputs)?;
                self.entries.push_front((key, pack.clone(), counts.clone()));
                self.entries.truncate(64);
                (pack, counts, false)
            };
        let mut levels = [0; 4];
        for file in &pack.files {
            levels[match file.level {
                crate::RenderLevel::L0 => 0,
                crate::RenderLevel::L1 => 1,
                crate::RenderLevel::L2 => 2,
                crate::RenderLevel::L3 => 3,
            }] += 1;
        }
        let metrics = BuildMetrics {
            duration_micros: start.elapsed().as_micros(),
            cache_hit,
            section_tokens: pack
                .sections
                .iter()
                .map(|s| (s.id.clone(), s.tokens))
                .collect(),
            seeds_per_source: counts,
            files_per_level: levels,
            utilization: pack.budget.used as f64 / pack.budget.limit as f64,
        };
        Ok((pack, metrics))
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn lru_capacity_and_eviction() {
        let state = crate::fixture_state();
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/monorepo-pnpm");
        let mut cache = ContextCache::default();
        for index in 0..65 {
            let request = ContextRequest {
                task: format!("xyzzy{index}"),
                ..Default::default()
            };
            let (_, metrics) = cache
                .build(state, &root, &request, &ContextInputs::default())
                .unwrap();
            assert!(!metrics.cache_hit);
        }
        assert_eq!(cache.entries.len(), 64);
        let request = ContextRequest {
            task: "xyzzy64".into(),
            ..Default::default()
        };
        assert!(
            cache
                .build(state, &root, &request, &ContextInputs::default())
                .unwrap()
                .1
                .cache_hit
        );
        let request = ContextRequest {
            task: "xyzzy0".into(),
            ..Default::default()
        };
        assert!(
            !cache
                .build(state, &root, &request, &ContextInputs::default())
                .unwrap()
                .1
                .cache_hit
        );
    }
}
