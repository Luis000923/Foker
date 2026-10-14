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
/// L2 con el contenido completo del archivo (ADR-034); mismo envoltorio y escape que L2.
fn render_complete_l2(
    index: &render::RenderIndex<'_>,
    root: &Path,
    candidate: &Candidate,
    explain: bool,
) -> Result<RenderedFile, ContextError> {
    let body = render::file_body_indexed(index, root, &candidate.id, RenderLevel::L3)?;
    let mut file = PackFile {
        id: candidate.id.clone(),
        level: RenderLevel::L2,
        tokens: 0,
        score: candidate.score,
        reasons: candidate.reasons.clone(),
        note: None,
    };
    let text = render::file(&file, &body, explain);
    file.tokens = estimate_tokens(&text);
    Ok((file, text))
}
/// Ancla L3 con vista focal (ADR-033); `None` sin foco o sin reducción.
fn focal_candidate(
    symbols: &[&foker_map::model::MapSymbol],
    root: &Path,
    candidate: &Candidate,
    request: &crate::NormalizedRequest,
    params: &crate::ContextParams,
    explain: bool,
) -> Result<Option<RenderedFile>, ContextError> {
    let focal =
        crate::focal::focal_symbols(symbols, &request.task, &request.anchors.symbols, params);
    let source = render::read(root, &candidate.id)?;
    let Some(view) = crate::focal::render(&source, symbols, &focal) else {
        return Ok(None);
    };
    let mut file = PackFile {
        id: candidate.id.clone(),
        level: RenderLevel::L3,
        tokens: 0,
        score: candidate.score,
        reasons: candidate.reasons.clone(),
        // Sin datos del repositorio: la nota se renderiza fuera de foker:file (REQ-CTX-002).
        note: Some(format!(
            "vista focal: {} símbolos completos; {} líneas omitidas",
            view.symbols.len(),
            view.omitted_lines
        )),
    };
    let text = render::file(&file, &view.body, explain);
    file.tokens = estimate_tokens(&text);
    Ok(Some((file, text)))
}
/// D2: firmas del foco léxico; la omisión pertenece al contenido no confiable.
fn related_focal_candidate(
    state: &MapState,
    candidate: &Candidate,
    request: &crate::NormalizedRequest,
    params: &crate::ContextParams,
) -> Option<RenderedFile> {
    let symbols: Vec<_> = state
        .map
        .symbols
        .iter()
        .filter(|s| s.file() == candidate.id)
        .collect();
    let mut focal = crate::focal::focal_symbols(&symbols, &request.task, &[], params);
    focal.truncate(params.focal_max_symbols);
    if focal.is_empty() {
        return None;
    }
    let selected: Vec<_> = symbols.iter().filter(|s| focal.contains(&s.id)).collect();
    let body = format!(
        "// foker: vista focal L1; {} símbolos omitidos\n{}",
        symbols.len() - selected.len(),
        selected
            .iter()
            .map(|s| s.signature.as_str())
            .collect::<Vec<_>>()
            .join("\n")
    );
    let mut file = PackFile {
        id: candidate.id.clone(),
        level: RenderLevel::L1,
        tokens: 0,
        score: candidate.score,
        reasons: candidate.reasons.clone(),
        note: None,
    };
    let text = render::file(&file, &body, request.explain);
    file.tokens = estimate_tokens(&text);
    Some((file, text))
}
const OVERFLOW_OMITTED: &str =
    "contenido omitido por presupuesto; léalo con su herramienta de lectura";
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
    let mut symbols_by_file: Option<BTreeMap<&str, Vec<&foker_map::model::MapSymbol>>> = None;
    for candidate in ranked.iter().filter(|c| c.anchor) {
        let pair = render(candidate, RenderLevel::L1, Some(OMITTED.into()))?;
        breakdown.push((candidate.id.clone(), pair.0.tokens));
        targets.push(pair);
    }
    let mut minimum = fixed_cost + section("targets", &targets).section.tokens;
    // D3: el mínimo de error es L0 para todas las anclas, con omisión explícita.
    if params.anchor_overflow_focal && minimum > budget {
        targets = ranked
            .iter()
            .filter(|c| c.anchor)
            .map(|c| render(c, RenderLevel::L0, Some(OVERFLOW_OMITTED.into())))
            .collect::<Result<_, _>>()?;
        minimum = fixed_cost + section("targets", &targets).section.tokens;
        breakdown.truncate(fixed.iter().filter(|s| s.section.tokens > 0).count());
        breakdown.extend(targets.iter().map(|p| (p.0.id.clone(), p.0.tokens)));
    }
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
        let overflow = minimum_pair.0.level == RenderLevel::L0;
        let fraction = if overflow {
            budget
        } else {
            (budget as f64 * params.anchor_fraction).floor() as usize
        };
        let fits = |targets: &[RenderedFile]| {
            fixed_cost + section("targets", targets).section.tokens <= capacity
        };
        if full.0.tokens <= fraction {
            targets[position] = full.clone();
            if fits(&targets) {
                continue;
            }
        }
        // ADR-033: la vista focal solo sustituye a la degradación (el L3 completo supera
        // anchor_fraction o no cabe en la capacidad restante); nunca a un L3 completo que cabe.
        if overflow || (params.focal_min_tokens > 0 && full.0.tokens > params.focal_min_tokens) {
            let symbols = symbols_by_file
                .get_or_insert_with(|| {
                    let mut by_file: BTreeMap<&str, Vec<&foker_map::model::MapSymbol>> =
                        BTreeMap::new();
                    for symbol in &state.map.symbols {
                        by_file.entry(symbol.file()).or_default().push(symbol);
                    }
                    by_file
                })
                .get(candidate.id.as_str())
                .cloned()
                .unwrap_or_default();
            if let Some(pair) =
                focal_candidate(&symbols, root, candidate, request, params, explain)?
                && pair.0.tokens < full.0.tokens
                && pair.0.tokens <= fraction
            {
                targets[position] = pair;
                if fits(&targets) {
                    continue;
                }
            }
        }
        targets[position] = render(candidate, RenderLevel::L2, Some(OMITTED.into()))?;
        if !fits(&targets) {
            targets[position] = minimum_pair;
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
    let per_file_limit = if params.related_max_fraction > 0.0 {
        (budget as f64 * params.related_max_fraction).floor() as usize
    } else {
        usize::MAX
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
        // ADR-034: un L2 pequeño se entrega completo si cuesta ≤ small_full_max_extra más que
        // sus firmas; sigue siendo L2 (no es objetivo) y prueba antes que L2/L1. Nunca si L2
        // muestra símbolos de otros archivos (barrels): el contenido perdería esos contratos.
        let mut signatures = None;
        if levels[0] == RenderLevel::L2
            && params.small_full_max_extra > 0
            && index.only_own_symbols(&candidate.id)
        {
            let l2 = render(candidate, RenderLevel::L2, None)?;
            let limit = l2.0.tokens + params.small_full_max_extra;
            // Cota inferior barata con el tamaño actual en disco (no el del mapa, que puede estar
            // desactualizado): con CRLF, los bytes LF son al menos la mitad. Evita leer archivos
            // que no pueden cumplir el umbral.
            let lower = foker_map::path::normalize_path(root, &candidate.id)
                .ok()
                .and_then(|path| std::fs::metadata(root.join(path)).ok())
                .map_or(0, |meta| (meta.len() / 2) as usize * 5 / 16);
            // Una lectura fallida descarta la opción y sigue la degradación habitual.
            if lower <= limit
                && let Ok(complete) = render_complete_l2(&index, root, candidate, explain)
                && complete.0.tokens <= limit
                && complete.0.tokens <= per_file_limit
            {
                related.push(complete);
                if used + section("related", &related).section.tokens <= capacity {
                    included.insert(candidate.id.clone());
                    accepted_count += 1;
                    continue;
                }
                related.pop();
            }
            signatures = Some(l2);
        }
        for &level in levels {
            let pair = match (level, signatures.take()) {
                (RenderLevel::L2, Some(pair)) => pair,
                _ => render(candidate, level, None)?,
            };
            let pair = if pair.0.tokens > per_file_limit {
                if level == RenderLevel::L1 && params.related_focal {
                    let Some(focal) = related_focal_candidate(state, candidate, request, params)
                    else {
                        continue;
                    };
                    if focal.0.tokens > per_file_limit {
                        continue;
                    }
                    focal
                } else {
                    continue;
                }
            } else {
                pair
            };
            related.push(pair);
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
/// Corte inclusivo; un máximo nulo no elimina candidatos.
fn below_relevance(score: f64, maximum: f64, fraction: f64) -> bool {
    fraction > 0.0 && maximum > 0.0 && score < maximum * fraction
}
