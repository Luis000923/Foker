//! Detección de entrega de texto en el bloque de su propio archivo (focal_eval, fixture_b_eval).

/// ¿Llega el texto completo dentro del bloque de su propio archivo? Bloque individual L3/L2
/// literal, o envoltorio L2 compartido con cuerpos indentados dos espacios (ADR-031 1c).
pub fn delivered_in_file(rendered: &str, file: &str, level: Option<&str>, text: &str) -> bool {
    // Mismo escape de atributo que render::file.
    let id = file
        .replace('&', "&amp;")
        .replace('"', "&quot;")
        .replace('<', "&lt;")
        .replace('>', "&gt;");
    for lvl in ["L3", "L2"] {
        let open = format!("<foker:file id=\"{id}\" level=\"{lvl}\"");
        if let Some(start) = rendered.find(&open)
            && let Some(end) = rendered[start..].find("</foker:file>")
        {
            return rendered[start..start + end].contains(text);
        }
    }
    if level != Some("L2") {
        return false;
    }
    let header = format!("\n{file}\n");
    let Some(start) = rendered.find(&header) else {
        return false;
    };
    // El cuerpo del archivo termina en la siguiente ruta (línea sin indentar) del envoltorio.
    let body = &rendered[start + header.len()..];
    let end = body
        .split_inclusive('\n')
        .take_while(|l| l.starts_with("  ") || l.trim().is_empty())
        .map(str::len)
        .sum::<usize>();
    // group_l2 indenta todas las líneas, también las vacías ("  ").
    let indented: Vec<String> = text.split('\n').map(|l| format!("  {l}")).collect();
    body[..end].contains(&indented.join("\n"))
}
