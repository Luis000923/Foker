//! Selección voraz con degradación y presupuesto conservador (FKR-033).
use crate::{
    ContextError, ExcludedFile, PackFile, RenderLevel,
    rank::{Candidate, eligible},
    render::{self, SectionText},
};
use foker_map::build::MapState;
use std::{
    collections::{BTreeMap, BTreeSet},
    path::Path,
};

/// Identificador versionado del estimador.
pub const ESTIMATOR: &str = "bytes-lf/3.2@1";
/// ceil(bytes UTF-8 tras CRLF→LF / 3,2), calculado sin aritmética flotante.
pub fn estimate_tokens(text: &str) -> usize {
    let bytes = text.len()
        - text
            .as_bytes()
            .windows(2)
            .filter(|pair| *pair == b"\r\n")
            .count();
    bytes.saturating_mul(5).div_ceil(16)
}
/// Resultado interno de selección.
pub struct Selection {
    /// Metadatos de archivos.
    pub files: Vec<PackFile>,
    /// Sección core.
    pub core: SectionText,
    /// Sección related.
    pub related: SectionText,
    /// Sección targets.
    pub targets: SectionText,
    /// Descartes.
    pub excluded: Vec<ExcludedFile>,
}
type RenderedFile = (PackFile, String);
fn render_candidate(
    index: &render::RenderIndex<'_>,
    root: &Path,
    candidate: &Candidate,
    level: RenderLevel,
    note: Option<String>,
) -> Result<RenderedFile, ContextError> {
    let body = render::file_body_indexed(index, root, &candidate.id, level)?;
    let mut file = PackFile {
        id: candidate.id.clone(),
        level,
        tokens: 0,
        score: candidate.score,
        reasons: candidate.reasons.clone(),
        note,
    };
    let text = render::file(&file, &body);
    file.tokens = estimate_tokens(&text);
    Ok((file, text))
}
const OMITTED: &str =
    "contenido completo omitido por presupuesto; léalo con su herramienta de lectura";
