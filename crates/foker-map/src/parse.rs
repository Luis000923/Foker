//! Extracción de símbolos, imports y exports con tree-sitter (FOKER-SPEC §8.2–§8.3; FKR-022).
//!
//! Se recorre el árbol sintáctico de forma explícita (ADR-020): es más fácil de mantener
//! determinista que un conjunto de queries cuando hay que calcular nombres calificados, padres,
//! estado de exportación y firmas sin cuerpo.

use std::collections::{BTreeMap, BTreeSet, HashMap};

use tree_sitter::{Node, Parser, Tree};

use crate::discover::Language;

/// Longitud máxima de una firma antes de truncarla con `…`.
pub const MAX_SIGNATURE_CHARS: usize = 400;
/// Longitud máxima del primer párrafo de JSDoc antes de truncarlo con `…`.
pub const MAX_DOC_CHARS: usize = 300;
/// Bytes que se inspeccionan para detectar un archivo binario.
const BINARY_SNIFF_BYTES: usize = 8000;

/// Estado del parseo (`files[].parse_status`).
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, serde::Serialize, serde::Deserialize,
)]
pub enum ParseStatus {
    /// Sin errores de sintaxis.
    Ok,
    /// Con nodos ERROR o MISSING: los símbolos fuera de esas zonas siguen extrayéndose.
    Partial,
    /// tree-sitter no devolvió árbol.
    Failed,
    /// No se parsea: binario, no UTF-8 o demasiado grande.
    Skipped,
}

impl ParseStatus {
    /// Valor en el esquema.
    pub fn as_str(self) -> &'static str {
        match self {
            ParseStatus::Ok => "ok",
            ParseStatus::Partial => "partial",
            ParseStatus::Failed => "failed",
            ParseStatus::Skipped => "skipped",
        }
    }
}

/// Tipo de símbolo (`symbols[].kind`).
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, serde::Serialize, serde::Deserialize,
)]
pub enum SymbolKind {
    /// Función o firma de función.
    Function,
    /// Clase.
    Class,
    /// Método de clase.
    Method,
    /// Propiedad de clase.
    Property,
    /// Interfaz.
    Interface,
    /// Alias de tipo.
    TypeAlias,
    /// Enum.
    Enum,
    /// Variable (`const`, `let`, `var`).
    Variable,
    /// Namespace o módulo interno.
    Namespace,
}

impl SymbolKind {
    /// Valor en el esquema.
    pub fn as_str(self) -> &'static str {
        match self {
            SymbolKind::Function => "function",
            SymbolKind::Class => "class",
            SymbolKind::Method => "method",
            SymbolKind::Property => "property",
            SymbolKind::Interface => "interface",
            SymbolKind::TypeAlias => "type_alias",
            SymbolKind::Enum => "enum",
            SymbolKind::Variable => "variable",
            SymbolKind::Namespace => "namespace",
        }
    }
}

/// Estado de exportación (`symbols[].exported`).
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, serde::Serialize, serde::Deserialize,
)]
pub enum Exported {
    /// No exportado.
    None,
    /// Exportación con nombre.
    Named,
    /// Exportación por defecto.
    Default,
    /// Reexportado desde otro módulo (lo asigna el grafo).
    Reexport,
}

impl Exported {
    /// Valor en el esquema.
    pub fn as_str(self) -> &'static str {
        match self {
            Exported::None => "none",
            Exported::Named => "named",
            Exported::Default => "default",
            Exported::Reexport => "reexport",
        }
    }
}

/// Posición base 0; columna en bytes UTF-8.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, serde::Serialize, serde::Deserialize,
)]
pub struct Position {
    /// Línea.
    pub line: u32,
    /// Columna en bytes.
    pub col: u32,
}

/// Rango de un símbolo.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, serde::Serialize, serde::Deserialize,
)]
pub struct Range {
    /// Inicio.
    pub start: Position,
    /// Fin.
    pub end: Position,
}

/// Símbolo declarado en un archivo.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct Symbol {
    /// Nombre calificado único en el archivo (`Cart.add`, `f~2`, `default`).
    pub qualified: String,
    /// Nombre simple.
    pub name: String,
    /// Tipo.
    pub kind: SymbolKind,
    /// Etiquetas heurísticas, ordenadas.
    pub tags: Vec<String>,
    /// Clases o interfaces de las que hereda (`extends`) o que implementa.
    pub heritage: Vec<Heritage>,
    /// Estado de exportación.
    pub exported: Exported,
    /// Firma sin cuerpo.
    pub signature: String,
    /// Primer párrafo de JSDoc.
    pub doc: Option<String>,
    /// Rango de la declaración (incluida `export`).
    pub range: Range,
    /// Nombre calificado del contenedor.
    pub parent: Option<String>,
}

/// Relación de herencia.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, serde::Serialize, serde::Deserialize,
)]
pub enum Relation {
    /// `extends`.
    Extends,
    /// `implements`.
    Implements,
}

