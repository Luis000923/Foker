//! Context Engine determinista de Foker (FOKER-SPEC §9).
pub mod bm25;
pub mod cache;
pub mod compact;
pub mod intent;
pub mod normalize;
pub mod pack;
pub mod params;
pub use params::ContextParams;
pub mod rank;
pub mod render;
pub mod seeds;
pub mod select;
use foker_map::{
    build::MapState,
    canonical::{hash_bytes, to_canonical_string},
};
pub use pack::*;
pub use select::estimate_tokens;
use std::path::Path;
/// Versión en lockstep.
pub const VERSION: &str = env!("CARGO_PKG_VERSION");
/// Versión del formato.
pub const PACK_VERSION: u32 = 2;

/// Construye un pack determinista sin consultar git ni leer configuración TypeScript.
pub fn build_context(
    state: &MapState,
    root: &Path,
    request: &ContextRequest,
    inputs: &ContextInputs,
) -> Result<ContextPack, ContextError> {
    build_with_seed_counts(state, root, request, inputs).map(|(pack, _)| pack)
}

pub(crate) fn build_with_seed_counts(
    state: &MapState,
    root: &Path,
    request: &ContextRequest,
    inputs: &ContextInputs,
) -> Result<(ContextPack, std::collections::BTreeMap<String, usize>), ContextError> {
    let normalized = normalize::request(request, inputs)?;
    let intent = normalized
        .intent
        .unwrap_or_else(|| intent::infer(&normalized.task));
    let tokens = normalize::tokenize(&normalized.task);
    let seeds = seeds::build(&state.map, &normalized, inputs, &tokens)?;
    let params = normalized.params.clone().unwrap_or_default();
    let ranked = rank::rank_with_params(&state.map, &seeds, intent, &params);
    let fixed = render::fixed(inputs, &normalized, intent);
    let selection = select::select(
        state,
        root,
        &ranked,
        &fixed,
        &normalized,
        if inputs.core_files == ContextInputs::default().core_files {
            params.core_files
        } else {
            inputs.core_files
        },
        &params,
    )?;
    let mut fixed = fixed.into_iter();
    let sections_text: Vec<_> = vec![
        fixed.next().expect("rules"),
        selection.core,
        fixed.next().expect("skill"),
        fixed.next().expect("task_scope"),
        selection.related,
        selection.targets,
        fixed.next().expect("request"),
    ]
    .into_iter()
    .map(|s| compact::section(s, compact::Options::ALL))
    .collect();
    let rendered = sections_text
        .iter()
        .map(|s| s.text.as_str())
        .collect::<String>();
    let used = sections_text
        .iter()
        .map(|s| s.section.tokens)
        .sum::<usize>();
    debug_assert!(estimate_tokens(&rendered) <= used && used <= normalized.budget_tokens);
    let mut bytes = rendered.as_bytes().to_vec();
    bytes.extend_from_slice(
        to_canonical_string(&serde_json::to_value(&selection.files).expect("archivos finitos"))
            .as_bytes(),
    );
    if let Some(params) = &normalized.params {
        bytes.extend_from_slice(
            to_canonical_string(&serde_json::to_value(params).expect("params finitos")).as_bytes(),
        );
    }
    let counts = seeds.counts();
    Ok((
        ContextPack {
            pack_version: PACK_VERSION,
            pack_hash: hash_bytes(&bytes),
            map_hash: state.map.content_hash.clone(),
            intent_source: if normalized.intent.is_some() {
                "request"
            } else {
                "inferred"
            }
            .into(),
            budget: Budget {
                limit: normalized.budget_tokens,
                used,
                estimator: select::ESTIMATOR.into(),
            },
            request: normalized,
            intent,
            sections: sections_text.into_iter().map(|s| s.section).collect(),
            files: selection.files,
            excluded: selection.excluded,
            diagnostics: seeds.diagnostics,
            rendered,
        },
        counts,
    ))
}

#[cfg(test)]
pub(crate) fn fixture_state() -> &'static MapState {
    static STATE: std::sync::OnceLock<MapState> = std::sync::OnceLock::new();
    STATE.get_or_init(|| {
        foker_map::build::build(
            &Path::new(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/monorepo-pnpm"),
            &foker_map::config::MapConfig::default(),
            &mut foker_map::build::ParseCache::new(),
        )
        .unwrap()
    })
}
