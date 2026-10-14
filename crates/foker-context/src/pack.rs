//! Contratos Rust y serialización snake_case del Context Pack v2.
use foker_map::error::FokerCode;
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Intención que ajusta el recorrido del grafo.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum Intent {
    /// Corrección.
    Fix,
    /// Pruebas.
    Test,
    /// Reorganización.
    Refactor,
    /// Incorporación.
    Add,
    /// Modificación (defecto).
    #[default]
    Modify,
    /// Explicación.
    Explain,
}
impl Intent {
    /// Nombre estable.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Fix => "fix",
            Self::Test => "test",
            Self::Refactor => "refactor",
            Self::Add => "add",
            Self::Modify => "modify",
            Self::Explain => "explain",
        }
    }
    /// Peso de dependientes (§9.6).
    pub fn reverse(self) -> f64 {
        crate::ContextParams::default().reverse(self)
    }
}
/// Anclas explícitas.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct Anchors {
    /// Ids de archivo.
    pub files: Vec<String>,
    /// Ids o nombres de símbolo.
    pub symbols: Vec<String>,
}
/// Petición de contexto; los datos leídos por TS se reciben en ContextInputs.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct ContextRequest {
    /// Texto de 1–4000 caracteres.
    pub task: String,
    /// Anclas explícitas.
    pub anchors: Anchors,
    /// Intención explícita, si existe.
    pub intent: Option<Intent>,
    /// Presupuesto CLI de 1000–200000 tokens.
    pub budget_tokens: usize,
    /// Incluir semillas de archivos modificados.
    pub dirty_files: bool,
    /// Interno: parámetros opcionales para calibración.
    pub params: Option<crate::ContextParams>,
    /// Incluir traza para el anfitrión.
    pub explain: bool,
}
impl Default for ContextRequest {
    fn default() -> Self {
        Self {
            task: String::new(),
            anchors: Anchors::default(),
            intent: None,
            budget_tokens: 8000,
            dirty_files: true,
            explain: false,
            params: None,
        }
    }
}
/// Skill ya leída por TypeScript.
#[derive(Debug, Clone, Default, Serialize)]
pub struct SkillInput {
    /// Nombre estable.
    pub name: String,
    /// Cuerpo sin frontmatter.
    pub body: String,
    /// Contexto requerido: anclas débiles.
    pub required_files: Vec<String>,
    /// Símbolos requeridos: anclas débiles.
    pub required_symbols: Vec<String>,
}
/// Alcance ya leído por TypeScript.
#[derive(Debug, Clone, Default, Serialize)]
pub struct TaskScopeInput {
    /// Id de tarea.
    pub task_id: String,
    /// Descripción.
    pub description: String,
    /// Globs de alcance.
    pub paths: Vec<String>,
    /// Checks descritos; nunca se ejecutan aquí.
    pub checks: Vec<String>,
}
/// Datos externos al mapa suministrados por TypeScript.
#[derive(Debug, Clone, Serialize)]
pub struct ContextInputs {
    /// Reglas.
    pub rules: Option<String>,
    /// Skill.
    pub skill: Option<SkillInput>,
    /// Alcance.
    pub task_scope: Option<TaskScopeInput>,
    /// Ids modificados.
    pub dirty_files: Vec<String>,
    /// Tamaño del núcleo (15 por defecto).
    pub core_files: usize,
}
impl Default for ContextInputs {
    fn default() -> Self {
        Self {
            rules: None,
            skill: None,
            task_scope: None,
            dirty_files: Vec::new(),
            core_files: crate::ContextParams::default().core_files,
        }
    }
}
/// Nivel de contenido.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum RenderLevel {
    /// Contorno.
    L0,
    /// Firmas exportadas.
    L1,
    /// Firmas, tipos completos y JSDoc.
    L2,
    /// Archivo completo.
    L3,
}
impl RenderLevel {
    /// Nombre del nivel.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::L0 => "L0",
            Self::L1 => "L1",
            Self::L2 => "L2",
            Self::L3 => "L3",
        }
    }
}
/// Archivo incluido.
#[derive(Debug, Clone, Serialize)]
pub struct PackFile {
    /// Id relativo normalizado.
    pub id: String,
    /// Nivel.
    pub level: RenderLevel,
    /// Coste de la entrada; el envoltorio compartido L0/L1 se contabiliza en la sección.
    pub tokens: usize,
    /// PPR final redondeado.
    pub score: f64,
    /// Razones ordenadas.
    pub reasons: Vec<String>,
    /// Nota de degradación.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}
/// Sección renderizada.
#[derive(Debug, Clone, Serialize)]
pub struct PackSection {
    /// Nombre normativo.
    pub id: String,
    /// mandatory/optional.
    pub class: String,
    /// static/session/task.
    pub stability: String,
    /// Coste.
    pub tokens: usize,
    /// BLAKE3 del texto exacto de la sección.
    pub hash: String,
}
/// Candidato excluido por selección.
#[derive(Debug, Clone, Serialize)]
pub struct ExcludedFile {
    /// Id.
    pub id: String,
    /// BUDGET/RANK_CUTOFF.
    pub reason: String,
    /// Puntuación final.
    pub score: f64,
}
/// Aviso recuperable.
#[derive(Debug, Clone, Serialize)]
pub struct Diagnostic {
    /// Código estable.
    pub code: String,
    /// Mensaje sin rutas absolutas.
    pub message: String,
    /// Sujeto, cuando aplica.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subject: Option<String>,
}
/// Presupuesto efectivo.
#[derive(Debug, Clone, Serialize)]
pub struct Budget {
    /// Límite de la petición.
    pub limit: usize,
    /// Coste conservador del renderizado.
    pub used: usize,
    /// Estimador versionado.
    pub estimator: String,
}
/// Petición canónica conforme al esquema JSON.
#[derive(Debug, Clone, Serialize)]
pub struct NormalizedRequest {
    /// Texto normalizado.
    pub task: String,
    /// Anclas ordenadas.
    pub anchors: Anchors,
    /// Intención explícita (null si inferida).
    pub intent: Option<Intent>,
    /// Límite.
    pub budget_tokens: usize,
    /// Nombre de skill.
    pub skill: Option<String>,
    /// Id de tarea.
    pub task_id: Option<String>,
    /// Semillas dirty activadas.
    pub dirty_files: bool,
    /// Parámetros efectivos no predeterminados (interno).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub params: Option<crate::ContextParams>,
    /// Traza.
    pub explain: bool,
}
/// Context Pack v2 determinista.
#[derive(Debug, Clone, Serialize)]
pub struct ContextPack {
    /// Versión del formato.
    pub pack_version: u32,
    /// BLAKE3 de rendered + files canónicos.
    pub pack_hash: String,
    /// Hash del mapa.
    pub map_hash: String,
    /// Petición normalizada.
    pub request: NormalizedRequest,
    /// Intención efectiva.
    pub intent: Intent,
    /// request/inferred.
    pub intent_source: String,
    /// Contabilidad.
    pub budget: Budget,
    /// Orden normativo.
    pub sections: Vec<PackSection>,
    /// Archivos seleccionados.
    pub files: Vec<PackFile>,
    /// Hasta 20 descartados.
    pub excluded: Vec<ExcludedFile>,
    /// Avisos recuperables.
    pub diagnostics: Vec<Diagnostic>,
    /// Markdown estable→dinámico.
    pub rendered: String,
}
impl ContextPack {
    /// JSON snake_case conforme al esquema v1.
    pub fn to_json_value(&self) -> Value {
        serde_json::to_value(self).expect("ContextPack solo contiene valores JSON finitos")
    }
    /// Bytes canónicos para almacenamiento y comparación.
    pub fn to_canonical_json(&self) -> String {
        foker_map::canonical::to_canonical_string(&self.to_json_value())
    }
}
/// Fallos de entrada, presupuesto obligatorio y lectura.
#[derive(Debug, thiserror::Error)]
pub enum ContextError {
    /// Entrada inválida.
    #[error("FKR-INP-001: {0}")]
    InvalidInput(String),
    /// Contexto obligatorio que no cabe, con desglose por sección/archivo.
    #[error("FKR-CTX-001: contexto obligatorio ({required} tokens) excede {limit}: {breakdown:?}")]
    BudgetExceeded {
        /// Presupuesto disponible.
        limit: usize,
        /// Coste requerido.
        required: usize,
        /// Desglose estable.
        breakdown: Vec<(String, usize)>,
    },
    /// Lectura fallida.
    #[error("FKR-MAP-001: no se pudo leer {id}: {source}")]
    Io {
        /// Id relativo.
        id: String,
        /// Causa.
        source: std::io::Error,
    },
    /// Ruta fuera del root.
    #[error("FKR-POL-001: {0}")]
    Path(#[from] foker_map::path::PathError),
}
impl ContextError {
    /// Código público para el binding.
    pub fn code(&self) -> FokerCode {
        match self {
            Self::InvalidInput(_) => FokerCode::Inp001,
            Self::BudgetExceeded { .. } => FokerCode::Ctx001,
            Self::Io { .. } => FokerCode::Map001,
            Self::Path(_) => FokerCode::Pol001,
        }
    }
}