/// Cláusula de herencia: nombre tal como aparece (`Base`, `React.Component`).
#[derive(
    Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, serde::Serialize, serde::Deserialize,
)]
pub struct Heritage {
    /// Relación.
    pub relation: Relation,
    /// Nombre, posiblemente calificado con puntos.
    pub name: String,
}

/// Qué importa un binding.
#[derive(
    Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, serde::Serialize, serde::Deserialize,
)]
pub enum Imported {
    /// `import x from`.
    Default,
    /// `import { x } from` (nombre exportado por el módulo).
    Named(String),
    /// `import * as x from`, `import x = require()`.
    Namespace,
}

/// Binding de un import.
#[derive(
    Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, serde::Serialize, serde::Deserialize,
)]
pub struct ImportBinding {
    /// Qué se importa.
    pub imported: Imported,
    /// Nombre local (None en reexportaciones `export { x } from`).
    pub local: Option<String>,
    /// Solo tipos (`import type`, `{ type x }`).
    pub type_only: bool,
}

/// Forma sintáctica del import.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, serde::Serialize, serde::Deserialize,
)]
pub enum ImportKind {
    /// `import … from 'x'` o `import 'x'`.
    Static,
    /// `import('x')` con literal.
    Dynamic,
    /// `require('x')` con literal o `import x = require('x')`.
    Require,
    /// `export { … } from 'x'` o `export * as ns from 'x'`.
    ReexportNamed,
    /// `export * from 'x'`.
    ReexportAll,
}

/// Import o reexportación de un módulo.
#[derive(
    Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, serde::Serialize, serde::Deserialize,
)]
pub struct Import {
    /// Especificador literal.
    pub specifier: String,
    /// Forma.
    pub kind: ImportKind,
    /// Toda la sentencia es de tipos (`import type`, `export type … from`).
    pub type_only: bool,
    /// Bindings.
    pub bindings: Vec<ImportBinding>,
    /// Línea (base 0) de la sentencia.
    pub line: u32,
}

/// Entrada de la tabla de exports del módulo.
#[derive(
    Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, serde::Serialize, serde::Deserialize,
)]
pub struct ExportEntry {
    /// Nombre exportado: `default`, un nombre, o `*` para `export * from`.
    pub exported: String,
    /// Nombre local o importado al que se refiere; None para `export * as ns from`.
    pub local: Option<String>,
    /// Especificador si es una reexportación.
    pub source: Option<String>,
    /// Solo tipos.
    pub type_only: bool,
}

/// Resultado de parsear un archivo.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct ParsedFile {
    /// Estado.
    pub status: ParseStatus,
    /// Número de líneas.
    pub lines: u32,
    /// Símbolos en orden de aparición.
    pub symbols: Vec<Symbol>,
    /// Imports en orden de aparición.
    pub imports: Vec<Import>,
    /// Exports en orden de aparición.
    pub exports: Vec<ExportEntry>,
    /// Referencias (identificadores fuera de los imports) a cada nombre local importado.
    pub import_refs: BTreeMap<String, u32>,
}

impl ParsedFile {
    fn skipped(lines: u32) -> Self {
        ParsedFile {
            status: ParseStatus::Skipped,
            lines,
            symbols: Vec::new(),
            imports: Vec::new(),
            exports: Vec::new(),
            import_refs: BTreeMap::new(),
        }
    }
}

/// Cuenta líneas como `str::lines`: un salto final no abre una línea nueva.
pub fn count_lines(bytes: &[u8]) -> u32 {
    if bytes.is_empty() {
        return 0;
    }
    let newlines = bytes.iter().filter(|b| **b == b'\n').count();
    let extra = usize::from(*bytes.last().unwrap_or(&b'\n') != b'\n');
    u32::try_from(newlines + extra).unwrap_or(u32::MAX)
}

/// `true` si el contenido parece binario o no es UTF-8.
pub fn is_binary(bytes: &[u8]) -> bool {
    bytes[..bytes.len().min(BINARY_SNIFF_BYTES)].contains(&0) || std::str::from_utf8(bytes).is_err()
}

fn grammar(language: Language) -> tree_sitter::Language {
    match language {
        Language::TypeScript => tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into(),
        Language::Tsx => tree_sitter_typescript::LANGUAGE_TSX.into(),
        Language::JavaScript | Language::Jsx => tree_sitter_javascript::LANGUAGE.into(),
    }
}

/// Versiones de las gramáticas enlazadas (`generator.parsers`).
pub fn grammar_versions() -> BTreeMap<String, String> {
    let ts = "0.23.2".to_owned();
    let js = "0.25.0".to_owned();
    BTreeMap::from([
        ("javascript".to_owned(), js),
        ("tsx".to_owned(), ts.clone()),
        ("typescript".to_owned(), ts),
    ])
}

fn parse_tree(language: Language, source: &[u8]) -> Option<Tree> {
    let mut parser = Parser::new();
    parser.set_language(&grammar(language)).ok()?;
    parser.parse(source, None)
}

