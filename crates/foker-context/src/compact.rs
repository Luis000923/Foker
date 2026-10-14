//! Compactación textual. Se aplica después de la selección, nunca al ranking.
use crate::render::SectionText;
use crate::select::estimate_tokens;

/// Interruptores solo para la ablación offline; no forman parte de ContextRequest.
#[derive(Clone, Copy, Debug, Default)]
pub struct Options {
    /// Hermanos numéricos L0/L1.
    pub patterns: bool,
    /// Comentarios HTML y blancos redundantes de reglas.
    pub rules: bool,
    /// Cabeceras y petición compactas.
    pub request: bool,
    /// Envoltorio compartido para archivos L2 consecutivos.
    pub wrappers: bool,
    /// Una firma L1 en la misma línea que su ruta.
    pub inline: bool,
}
impl Options {
    /// Todas las transformaciones sin pérdida habilitadas.
    pub const ALL: Self = Self {
        patterns: true,
        rules: true,
        request: true,
        wrappers: true,
        inline: true,
    };
}

fn entries(body: &str, level: &str) -> Vec<String> {
    let mut result: Vec<String> = Vec::new();
    for line in body.split_inclusive('\n') {
        if level == "L0" || !line.starts_with("  ") || result.is_empty() {
            result.push(line.into());
        } else {
            result.last_mut().expect("entrada").push_str(line);
        }
    }
    result
}

fn path<'a>(entry: &'a str, level: &str) -> &'a str {
    let line = entry.split('\n').next().unwrap_or_default();
    if level == "L0" {
        line.split_once(": ").map_or(line, |(id, _)| id)
    } else {
        line
    }
}

// Sustituye tokens numéricos completos, nunca subcadenas de otros números.
fn numeric_template(entry: &str, number: &str) -> String {
    let mut output = String::new();
    let mut rest = entry;
    while let Some(start) = rest.find(|c: char| c.is_ascii_digit()) {
        output.push_str(&rest[..start]);
        rest = &rest[start..];
        let end = rest
            .find(|c: char| !c.is_ascii_digit())
            .unwrap_or(rest.len());
        let token = &rest[..end];
        output.push_str(if token == number { "{N}" } else { token });
        rest = &rest[end..];
    }
    output.push_str(rest);
    output
}
fn pattern(entry: &str, level: &str) -> Option<(String, u64)> {
    let id = path(entry, level);
    if id.contains(['{', '}']) || entry.contains("{N}") {
        return None;
    }
    let name = id.rsplit('/').next()?;
    let start = name.find(|c: char| c.is_ascii_digit())?;
    let end = name[start..]
        .find(|c: char| !c.is_ascii_digit())
        .map_or(name.len(), |end| start + end);
    let number = &name[start..end];
    let value = number.parse::<u64>().ok()?;
    if value.to_string() != number {
        return None; // Los ceros iniciales son información, no números canónicos.
    }
    let template = numeric_template(entry, number);
    // La variable de rango debe estar en la ruta y ser la primera aparición.
    if !path(&template, level).contains("{N}") {
        return None;
    }
    Some((template, value))
}
fn sequence(numbers: &[u64]) -> String {
    let mut parts = Vec::new();
    let mut i = 0;
    while i < numbers.len() {
        let mut end = i;
        while end + 1 < numbers.len()
            && end - i < 100_000
            && numbers[end].checked_add(1) == Some(numbers[end + 1])
        {
            end += 1;
        }
        if end > i + 1 {
            parts.push(format!("{}..{}", numbers[i], numbers[end]));
        } else {
            parts.extend(numbers[i..=end].iter().map(u64::to_string));
        }
        i = end + 1;
    }
    parts.join(",")
}
fn patterns(body: &str, level: &str) -> String {
    let items = entries(body, level);
    let mut result = String::new();
    let mut i = 0;
    while i < items.len() {
        let Some((template, number)) = pattern(&items[i], level) else {
            result.push_str(&items[i]);
            i += 1;
            continue;
        };
        let mut numbers = vec![number];
        let mut end = i + 1;
        while end < items.len() {
            let Some((next, number)) = pattern(&items[end], level) else {
                break;
            };
            if next != template {
                break;
            }
            numbers.push(number);
            end += 1;
        }
        numbers.sort_unstable();
        let encoded = template.replacen("{N}", &format!("{{{}}}", sequence(&numbers)), 1);
        let original = items[i..end].concat();
        if numbers.len() > 1 && encoded.len() < original.len() {
            result.push_str(&encoded);
        } else {
            result.push_str(&original);
        }
        i = end;
    }
    result
}

