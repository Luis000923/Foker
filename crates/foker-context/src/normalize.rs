//! Normalización y extracción léxica determinista (FKR-030).
use crate::{Anchors, ContextError, ContextInputs, ContextRequest, NormalizedRequest};
use std::{collections::BTreeSet, sync::OnceLock};
use unicode_normalization::UnicodeNormalization;

/// Listas versionadas con el motor, sin stemming.
pub const STOPWORDS_ES: &str = include_str!("../data/stopwords-es.txt");
/// Stopwords inglesas.
pub const STOPWORDS_EN: &str = include_str!("../data/stopwords-en.txt");
/// LF y NFC, conservando formato de contenido.
pub fn content(text: &str) -> String {
    text.replace("\r\n", "\n").nfc().collect()
}
/// Texto de petición: NFC, LF y espacios colapsados.
pub fn task(text: &str) -> String {
    content(text)
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}
/// Multiconjunto de términos, rutas e identificadores candidatos.
#[derive(Debug, Clone, Default)]
pub struct Tokens {
    /// Multiconjunto ordenado.
    pub terms: Vec<String>,
    /// Candidatos de ruta.
    pub paths: Vec<String>,
    /// Candidatos identificadores.
    pub identifiers: Vec<String>,
}
/// Tokeniza usando los subtérminos compartidos de foker-map.
pub fn tokenize(text: &str) -> Tokens {
    static STOPWORDS: OnceLock<BTreeSet<&'static str>> = OnceLock::new();
    let stop = STOPWORDS.get_or_init(|| {
        STOPWORDS_ES
            .split_whitespace()
            .chain(STOPWORDS_EN.split_whitespace())
            .collect()
    });
    let mut out = Tokens::default();
    let normalized = content(text);
    for token in normalized.split(|c: char| !(c.is_alphanumeric() || "_$-/\\.".contains(c))) {
        let token = token.trim_matches(['.', '-']);
        if token.is_empty() {
            continue;
        }
        let path = token.contains('/')
            || token.contains('\\')
            || [
                ".ts", ".tsx", ".js", ".jsx", ".json", ".md", ".mts", ".cts", ".mjs", ".cjs",
                ".yaml", ".yml", ".css",
            ]
            .iter()
            .any(|ext| token.ends_with(ext));
        let identifier = token
            .chars()
            .next()
            .is_some_and(|c| c.is_alphabetic() || c == '_' || c == '$')
            && token.chars().count() >= 3;
        if path {
            out.paths.push(token.to_owned());
        }
        if identifier && !path {
            out.identifiers.push(token.to_owned());
        }
        if path || identifier {
            out.terms.extend(
                foker_map::text::subterms(token)
                    .into_iter()
                    .filter(|t| !stop.contains(t.as_str())),
            );
        }
    }
    out.terms.sort();
    out.paths.sort();
    out.paths.dedup();
    out.identifiers.sort();
    out.identifiers.dedup();
    out
}
/// Valida límites y normaliza las anclas con la implementación única de rutas.
pub fn request(
    req: &ContextRequest,
    inputs: &ContextInputs,
) -> Result<NormalizedRequest, ContextError> {
    if !(1..=4000).contains(&req.task.chars().count())
        || !(1000..=200000).contains(&req.budget_tokens)
        || req.anchors.files.len() > 20
        || req.anchors.symbols.len() > 20
    {
        return Err(ContextError::InvalidInput(
            "límites de task, anchors o budget_tokens".into(),
        ));
    }
    if let Some(skill) = &inputs.skill
        && (skill.name.is_empty()
            || skill.name.len() > 64
            || skill.name.split('-').any(|part| {
                part.is_empty()
                    || !part
                        .bytes()
                        .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit())
            }))
    {
        return Err(ContextError::InvalidInput(
            "nombre de skill inválido".into(),
        ));
    }
    if let Some(scope) = &inputs.task_scope {
        let id = scope.task_id.strip_prefix("tsk_").unwrap_or_default();
        if id.len() != 26
            || !id
                .bytes()
                .all(|b| b"0123456789ABCDEFGHJKMNPQRSTVWXYZ".contains(&b))
        {
            return Err(ContextError::InvalidInput("task_id inválido".into()));
        }
    }
    let task = task(&req.task);
    if task.is_empty() || task.chars().count() > 4000 {
        return Err(ContextError::InvalidInput(
            "task fuera de límites tras normalización".into(),
        ));
    }
    let mut files = req
        .anchors
        .files
        .iter()
        .map(|id| {
            if id.is_empty() || id.chars().count() > 4096 {
                return Err(ContextError::InvalidInput(
                    "ancla de archivo inválida".into(),
                ));
            }
            foker_map::path::normalize_lexical(id)
                .map_err(|_| ContextError::InvalidInput("ancla de archivo no normalizable".into()))
        })
        .collect::<Result<Vec<_>, _>>()?;
    let mut symbols = req
        .anchors
        .symbols
        .iter()
        .map(|s| content(s))
        .collect::<Vec<_>>();
    if symbols
        .iter()
        .any(|s| s.is_empty() || s.chars().count() > 1024)
    {
        return Err(ContextError::InvalidInput(
            "ancla de símbolo inválida".into(),
        ));
    }
    files.sort();
    files.dedup();
    symbols.sort();
    symbols.dedup();
    let params = req.params.clone().unwrap_or_default();
    params.validate()?;
    Ok(NormalizedRequest {
        task,
        anchors: Anchors { files, symbols },
        intent: req.intent,
        budget_tokens: req.budget_tokens,
        skill: inputs.skill.as_ref().map(|s| s.name.clone()),
        task_id: inputs.task_scope.as_ref().map(|s| s.task_id.clone()),
        dirty_files: req.dirty_files,
        explain: req.explain,
        params: (params != crate::ContextParams::default()).then_some(params),
    })
}
/// Diccionario determinista v1: expande solo términos, nunca anclas ni intención.
pub const LEXICON_V1: &str = include_str!("../data/lexicon-es-en-v1.tsv");

