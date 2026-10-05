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
    explain: bool,
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
    let text = render::file(&file, &body, explain);
    file.tokens = estimate_tokens(&text);
    Ok((file, text))
}
const OMITTED: &str =
    "contenido completo omitido por presupuesto; léalo con su herramienta de lectura";
fn section(id: &str, files: &[RenderedFile]) -> SectionText {
    render::files_section(
        id,
        if id == "targets" {
            "mandatory"
        } else {
            "optional"
        },
        "task",
        files,
    )
}
/// Reserva todas las anclas a L1 antes de subir niveles; corta la cola por suficiencia.
pub fn select(
    state: &MapState,
    root: &Path,
    ranked: &[Candidate],
    fixed: &[SectionText],
    request: &crate::NormalizedRequest,
    core_files: usize,
    params: &crate::ContextParams,
) -> Result<Selection, ContextError> {
    let budget = request.budget_tokens;
    let explain = request.explain;
    let intent = request
        .intent
        .unwrap_or_else(|| crate::intent::infer(&request.task));
    let (related_limit, outline_limit) = params.limits(intent);
    let index = render::RenderIndex::new(state);
    let mut capacity = (budget as f64 * (1.0 - params.margin_fraction)).floor() as usize;
    let mut breakdown: Vec<_> = fixed
        .iter()
        .filter(|s| s.section.tokens > 0)
        .map(|s| (s.section.id.clone(), s.section.tokens))
        .collect();
    let fixed_cost = breakdown.iter().map(|(_, cost)| cost).sum::<usize>();
    let render = |candidate: &Candidate, level, note| {
        render_candidate(&index, root, candidate, level, note, explain)
    };
    let mut targets = Vec::new();
    for candidate in ranked.iter().filter(|c| c.anchor) {
        let pair = render(candidate, RenderLevel::L1, Some(OMITTED.into()))?;
        breakdown.push((candidate.id.clone(), pair.0.tokens));
        targets.push(pair);
    }
    let minimum = fixed_cost + section("targets", &targets).section.tokens;
    if minimum > budget {
        return Err(ContextError::BudgetExceeded {
            limit: budget,
            required: minimum,
            breakdown,
        });
    }
    capacity = capacity.max(minimum);
    for (position, candidate) in ranked.iter().filter(|c| c.anchor).enumerate() {
        let minimum_pair = targets[position].clone();
        let full = render(candidate, RenderLevel::L3, None)?;
        let mut choices = Vec::new();
        if full.0.tokens <= (budget as f64 * params.anchor_fraction).floor() as usize {
            choices.push(full);
        }
        choices.push(render(candidate, RenderLevel::L2, Some(OMITTED.into()))?);
        choices.push(minimum_pair);
        for pair in choices {
            targets[position] = pair;
            if fixed_cost + section("targets", &targets).section.tokens <= capacity {
                break;
            }
        }
    }
    let target_section = section("targets", &targets);
    let used = fixed_cost + target_section.section.tokens;
    let mut related = Vec::new();
    let mut omitted = BTreeMap::new();
    let mut included: BTreeSet<_> = targets.iter().map(|p| p.0.id.clone()).collect();
    let maximum = ranked.first().map_or(0.0, |c| c.score);
    let best_optional = ranked.iter().find(|c| !c.anchor).map_or(0.0, |c| c.score);
    let sufficient = |c: &Candidate| {
        !below_relevance(c.score, maximum, params.relevance_fraction)
            && !below_relevance(c.score, best_optional, params.sufficiency_fraction)
    };
    let mut accepted_count = 0;
    for candidate in ranked.iter().filter(|c| !c.anchor) {
        if !sufficient(candidate) || accepted_count >= related_limit {
            omitted.insert(candidate.id.clone(), "RANK_CUTOFF");
            continue;
        }
        let levels: &[RenderLevel] = if accepted_count < params.l2_count {
            &[RenderLevel::L2, RenderLevel::L1]
        } else {
            &[RenderLevel::L1]
        };
        let mut accepted = false;
        for &level in levels {
            related.push(render(candidate, level, None)?);
            if used + section("related", &related).section.tokens <= capacity {
                included.insert(candidate.id.clone());
                accepted_count += 1;
                accepted = true;
                break;
            }
            related.pop();
        }
        if !accepted {
            omitted.insert(candidate.id.clone(), "BUDGET");
        }
    }
    if capacity.saturating_sub(used + section("related", &related).section.tokens)
        > (budget as f64 * params.l0_min_fraction).floor() as usize
    {
        let mut outlines = 0;
        for candidate in ranked.iter().filter(|c| !c.anchor) {
            if included.contains(&candidate.id) || !sufficient(candidate) {
                continue;
            }
            if outlines == outline_limit {
                break;
            }
            related.push(render(candidate, RenderLevel::L0, None)?);
            if used + section("related", &related).section.tokens <= capacity {
                included.insert(candidate.id.clone());
                omitted.remove(&candidate.id);
                outlines += 1;
            } else {
                related.pop();
            }
        }
    }
    let related_section = section("related", &related);
    let mut global: Vec<_> = state.map.files.iter().filter(|f| eligible(f)).collect();
    global.sort_by(|a, b| {
        b.rank_global
            .total_cmp(&a.rank_global)
            .then(a.id.cmp(&b.id))
    });
    let best_global = global.first().map_or(0.0, |f| f.rank_global);
    let minimum_global = global.last().map_or(0.0, |f| f.rank_global);
    let mut core = Vec::new();
    // El mínimo empatado no aporta centralidad significativa. core_files sigue siendo el tope explícito.
    for file in global
        .into_iter()
        .filter(|f| {
            f.rank_global > minimum_global
                && !below_relevance(f.rank_global, best_global, params.core_min_relative)
        })
        .take(core_files)
    {
        if included.contains(&file.id) {
            continue;
        }
        let candidate = Candidate {
            id: file.id.clone(),
            score: ranked
                .iter()
                .find(|c| c.id == file.id)
                .map_or(file.rank_global, |c| c.score),
            reasons: vec!["CORE".into()],
            anchor: false,
        };
        core.push(render(&candidate, RenderLevel::L0, None)?);
        let cost = section("core", &core).section.tokens;
        if cost <= (budget as f64 * params.core_fraction).floor() as usize
            && used + related_section.section.tokens + cost <= capacity
        {
            included.insert(file.id.clone());
            omitted.remove(&file.id);
        } else {
            core.pop();
        }
    }
    let excluded = ranked
        .iter()
        .filter(|c| !included.contains(&c.id))
        .take(20)
        .map(|c| ExcludedFile {
            id: c.id.clone(),
            score: c.score,
            reason: omitted.get(&c.id).unwrap_or(&"RANK_CUTOFF").to_string(),
        })
        .collect();
    Ok(Selection {
        core: section("core", &core),
        related: section("related", &related),
        targets: section("targets", &targets),
        files: targets
            .into_iter()
            .chain(related)
            .chain(core)
            .map(|p| p.0)
            .collect(),
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

/// Corte inclusivo; un máximo nulo no elimina candidatos.
fn below_relevance(score: f64, maximum: f64, fraction: f64) -> bool {
    fraction > 0.0 && maximum > 0.0 && score < maximum * fraction
}

#[cfg(test)]
mod relevance_tests {
    use super::*;
    #[test]
    fn corte_relativo_inclusivo_y_desactivable() {
        assert!(!below_relevance(0.2, 1.0, 0.2));
        assert!(below_relevance(0.19, 1.0, 0.2));
        assert!(!below_relevance(0.0, 1.0, 0.0));
        assert!(!below_relevance(0.0, 0.0, 0.2));
    }
}