fn inline(body: &str, level: &str) -> String {
    if level != "L1" {
        return body.into();
    }
    entries(body, level)
        .into_iter()
        .map(|entry| {
            let lines: Vec<_> = entry.split_inclusive('\n').collect();
            if lines.len() == 2 && !lines[0].contains(": ") && lines[1].starts_with("  ") {
                format!("{}: {}", lines[0].trim_end_matches('\n'), &lines[1][2..])
            } else {
                entry
            }
        })
        .collect()
}

/// Compacta entradas escapadas; solo reordena hermanos dentro del grupo consecutivo.
pub fn encode_entries(body: &str, level: &str, options: Options) -> String {
    // Conserva el bloque si la gramática de rangos/firmas inline sería ambigua.
    if body.contains("{N}")
        || entries(body, level).iter().any(|e| {
            path(e, level).contains(['{', '}']) || (level == "L1" && path(e, level).contains(": "))
        })
    {
        return body.into();
    }
    let mut encoded = body.to_owned();
    if options.patterns && level != "L2" {
        encoded = patterns(&encoded, level);
    }
    if options.inline {
        encoded = inline(&encoded, level);
    }
    if encoded.len() < body.len() {
        encoded
    } else {
        body.into()
    }
}

/// Expande firmas inline y rangos, conservando el multiconjunto de líneas originales.
pub fn expand_entries(body: &str, level: &str) -> Result<String, &'static str> {
    if level == "L2" {
        return Ok(body.into());
    }
    let mut decoded = body.to_string();
    if level == "L1" {
        decoded = decoded
            .split_inclusive('\n')
            .map(|line| {
                if !line.starts_with("  ")
                    && let Some((id, signature)) = line.split_once(": ")
                {
                    format!("{id}\n  {signature}")
                } else {
                    line.to_string()
                }
            })
            .collect();
    }
    let mut result = String::new();
    for entry in entries(&decoded, level) {
        let id = path(&entry, level);
        if let Some(start) = id.find('{') {
            let end = id[start..].find('}').ok_or("rango incompleto")? + start;
            let spec = &id[start + 1..end];
            let template = entry.replacen(&id[start..=end], "{N}", 1);
            for part in spec.split(',') {
                let (first, last) = part.split_once("..").unwrap_or((part, part));
                let first: u64 = first.parse().map_err(|_| "rango inválido")?;
                let last: u64 = last.parse().map_err(|_| "rango inválido")?;
                if last < first || last - first > 100_000 {
                    return Err("rango inválido");
                }
                for number in first..=last {
                    result.push_str(&template.replace("{N}", &number.to_string()));
                }
            }
        } else {
            result.push_str(&entry);
        }
    }
    Ok(result)
}

fn group_l2(text: &str) -> String {
    let mut result = String::new();
    let mut rest = text;
    const OPEN: &str = "<foker:file id=\"";
    const ATTR: &str = "\" level=\"L2\" trust=\"repository-content\">\n";
    const CLOSE: &str = "\n</foker:file>\n";
    const GROUP: &str = "<foker:files level=\"L2\" trust=\"repository-content\">\n";
    let mut grouped = String::new();
    let flush = |result: &mut String, grouped: &mut String| {
        if !grouped.is_empty() {
            result.push_str(GROUP);
            result.push_str(grouped);
            result.push_str("</foker:files>\n");
            grouped.clear();
        }
    };
    while !rest.is_empty() {
        if let Some(after) = rest.strip_prefix(OPEN)
            && let Some((id, after)) = after.split_once(ATTR)
            && !id.contains(['\n', '"'])
            && let Some((body, tail)) = after.split_once(CLOSE)
            // Atributos XML requieren deshacer entidades antes de usar la ruta como línea.
            && !id.contains('&')
        {
            grouped.push_str(id);
            grouped.push('\n');
            for line in body.split('\n') {
                grouped.push_str(&format!("  {line}\n"));
            }
            rest = tail;
        } else {
            flush(&mut result, &mut grouped);
            let end = rest.find('\n').map_or(rest.len(), |i| i + 1);
            result.push_str(&rest[..end]);
            rest = &rest[end..];
        }
    }
    flush(&mut result, &mut grouped);
    if result.len() < text.len() {
        result
    } else {
        text.into()
    }
}