/// Parsea un archivo y extrae su contenido estructural.
pub fn parse_source(id: &str, language: Language, bytes: &[u8]) -> ParsedFile {
    let lines = count_lines(bytes);
    if is_binary(bytes) {
        return ParsedFile::skipped(lines);
    }
    let source = bytes.strip_prefix(b"\xef\xbb\xbf").unwrap_or(bytes);
    let Some(tree) = parse_tree(language, source) else {
        return ParsedFile {
            status: ParseStatus::Failed,
            ..ParsedFile::skipped(lines)
        };
    };
    let root = tree.root_node();
    let mut extractor = Extractor {
        id,
        language,
        src: source,
        symbols: Vec::new(),
        imports: Vec::new(),
        exports: Vec::new(),
        name_counts: HashMap::new(),
    };
    extractor.statements(root, None, false);
    extractor.scan_calls(root);
    extractor.apply_local_exports();
    let import_refs = extractor.count_import_refs(root);
    ParsedFile {
        status: if root.has_error() {
            ParseStatus::Partial
        } else {
            ParseStatus::Ok
        },
        lines,
        symbols: extractor.symbols,
        imports: extractor.imports,
        exports: extractor.exports,
        import_refs,
    }
}

/// Colapsa espacios en blanco consecutivos (incluidos saltos de línea) en uno solo.
fn collapse(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut space = false;
    for ch in text.chars() {
        if ch.is_whitespace() {
            space = true;
        } else {
            if space && !out.is_empty() {
                out.push(' ');
            }
            space = false;
            out.push(ch);
        }
    }
    out
}

/// Quita los espacios que deja `collapse` junto a paréntesis y corchetes en firmas multilínea:
/// `f( a, b, )` → `f(a, b)`.
fn tidy(text: &str) -> String {
    text.replace("( ", "(")
        .replace(" )", ")")
        .replace("[ ", "[")
        .replace(" ]", "]")
        .replace(",)", ")")
        .replace(",]", "]")
}

fn truncate(text: String, max: usize) -> String {
    if text.chars().count() <= max {
        return text;
    }
    let mut out: String = text.chars().take(max).collect();
    out.push('…');
    out
}

fn position(point: tree_sitter::Point) -> Position {
    Position {
        line: u32::try_from(point.row).unwrap_or(u32::MAX),
        col: u32::try_from(point.column).unwrap_or(u32::MAX),
    }
}

fn range_of(node: Node) -> Range {
    Range {
        start: position(node.start_position()),
        end: position(node.end_position()),
    }
}

fn named_children(node: Node) -> Vec<Node> {
    let mut cursor = node.walk();
    node.named_children(&mut cursor).collect()
}

fn children(node: Node) -> Vec<Node> {
    let mut cursor = node.walk();
    node.children(&mut cursor).collect()
}

fn has_token(node: Node, token: &str) -> bool {
    children(node)
        .iter()
        .any(|c| !c.is_named() && c.kind() == token)
}

fn is_next_route_file(id: &str) -> bool {
    let name = id.rsplit('/').next().unwrap_or(id);
    let stem = name.split('.').next().unwrap_or(name);
    let in_app = id.starts_with("app/") || id.contains("/app/");
    in_app
        && matches!(
            stem,
            "page"
                | "layout"
                | "route"
                | "loading"
                | "error"
                | "not-found"
                | "template"
                | "default"
        )
}

const HTTP_METHODS: [&str; 7] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

struct Extractor<'a> {
    id: &'a str,
    language: Language,
    src: &'a [u8],
    symbols: Vec<Symbol>,
    imports: Vec<Import>,
    exports: Vec<ExportEntry>,
    name_counts: HashMap<String, u32>,
}

/// Datos comunes para registrar un símbolo.
struct Decl<'n> {
    name: String,
    kind: SymbolKind,
    /// Nodo cuyo rango y comentario se usan (la sentencia `export` si la hay).
    outer: Node<'n>,
    signature: String,
    exported: Exported,
    parent: Option<String>,
    is_async: bool,
    /// Valor de una variable (para la heurística de componentes y hooks).
    value_kind: Option<&'n str>,
    /// Herencia (clases e interfaces).
    heritage: Vec<Heritage>,
}