/// Plurales y sufijos nominales españoles; se aplican solo al buscar el diccionario.
fn spanish_root(term: &str) -> String {
    let plain: String = term
        .nfd()
        .filter(|c| !unicode_normalization::char::is_combining_mark(*c))
        .collect();
    let singular = if plain.ends_with("es") && !plain.ends_with("ces") {
        plain.strip_suffix("es").unwrap_or(&plain)
    } else {
        plain.strip_suffix('s').unwrap_or(&plain)
    };
    for suffix in ["acion", "amiento", "idad", "o", "a"] {
        if let Some(root) = singular.strip_suffix(suffix)
            && root.chars().count() >= 4
        {
            return root.to_owned();
        }
    }
    singular.to_owned()
}

/// Clave flexiva ligera es/en (ADR-032): sin tildes, plural y -e final plegados.
/// Solo empareja BM25 (consulta y documento por igual); nunca altera texto, rutas ni anclas.
/// `referencias`/`referencia`, `importes`/`importe`, `unidades`/`unidad`, `matches`/`match`.
pub fn fold_inflection(term: &str) -> String {
    let mut key: String = term
        .nfd()
        .filter(|c| !unicode_normalization::char::is_combining_mark(*c))
        .collect();
    let long = |s: &str, n: usize| s.chars().count() > n;
    if key.ends_with("ies") && long(&key, 4) {
        key.truncate(key.len() - 3);
        key.push('y');
    } else if key.ends_with('s') && !key.ends_with("ss") && long(&key, 3) {
        key.pop();
    }
    if key.ends_with('e') && long(&key, 3) {
        key.pop();
    }
    key
}

/// Conserva multiplicidad original y añade cada alternativa una sola vez.
pub fn expand_terms(terms: &[String]) -> Vec<String> {
    let mut additions = BTreeSet::new();
    for line in LEXICON_V1.lines().filter(|line| !line.starts_with('#')) {
        let group: Vec<_> = line.split_whitespace().collect();
        if terms.iter().any(|term| {
            group
                .iter()
                .any(|entry| *entry == term || spanish_root(entry) == spanish_root(term))
        }) {
            additions.extend(group.into_iter().map(str::to_owned));
        }
    }
    for term in terms {
        additions.remove(term);
    }
    let mut expanded = terms.to_vec();
    expanded.extend(additions);
    expanded.sort();
    expanded
}