// Solo comentarios HTML completos fuera de fences e inline code. El resto es literal.
fn rules(body: &str) -> String {
    let mut result = String::new();
    let mut fence: Option<(u8, usize)> = None;
    let mut inline_ticks = None;
    let mut comment = false;
    let mut blank = false;
    for line in body.split_inclusive('\n') {
        let trimmed = line.trim_start();
        let marker = trimmed.as_bytes().first().copied().unwrap_or_default();
        let count = trimmed.bytes().take_while(|c| *c == marker).count();
        if (marker == b'`' || marker == b'~') && count >= 3 {
            if let Some((kind, length)) = fence {
                if kind == marker && count >= length {
                    fence = None;
                }
            } else {
                fence = Some((marker, count));
            }
            result.push_str(line);
            blank = false;
            continue;
        }
        let in_inline = inline_ticks.is_some();
        let mut ticks = line;
        while let Some(start) = ticks.find('`') {
            ticks = &ticks[start..];
            let length = ticks.bytes().take_while(|c| *c == b'`').count();
            if inline_ticks == Some(length) {
                inline_ticks = None;
            } else if inline_ticks.is_none() {
                inline_ticks = Some(length);
            }
            ticks = &ticks[length..];
        }
        if fence.is_some()
            || in_inline
            || line.contains('`')
            || line.starts_with("    ")
            || line.starts_with('\t')
        {
            result.push_str(line);
            blank = false;
            continue;
        }
        let mut cleaned = String::new();
        let mut rest = line;
        while !rest.is_empty() {
            if comment {
                if let Some(end) = rest.find("-->") {
                    rest = &rest[end + 3..];
                    comment = false;
                } else {
                    break;
                }
            } else if let Some(start) = rest.find("<!--") {
                cleaned.push_str(&rest[..start]);
                rest = &rest[start + 4..];
                comment = true;
            } else {
                cleaned.push_str(rest);
                break;
            }
        }
        if cleaned.trim().is_empty() {
            if !blank && cleaned.contains('\n') {
                result.push('\n');
            }
            blank = true;
        } else {
            result.push_str(&cleaned);
            blank = false;
        }
    }
    // Un comentario sin cierre puede ser texto visible: no se elimina.
    if comment { body.into() } else { result }
}

/// Comprime una sección y recalcula su hash/coste, sin alterar files ni selección.
pub fn section(mut section: SectionText, options: Options) -> SectionText {
    let original = section.text.clone();
    let mut text = original.clone();
    if options.rules && section.section.id == "rules" {
        const START: &str = "<foker:file id=\"foker/rules.md\" trust=\"repository-content\">\n";
        if let Some((head, body)) = text.split_once(START)
            && let Some((body, tail)) = body.split_once("\n</foker:file>")
        {
            text = format!("{head}{START}{}\n</foker:file>{tail}", rules(body));
        }
    }
    if options.wrappers && matches!(section.section.id.as_str(), "core" | "related" | "targets") {
        text = group_l2(&text);
    }
    let mut result = String::new();
    let mut rest = text.as_str();
    const START: &str = "<foker:files level=\"";
    const CLOSE: &str = "</foker:files>\n";
    while let Some(start) = rest.find(START) {
        result.push_str(&rest[..start]);
        rest = &rest[start..];
        let Some((open, after)) = rest.split_once('\n') else {
            break;
        };
        let Some((body, tail)) = after.split_once(CLOSE) else {
            break;
        };
        let level = &open[START.len()..START.len() + 2];
        let encoded = encode_entries(body, level, options);
        result.push_str(open);
        result.push('\n');
        result.push_str(&encoded);
        result.push_str(CLOSE);
        rest = tail;
    }
    result.push_str(rest);
    text = result;
    if options.request && !text.is_empty() {
        if section.section.id == "request" {
            if let Some(body) = text.strip_prefix("## request\n\n")
                && let Some((task, intent)) = body.trim_end_matches('\n').rsplit_once("\nintent: ")
            {
                text = format!("## request [{intent}]\n{task}\n");
            }
        } else if let Some((heading, body)) = text.split_once("\n\n") {
            text = format!("{heading}\n{}", body.strip_suffix('\n').unwrap_or(body));
        }
    }
    if text.len() <= original.len() {
        section.text = text;
        section.section.tokens = estimate_tokens(&section.text);
        section.section.hash = foker_map::canonical::hash_bytes(section.text.as_bytes());
    }
    section
}