impl<'a> Extractor<'a> {
    fn text(&self, node: Node) -> &'a str {
        node.utf8_text(self.src).unwrap_or("")
    }

    fn slice(&self, start: usize, end: usize) -> &'a str {
        std::str::from_utf8(&self.src[start..end.max(start)]).unwrap_or("")
    }

    fn string_literal(&self, node: Node) -> Option<String> {
        if node.kind() != "string" {
            return None;
        }
        let parts = named_children(node);
        match parts.as_slice() {
            [] => Some(String::new()),
            [fragment] if fragment.kind() == "string_fragment" => {
                Some(self.text(*fragment).to_owned())
            }
            _ => None,
        }
    }

    /// Texto desde `outer` hasta el inicio de `body`, colapsado y sin `{`/`;` finales.
    fn header(&self, outer: Node, body: Option<Node>) -> String {
        let end = body.map_or(outer.end_byte(), |b| b.start_byte());
        let text = tidy(&collapse(self.slice(outer.start_byte(), end)));
        let text = text.trim_end_matches([' ', '{', ';']).to_owned();
        truncate(text, MAX_SIGNATURE_CHARS)
    }

    fn full(&self, outer: Node) -> String {
        let text = collapse(self.text(outer));
        truncate(
            text.trim_end_matches([' ', ';']).to_owned(),
            MAX_SIGNATURE_CHARS,
        )
    }

    fn doc_for(&self, outer: Node) -> Option<String> {
        let comment = outer.prev_sibling()?;
        if comment.kind() != "comment"
            || comment.end_position().row + 1 < outer.start_position().row
        {
            return None;
        }
        let raw = self.text(comment);
        let body = raw.strip_prefix("/**")?.strip_suffix("*/")?;
        let mut paragraph = Vec::new();
        for line in body.lines() {
            let line = line.trim().trim_start_matches('*').trim();
            if line.starts_with('@') {
                break;
            }
            if line.is_empty() {
                if paragraph.is_empty() {
                    continue;
                }
                break;
            }
            paragraph.push(line);
        }
        if paragraph.is_empty() {
            return None;
        }
        Some(truncate(collapse(&paragraph.join(" ")), MAX_DOC_CHARS))
    }

    fn qualified(&mut self, parent: Option<&str>, name: &str) -> String {
        let base = match parent {
            Some(p) => format!("{p}.{name}"),
            None => name.to_owned(),
        };
        let count = self.name_counts.entry(base.clone()).or_insert(0);
        *count += 1;
        if *count == 1 {
            base
        } else {
            format!("{base}~{count}")
        }
    }

    fn tags(&self, decl: &Decl) -> Vec<String> {
        let mut tags = BTreeSet::new();
        if decl.is_async {
            tags.insert("async");
        }
        let callable = matches!(decl.kind, SymbolKind::Function)
            || (decl.kind == SymbolKind::Variable
                && matches!(
                    decl.value_kind,
                    Some("arrow_function" | "function_expression" | "call_expression")
                ));
        let name = decl.name.as_str();
        let mut chars = name.chars();
        if callable
            && name.starts_with("use")
            && chars
                .nth(3)
                .is_some_and(|c| c.is_ascii_uppercase() || c.is_ascii_digit())
        {
            tags.insert("react_hook");
        }
        let jsx_file = matches!(self.language, Language::Tsx | Language::Jsx);
        let component_kind = callable || decl.kind == SymbolKind::Class;
        if jsx_file
            && component_kind
            && name.chars().next().is_some_and(|c| c.is_ascii_uppercase())
            && name.chars().any(|c| c.is_ascii_lowercase())
        {
            tags.insert("react_component");
        }
        if decl.parent.is_none() && is_next_route_file(self.id) {
            let route_export = decl.exported == Exported::Default
                || (decl.exported == Exported::Named && HTTP_METHODS.contains(&name));
            if route_export {
                tags.insert("next_route");
            }
        }
        tags.into_iter().map(String::from).collect()
    }

    fn push(&mut self, decl: Decl) {
        let qualified = self.qualified(decl.parent.as_deref(), &decl.name);
        let tags = self.tags(&decl);
        let doc = self.doc_for(decl.outer);
        self.symbols.push(Symbol {
            qualified,
            name: decl.name,
            kind: decl.kind,
            tags,
            heritage: decl.heritage,
            exported: decl.exported,
            signature: decl.signature,
            doc,
            range: range_of(decl.outer),
            parent: decl.parent,
        });
    }

    /// `extends`/`implements` de una clase o interfaz, con nombres como `Base` o `React.Component`.
    fn heritage(&self, node: Node) -> Vec<Heritage> {
        let mut out = Vec::new();
        let mut add = |relation: Relation, target: Node| {
            let named = match target.kind() {
                "generic_type" => target.child_by_field_name("name").unwrap_or(target),
                _ => target,
            };
            if matches!(
                named.kind(),
                "identifier" | "type_identifier" | "member_expression" | "nested_type_identifier"
            ) {
                out.push(Heritage {
                    relation,
                    name: collapse(self.text(named)).replace(' ', ""),
                });
            }
        };
        for child in named_children(node) {
            match child.kind() {
                "class_heritage" => {
                    for clause in named_children(child) {
                        let relation = if clause.kind() == "implements_clause" {
                            Relation::Implements
                        } else {
                            Relation::Extends
                        };
                        for target in named_children(clause) {
                            add(relation, target);
                        }
                    }
                }
                "extends_type_clause" => {
                    for target in named_children(child) {
                        add(Relation::Extends, target);
                    }
                }
                _ => {}
            }
        }
        out
    }

    /// Recorre las sentencias de un programa o bloque.
    fn statements(&mut self, block: Node, parent: Option<&str>, exported_scope: bool) {
        for stmt in named_children(block) {
            match stmt.kind() {
                "import_statement" => self.import_statement(stmt),
                "export_statement" => self.export_statement(stmt, parent, exported_scope),
                "expression_statement" => {
                    if parent.is_none() {
                        self.commonjs_export(stmt);
                    }
                    self.declaration(stmt, stmt, Exported::None, parent);
                }
                _ => self.declaration(stmt, stmt, Exported::None, parent),
            }
        }
    }

    fn import_statement(&mut self, stmt: Node) {
        let type_only = has_token(stmt, "type");
        let line = position(stmt.start_position()).line;
        if let Some(clause) = named_children(stmt)
            .into_iter()
            .find(|c| c.kind() == "import_require_clause")
        {
            let local = named_children(clause)
                .into_iter()
                .find(|c| c.kind() == "identifier");
            if let Some(specifier) = clause
                .child_by_field_name("source")
                .and_then(|s| self.string_literal(s))
            {
                self.imports.push(Import {
                    specifier,
                    kind: ImportKind::Require,
                    type_only,
                    bindings: local
                        .map(|l| ImportBinding {
                            imported: Imported::Namespace,
                            local: Some(self.text(l).to_owned()),
                            type_only,
                        })
                        .into_iter()
                        .collect(),
                    line,
                });
            }
            return;
        }
        let Some(specifier) = stmt
            .child_by_field_name("source")
            .and_then(|s| self.string_literal(s))
        else {
            return;
        };
        let mut bindings = Vec::new();
        if let Some(clause) = named_children(stmt)
            .into_iter()
            .find(|c| c.kind() == "import_clause")
        {
            for part in named_children(clause) {
                match part.kind() {
                    "identifier" => bindings.push(ImportBinding {
                        imported: Imported::Default,
                        local: Some(self.text(part).to_owned()),
                        type_only,
                    }),
                    "namespace_import" => {
                        if let Some(local) = named_children(part)
                            .into_iter()
                            .find(|c| c.kind() == "identifier")
                        {
                            bindings.push(ImportBinding {
                                imported: Imported::Namespace,
                                local: Some(self.text(local).to_owned()),
                                type_only,
                            });
                        }
                    }
                    "named_imports" => {
                        for spec in named_children(part)
                            .into_iter()
                            .filter(|c| c.kind() == "import_specifier")
                        {
                            let Some(name) = spec.child_by_field_name("name") else {
                                continue;
                            };
                            let imported = self
                                .string_literal(name)
                                .unwrap_or_else(|| self.text(name).to_owned());
                            let local = spec
                                .child_by_field_name("alias")
                                .map_or_else(|| imported.clone(), |a| self.text(a).to_owned());
                            bindings.push(ImportBinding {
                                imported: if imported == "default" {
                                    Imported::Default
                                } else {
                                    Imported::Named(imported)
                                },
                                local: Some(local),
                                type_only: type_only || has_token(spec, "type"),
                            });
                        }
                    }
                    _ => {}
                }
            }
        }
        self.imports.push(Import {
            specifier,
            kind: ImportKind::Static,
            type_only,
            bindings,
            line,
        });
    }

    fn export_statement(&mut self, stmt: Node, parent: Option<&str>, exported_scope: bool) {
        let type_only = has_token(stmt, "type");
        let is_default = has_token(stmt, "default");
        let source = stmt
            .child_by_field_name("source")
            .and_then(|s| self.string_literal(s));
        let line = position(stmt.start_position()).line;
        // Dentro de un namespace, `export` publica el miembro; fuera, es una exportación del módulo.
        let member_exported = if parent.is_some() {
            if exported_scope {
                Exported::Named
            } else {
                Exported::None
            }
        } else if is_default {
            Exported::Default
        } else {
            Exported::Named
        };

        if let Some(declaration) = stmt.child_by_field_name("declaration") {
            self.declaration(declaration, stmt, member_exported, parent);
            return;
        }
        if let Some(value) = stmt.child_by_field_name("value") {
            if parent.is_some() {
                return;
            }
            match value.kind() {
                "identifier" => self.exports.push(ExportEntry {
                    exported: "default".into(),
                    local: Some(self.text(value).to_owned()),
                    source: None,
                    type_only: false,
                }),
                "function_expression" | "arrow_function" | "class" | "generator_function" => {
                    let named = value
                        .child_by_field_name("name")
                        .map(|n| self.text(n).to_owned());
                    let kind = if value.kind() == "class" {
                        SymbolKind::Class
                    } else {
                        SymbolKind::Function
                    };
                    let body = value.child_by_field_name("body");
                    let signature = self.header(stmt, body);
                    let is_async = has_token(value, "async");
                    self.push(Decl {
                        name: named.unwrap_or_else(|| "default".into()),
                        kind,
                        outer: stmt,
                        signature,
                        exported: Exported::Default,
                        parent: None,
                        is_async,
                        value_kind: None,
                        heritage: Vec::new(),
                    });
                }
                _ => {
                    let signature = self.full(stmt);
                    self.push(Decl {
                        name: "default".into(),
                        kind: SymbolKind::Variable,
                        outer: stmt,
                        signature,
                        exported: Exported::Default,
                        parent: None,
                        is_async: false,
                        value_kind: Some(value.kind()),
                        heritage: Vec::new(),
                    });
                }
            }
            return;
        }
        if parent.is_some() {
            return;
        }
        let mut reexport_bindings = Vec::new();
        for part in named_children(stmt) {
            match part.kind() {
                "export_clause" => {
                    for spec in named_children(part)
                        .into_iter()
                        .filter(|c| c.kind() == "export_specifier")
                    {
                        let Some(name) = spec.child_by_field_name("name") else {
                            continue;
                        };
                        let local = self
                            .string_literal(name)
                            .unwrap_or_else(|| self.text(name).to_owned());
                        let exported = spec.child_by_field_name("alias").map_or_else(
                            || local.clone(),
                            |a| {
                                self.string_literal(a)
                                    .unwrap_or_else(|| self.text(a).to_owned())
                            },
                        );
                        let spec_type = type_only || has_token(spec, "type");
                        if source.is_some() {
                            reexport_bindings.push(ImportBinding {
                                imported: if local == "default" {
                                    Imported::Default
                                } else {
                                    Imported::Named(local.clone())
                                },
                                local: None,
                                type_only: spec_type,
                            });
                        }
                        self.exports.push(ExportEntry {
                            exported,
                            local: Some(local),
                            source: source.clone(),
                            type_only: spec_type,
                        });
                    }
                }
                "namespace_export" => {
                    let name = named_children(part)
                        .into_iter()
                        .find(|c| matches!(c.kind(), "identifier" | "string"))
                        .map(|n| {
                            self.string_literal(n)
                                .unwrap_or_else(|| self.text(n).to_owned())
                        });
                    if let Some(name) = name {
                        reexport_bindings.push(ImportBinding {
                            imported: Imported::Namespace,
                            local: None,
                            type_only,
                        });
                        self.exports.push(ExportEntry {
                            exported: name,
                            local: None,
                            source: source.clone(),
                            type_only,
                        });
                    }
                }
                _ => {}
            }
        }
        if let Some(specifier) = source {
            let star = has_token(stmt, "*") && reexport_bindings.is_empty();
            if star {
                self.exports.push(ExportEntry {
                    exported: "*".into(),
                    local: None,
                    source: Some(specifier.clone()),
                    type_only,
                });
            }
            self.imports.push(Import {
                specifier,
                kind: if star {
                    ImportKind::ReexportAll
                } else {
                    ImportKind::ReexportNamed
                },
                type_only,
                bindings: reexport_bindings,
                line,
            });
        }
    }

    /// `module.exports = x`, `exports.x = …`, `module.exports.x = …`.
    fn commonjs_export(&mut self, stmt: Node) {
        let Some(assign) = named_children(stmt)
            .into_iter()
            .find(|c| c.kind() == "assignment_expression")
        else {
            return;
        };
        let (Some(left), Some(right)) = (
            assign.child_by_field_name("left"),
            assign.child_by_field_name("right"),
        ) else {
            return;
        };
        let target = self.text(left);
        let exported = if target == "module.exports" {
            "default".to_owned()
        } else if let Some(name) = target
            .strip_prefix("module.exports.")
            .or_else(|| target.strip_prefix("exports."))
        {
            if !name
                .chars()
                .all(|c| c.is_alphanumeric() || c == '_' || c == '$')
            {
                return;
            }
            name.to_owned()
        } else {
            return;
        };
        match right.kind() {
            "identifier" => self.exports.push(ExportEntry {
                exported,
                local: Some(self.text(right).to_owned()),
                source: None,
                type_only: false,
            }),
            "function_expression" | "arrow_function" | "class" => {
                let kind = if right.kind() == "class" {
                    SymbolKind::Class
                } else {
                    SymbolKind::Function
                };
                let signature = self.header(stmt, right.child_by_field_name("body"));
                let exported_kind = if exported == "default" {
                    Exported::Default
                } else {
                    Exported::Named
                };
                let is_async = has_token(right, "async");
                self.push(Decl {
                    name: exported,
                    kind,
                    outer: stmt,
                    signature,
                    exported: exported_kind,
                    parent: None,
                    is_async,
                    value_kind: None,
                    heritage: Vec::new(),
                });
            }
            _ => {}
        }
    }

    /// Registra una declaración. `outer` es la sentencia completa (con `export`/`declare`).
    fn declaration(&mut self, node: Node, outer: Node, exported: Exported, parent: Option<&str>) {
        match node.kind() {
            "function_declaration" | "generator_function_declaration" | "function_signature" => {
                let Some(name) = node.child_by_field_name("name") else {
                    return;
                };
                let signature = self.header(outer, node.child_by_field_name("body"));
                self.push(Decl {
                    name: self.text(name).to_owned(),
                    kind: SymbolKind::Function,
                    outer,
                    signature,
                    exported,
                    parent: parent.map(String::from),
                    is_async: has_token(node, "async"),
                    value_kind: None,
                    heritage: Vec::new(),
                });
            }
            "class_declaration" | "abstract_class_declaration" | "class" => {
                let name = node
                    .child_by_field_name("name")
                    .map_or_else(|| "default".to_owned(), |n| self.text(n).to_owned());
                let body = node.child_by_field_name("body");
                let signature = self.header(outer, body);
                let heritage = self.heritage(node);
                let decl = Decl {
                    name: name.clone(),
                    kind: SymbolKind::Class,
                    outer,
                    signature,
                    exported,
                    parent: parent.map(String::from),
                    is_async: false,
                    value_kind: None,
                    heritage,
                };
                self.push(decl);
                let qualified = self
                    .symbols
                    .last()
                    .map(|s| s.qualified.clone())
                    .unwrap_or(name);
                if let Some(body) = body {
                    self.class_members(body, &qualified);
                }
            }
            "interface_declaration" | "type_alias_declaration" | "enum_declaration" => {
                let Some(name) = node.child_by_field_name("name") else {
                    return;
                };
                let kind = match node.kind() {
                    "interface_declaration" => SymbolKind::Interface,
                    "type_alias_declaration" => SymbolKind::TypeAlias,
                    _ => SymbolKind::Enum,
                };
                let signature = self.full(outer);
                let heritage = self.heritage(node);
                self.push(Decl {
                    name: self.text(name).to_owned(),
                    kind,
                    outer,
                    signature,
                    exported,
                    parent: parent.map(String::from),
                    is_async: false,
                    value_kind: None,
                    heritage,
                });
            }
            "lexical_declaration" | "variable_declaration" => {
                self.variables(node, outer, exported, parent)
            }
            "internal_module" => {
                let Some(name) = node.child_by_field_name("name") else {
                    return;
                };
                let name = self.text(name).to_owned();
                let body = node.child_by_field_name("body");
                let signature = self.header(outer, body);
                self.push(Decl {
                    name: name.clone(),
                    kind: SymbolKind::Namespace,
                    outer,
                    signature,
                    exported,
                    parent: parent.map(String::from),
                    is_async: false,
                    value_kind: None,
                    heritage: Vec::new(),
                });
                let qualified = self
                    .symbols
                    .last()
                    .map(|s| s.qualified.clone())
                    .unwrap_or(name);
                if let Some(body) = body {
                    self.statements(body, Some(&qualified), exported != Exported::None);
                }
            }
            "expression_statement" => {
                // `namespace X {}` aparece como expression_statement > internal_module en el nivel superior.
                if let Some(inner) = named_children(node)
                    .into_iter()
                    .find(|c| c.kind() == "internal_module")
                {
                    self.declaration(inner, outer, exported, parent);
                }
            }
            "ambient_declaration" => {
                // `declare global {}` y `declare module 'x' {}` describen otros módulos: se omiten.
                for inner in named_children(node) {
                    if !matches!(inner.kind(), "statement_block" | "module" | "string") {
                        self.declaration(inner, outer, exported, parent);
                    }
                }
            }
            _ => {}
        }
    }

    fn variables(&mut self, node: Node, outer: Node, exported: Exported, parent: Option<&str>) {
        let keyword = children(node)
            .into_iter()
            .find(|c| !c.is_named())
            .map_or("const", |c| self.text(c));
        let prefix = collapse(self.slice(outer.start_byte(), node.start_byte()));
        for declarator in named_children(node)
            .into_iter()
            .filter(|c| c.kind() == "variable_declarator")
        {
            let Some(name) = declarator.child_by_field_name("name") else {
                continue;
            };
            if name.kind() != "identifier" {
                continue;
            }
            let name_text = self.text(name).to_owned();
            let type_ann = declarator
                .child_by_field_name("type")
                .map(|t| collapse(self.text(t)));
            let value = declarator.child_by_field_name("value");
            let mut signature = if prefix.is_empty() {
                format!("{keyword} {name_text}")
            } else {
                format!("{prefix} {keyword} {name_text}")
            };
            if let Some(t) = &type_ann {
                signature.push_str(t);
            }
            let mut is_async = false;
            if let Some(value) = value {
                match value.kind() {
                    "arrow_function" | "function_expression" => {
                        is_async = has_token(value, "async");
                        let head = match value.child_by_field_name("body") {
                            Some(body) => self.slice(value.start_byte(), body.start_byte()),
                            None => self.text(value),
                        };
                        signature.push_str(" = ");
                        signature.push_str(tidy(&collapse(head)).trim_end_matches([' ', '{']));
                    }
                    _ if type_ann.is_none() => {
                        signature.push_str(" = ");
                        signature.push_str(&truncate(tidy(&collapse(self.text(value))), 80));
                    }
                    _ => {}
                }
            }
            let decl = Decl {
                name: name_text,
                kind: SymbolKind::Variable,
                outer,
                signature: truncate(signature, MAX_SIGNATURE_CHARS),
                exported,
                parent: parent.map(String::from),
                is_async,
                value_kind: value.map(|v| v.kind()),
                heritage: Vec::new(),
            };
            self.push(decl);
        }
    }

    fn class_members(&mut self, body: Node, class: &str) {
        for member in named_children(body) {
            let kind = match member.kind() {
                "method_definition" | "method_signature" | "abstract_method_signature" => {
                    SymbolKind::Method
                }
                "public_field_definition" => SymbolKind::Property,
                _ => continue,
            };
            let Some(name) = member.child_by_field_name("name") else {
                continue;
            };
            let private = name.kind() == "private_property_identifier"
                || named_children(member)
                    .iter()
                    .any(|c| c.kind() == "accessibility_modifier" && self.text(*c) == "private");
            if private {
                continue;
            }
            let signature = match (kind, member.child_by_field_name("value")) {
                (SymbolKind::Property, Some(value)) => {
                    let text = collapse(self.slice(member.start_byte(), value.start_byte()));
                    truncate(
                        text.trim_end_matches([' ', '=']).to_owned(),
                        MAX_SIGNATURE_CHARS,
                    )
                }
                (SymbolKind::Property, None) => self.full(member),
                _ => self.header(member, member.child_by_field_name("body")),
            };
            self.push(Decl {
                name: self.text(name).to_owned(),
                kind,
                outer: member,
                signature,
                exported: Exported::None,
                parent: Some(class.to_owned()),
                is_async: has_token(member, "async"),
                value_kind: None,
                heritage: Vec::new(),
            });
        }
    }

    /// Busca `import('literal')` y `require('literal')` en todo el árbol.
    fn scan_calls(&mut self, root: Node) {
        let mut stack = vec![root];
        let mut found = Vec::new();
        while let Some(node) = stack.pop() {
            if node.kind() == "call_expression" {
                let function = node.child_by_field_name("function");
                let kind = match function.map(|f| (f.kind(), self.text(f))) {
                    Some(("import", _)) => Some(ImportKind::Dynamic),
                    Some(("identifier", "require")) => Some(ImportKind::Require),
                    _ => None,
                };
                if let Some(kind) = kind {
                    let args = node
                        .child_by_field_name("arguments")
                        .map(named_children)
                        .unwrap_or_default();
                    if let [arg] = args.as_slice()
                        && let Some(specifier) = self.string_literal(*arg)
                    {
                        found.push((
                            node.start_byte(),
                            Import {
                                specifier,
                                kind,
                                type_only: false,
                                bindings: Vec::new(),
                                line: position(node.start_position()).line,
                            },
                        ));
                    }
                }
            }
            for child in named_children(node).into_iter().rev() {
                stack.push(child);
            }
        }
        found.sort_by_key(|(start, _)| *start);
        self.imports
            .extend(found.into_iter().map(|(_, import)| import));
    }

    /// Marca como exportados los símbolos locales de `export { x }`, `export default x` y CommonJS.
    fn apply_local_exports(&mut self) {
        for entry in &self.exports {
            if entry.source.is_some() {
                continue;
            }
            let Some(local) = &entry.local else {
                continue;
            };
            let state = if entry.exported == "default" {
                Exported::Default
            } else {
                Exported::Named
            };
            for symbol in self
                .symbols
                .iter_mut()
                .filter(|s| s.parent.is_none() && &s.name == local)
            {
                if symbol.exported == Exported::None {
                    symbol.exported = state;
                }
            }
        }
        let route_file = is_next_route_file(self.id);
        if route_file {
            for symbol in self.symbols.iter_mut().filter(|s| s.parent.is_none()) {
                let route = symbol.exported == Exported::Default
                    || (symbol.exported == Exported::Named
                        && HTTP_METHODS.contains(&symbol.name.as_str()));
                if route && !symbol.tags.iter().any(|t| t == "next_route") {
                    symbol.tags.push("next_route".to_owned());
                    symbol.tags.sort_unstable();
                }
            }
        }
    }

    /// Cuenta, fuera de las sentencias de import, los identificadores que nombran cada binding local
    /// importado (peso de `uses_symbol`).
    fn count_import_refs(&self, root: Node) -> BTreeMap<String, u32> {
        let locals: BTreeSet<&str> = self
            .imports
            .iter()
            .flat_map(|i| i.bindings.iter().filter_map(|b| b.local.as_deref()))
            .collect();
        let mut counts: BTreeMap<String, u32> =
            locals.iter().map(|l| ((*l).to_owned(), 0)).collect();
        if locals.is_empty() {
            return counts;
        }
        let mut stack = vec![root];
        while let Some(node) = stack.pop() {
            if node.kind() == "import_statement" {
                continue;
            }
            if matches!(
                node.kind(),
                "identifier"
                    | "type_identifier"
                    | "shorthand_property_identifier"
                    | "shorthand_property_identifier_pattern"
            ) {
                let text = self.text(node);
                if let Some(count) = counts.get_mut(text) {
                    *count += 1;
                }
            }
            for child in named_children(node) {
                stack.push(child);
            }
        }
        counts
    }
}