/// Core independiente de la tarea: los N primeros del PageRank global hasta 10 % de B.
fn core(
    state: &MapState,
    root: &Path,
    index: &render::RenderIndex<'_>,
    n: usize,
    budget: usize,
    params: &crate::ContextParams,
) -> Result<(SectionText, Vec<PackFile>), ContextError> {
    let mut files: Vec<_> = state.map.files.iter().filter(|f| eligible(f)).collect();
    files.sort_by(|a, b| {
        b.rank_global
            .total_cmp(&a.rank_global)
            .then(a.id.cmp(&b.id))
    });
    let mut body = String::new();
    let mut selected = Vec::new();
    for file in files.into_iter().take(n) {
        let candidate = Candidate {
            id: file.id.clone(),
            score: file.rank_global,
            reasons: vec!["CORE".into()],
            anchor: false,
        };
        let (file, text) = render_candidate(index, root, &candidate, RenderLevel::L0, None)?;
        if estimate_tokens(&format!("## core\n\n{body}{text}\n"))
            <= (budget as f64 * params.core_fraction).floor() as usize
        {
            body.push_str(&text);
            selected.push(file);
        }
    }
    Ok((
        SectionText::new("core", "optional", "static", &body),
        selected,
    ))
}
/// Reserva todas las anclas a L1 antes de subir sus niveles, evitando truncarlas silenciosamente.
pub fn select(
    state: &MapState,
    root: &Path,
    ranked: &[Candidate],
    fixed: &[SectionText],
    budget: usize,
    core_files: usize,
    params: &crate::ContextParams,
) -> Result<Selection, ContextError> {
    let index = render::RenderIndex::new(state);
    let mut capacity = (budget as f64 * (1.0 - params.margin_fraction)).floor() as usize;
    let mut breakdown: Vec<_> = fixed
        .iter()
        .filter(|s| s.section.tokens > 0)
        .map(|s| (s.section.id.clone(), s.section.tokens))
        .collect();
    let fixed_cost = breakdown.iter().map(|(_, cost)| cost).sum::<usize>();
    let target_header = estimate_tokens("## targets\n\n\n");
    let related_header = estimate_tokens("## related\n\n\n");
    let mut anchors = Vec::new();
    for candidate in ranked.iter().filter(|c| c.anchor) {
        let pair = render_candidate(
            &index,
            root,
            candidate,
            RenderLevel::L1,
            Some(OMITTED.into()),
        )?;
        breakdown.push((candidate.id.clone(), pair.0.tokens));
        anchors.push(pair);
    }
    let minimum = fixed_cost
        + anchors.iter().map(|p| p.0.tokens).sum::<usize>()
        + if anchors.is_empty() { 0 } else { target_header };
    if minimum > budget {
        return Err(ContextError::BudgetExceeded {
            limit: budget,
            required: minimum,
            breakdown,
        });
    }
    capacity = capacity.max(minimum);
    let (mut core, mut core_selected) = core(state, root, &index, core_files, budget, params)?;
    let mut used = minimum;
    // Core es opcional; nunca provoca un fallo de contexto obligatorio.
    if used + core.section.tokens + related_header > capacity {
        core = SectionText::new("core", "optional", "static", "");
        core_selected.clear();
    }
    used += core.section.tokens;
    let mut targets = String::new();
    let mut selected = Vec::new();
    for (candidate, minimum_pair) in ranked.iter().filter(|c| c.anchor).zip(anchors) {
        used -= minimum_pair.0.tokens;
        let full = render_candidate(&index, root, candidate, RenderLevel::L3, None)?;
        let choices = if full.0.tokens > (budget as f64 * params.anchor_fraction).floor() as usize {
            vec![
                render_candidate(
                    &index,
                    root,
                    candidate,
                    RenderLevel::L2,
                    Some(OMITTED.into()),
                )?,
                minimum_pair,
            ]
        } else {
            vec![
                full,
                render_candidate(
                    &index,
                    root,
                    candidate,
                    RenderLevel::L2,
                    Some(OMITTED.into()),
                )?,
                minimum_pair,
            ]
        };
        let pair = choices
            .into_iter()
            .find(|p| used + p.0.tokens <= capacity)
            .expect("L1 ya reservado");
        used += pair.0.tokens;
        targets.push_str(&pair.1);
        selected.push(pair.0);
    }
    let mut related = String::new();
    let mut omitted = BTreeMap::new();
    let mut included: BTreeSet<_> = selected.iter().map(|f| f.id.clone()).collect();
    for (position, candidate) in ranked.iter().filter(|c| !c.anchor).enumerate() {
        let levels = if position < params.l2_count {
            vec![RenderLevel::L2, RenderLevel::L1]
        } else {
            vec![RenderLevel::L1]
        };
        let mut accepted = false;
        for level in levels {
            let pair = render_candidate(&index, root, candidate, level, None)?;
            let header = if related.is_empty() {
                related_header
            } else {
                0
            };
            if used + header + pair.0.tokens <= capacity {
                used += header + pair.0.tokens;
                related.push_str(&pair.1);
                included.insert(candidate.id.clone());
                selected.push(pair.0);
                accepted = true;
                break;
            }
        }
        if !accepted {
            omitted.insert(candidate.id.clone(), "BUDGET");
        }
    }
    if capacity.saturating_sub(used) > (budget as f64 * params.l0_min_fraction).floor() as usize {
        let mut outlines = 0;
        for candidate in ranked.iter().filter(|c| !included.contains(&c.id)) {
            if outlines == params.l0_count {
                break;
            }
            let pair = render_candidate(&index, root, candidate, RenderLevel::L0, None)?;
            let header = if related.is_empty() {
                related_header
            } else {
                0
            };
            if used + header + pair.0.tokens <= capacity {
                used += header + pair.0.tokens;
                related.push_str(&pair.1);
                selected.push(pair.0);
                omitted.remove(&candidate.id);
                outlines += 1;
            }
        }
    }
    // Core cuenta como inclusión; si el archivo se selecciona a un nivel superior conserva CORE.
    for mut file in core_selected {
        if let Some(existing) = selected.iter_mut().find(|f| f.id == file.id) {
            existing.reasons.push("CORE".into());
            existing.reasons.sort();
            existing.reasons.dedup();
        } else {
            // El texto core usa centralidad global para mantener su estabilidad;
            // los metadatos files siempre exponen la puntuación final de la tarea.
            if let Some(candidate) = ranked.iter().find(|c| c.id == file.id) {
                file.score = candidate.score;
            }
            omitted.remove(&file.id);
            selected.push(file);
        }
    }
    let included: BTreeSet<_> = selected.iter().map(|f| f.id.as_str()).collect();
    let excluded = ranked
        .iter()
        .filter(|c| !included.contains(c.id.as_str()))
        .take(20)
        .map(|c| ExcludedFile {
            id: c.id.clone(),
            score: c.score,
            reason: omitted.get(&c.id).unwrap_or(&"RANK_CUTOFF").to_string(),
        })
        .collect();
    Ok(Selection {
        files: selected,
        core,
        related: SectionText::new("related", "optional", "task", &related),
        targets: SectionText::new("targets", "mandatory", "task", &targets),
        excluded,
    })
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn estimator_is_utf8_lf_ceil() {
        assert_eq!(estimate_tokens(""), 0);
        assert_eq!(estimate_tokens("éé"), 2);
        assert_eq!(estimate_tokens("a\r\nb"), estimate_tokens("a\nb"));
        assert_eq!(estimate_tokens("1234567890123456"), 5);
    }
}
