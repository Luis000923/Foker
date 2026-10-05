//! Parámetros internos de calibración; no son configuración pública de CLI/MCP.
use crate::{ContextError, Intent};
use serde::{Deserialize, Serialize};
/// Pesos y umbrales efectivos; recuperación léxica ampliada según ADR-028.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct ContextParams {
    /// Expansión léxica es/en v1, desactivable para medir el baseline.
    #[serde(skip_serializing_if = "expansion_predeterminada")]
    pub lexical_expansion: bool,
    /// Plegado flexivo es/en en BM25 (ADR-032), desactivable para medir el baseline.
    #[serde(skip_serializing_if = "plegado_predeterminado")]
    pub inflection_folding: bool,
    /// Contenido completo de L2 no ancla si cuesta como máximo estos tokens más (ADR-034); 0 lo desactiva.
    #[serde(skip_serializing_if = "pequeno_completo_predeterminado")]
    pub small_full_max_extra: usize,
    /// Vista focal de anclas cuyo L3 supera estos tokens y no cabe (ADR-033); 0 la desactiva.
    #[serde(skip_serializing_if = "focal_min_predeterminado")]
    pub focal_min_tokens: usize,
    /// Máximo de símbolos focales añadidos por BM25; anclas e identificadores citados siempre entran.
    #[serde(skip_serializing_if = "focal_max_predeterminado")]
    pub focal_max_symbols: usize,
    /// Corte léxico relativo al mejor símbolo del archivo para entrar en el foco.
    #[serde(skip_serializing_if = "focal_relativo_predeterminado")]
    pub focal_relative: f64,
    /// Corte BM25 relativo al máximo; cero conserva top-k.
    #[serde(skip_serializing_if = "corte_bm25_predeterminado")]
    pub bm25_min_relative: f64,
    /// Corte del ranking opcional relativo al máximo; cero lo desactiva.
    #[serde(skip_serializing_if = "relevancia_predeterminada")]
    pub relevance_fraction: f64,
    /// Corte de suficiencia relativo al mejor no-ancla (ADR-031).
    #[serde(skip_serializing_if = "suficiencia_predeterminada")]
    pub sufficiency_fraction: f64,
    /// Máximos L2/L1 por fix, test, refactor, add, modify, explain.
    #[serde(skip_serializing_if = "limites_related_predeterminados")]
    pub related_limits: [usize; 6],
    /// Máximos L0 por intención en el mismo orden.
    #[serde(skip_serializing_if = "limites_outline_predeterminados")]
    pub outline_limits: [usize; 6],
    /// Corte relativo del core respecto de su mejor PageRank global.
    #[serde(skip_serializing_if = "corte_core_predeterminado")]
    pub core_min_relative: f64,
    /// Parámetro w_anchor (default 1.0).
    pub w_anchor: f64,
    /// Parámetro mention_factor (default 0.8).
    pub mention_factor: f64,
    /// Parámetro w_lex (default 0.6).
    pub w_lex: f64,
    /// Parámetro bm25_top (default 20).
    pub bm25_top: usize,
    /// Parámetro w_dirty (default 0.3).
    pub w_dirty: f64,
    /// Parámetro w_task_scope (default 0.5).
    pub w_task_scope: f64,
    /// Parámetro w_skill (default 0.5).
    pub w_skill: f64,
    /// Parámetro r_fix (default 0.5).
    pub r_fix: f64,
    /// Parámetro r_modify (default 0.5).
    pub r_modify: f64,
    /// Parámetro r_test (default 0.4).
    pub r_test: f64,
    /// Parámetro r_refactor (default 0.7).
    pub r_refactor: f64,
    /// Parámetro r_add (default 0.1).
    pub r_add: f64,
    /// Parámetro r_explain (default 0.3).
    pub r_explain: f64,
    /// Parámetro test_factor (default 1.5).
    pub test_factor: f64,
    /// Parámetro l2_count (default 5).
    pub l2_count: usize,
    /// Parámetro anchor_fraction (default 0.4).
    pub anchor_fraction: f64,
    /// Parámetro margin_fraction (default 0.05).
    pub margin_fraction: f64,
    /// Parámetro l0_count (default 30).
    pub l0_count: usize,
    /// Parámetro l0_min_fraction (default 0.03).
    pub l0_min_fraction: f64,
    /// Parámetro core_files (default 15).
    pub core_files: usize,
    /// Parámetro core_fraction (default 0.1).
    pub core_fraction: f64,
    /// Parámetro bm25_k1 (default 1.2).
    pub bm25_k1: f64,
    /// Parámetro bm25_b (default 0.75).
    pub bm25_b: f64,
}
impl Default for ContextParams {
    fn default() -> Self {
        Self {
            lexical_expansion: true,
            inflection_folding: false,
            small_full_max_extra: 64,
            focal_min_tokens: 500,
            focal_max_symbols: 5,
            focal_relative: 0.5,
            bm25_min_relative: 0.0,
            relevance_fraction: 0.01,
            sufficiency_fraction: 0.025,
            related_limits: [64, 64, 96, 64, 64, 96],
            outline_limits: [0; 6],
            core_min_relative: 0.1,
            w_anchor: 1.0,
            mention_factor: 0.8,
            w_lex: 0.6,
            bm25_top: 20,
            w_dirty: 0.3,
            w_task_scope: 0.5,
            w_skill: 0.5,
            r_fix: 0.5,
            r_modify: 0.5,
            r_test: 0.4,
            r_refactor: 0.7,
            r_add: 0.1,
            r_explain: 0.3,
            test_factor: 1.5,
            l2_count: 5,
            anchor_fraction: 0.4,
            margin_fraction: 0.05,
            l0_count: 30,
            l0_min_fraction: 0.03,
            core_files: 15,
            core_fraction: 0.1,
            bm25_k1: 1.2,
            bm25_b: 0.75,
        }
    }
}
impl ContextParams {
    /// Adapta los números JS sin truncar fracciones ni desbordar enteros.
    pub fn with_counts(mut self, counts: [Option<f64>; 4]) -> Result<Self, ContextError> {
        for (target, value) in [
            &mut self.bm25_top,
            &mut self.l2_count,
            &mut self.l0_count,
            &mut self.core_files,
        ]
        .into_iter()
        .zip(counts)
        {
            if let Some(value) = value {
                if !value.is_finite() || !(0.0..=10000.0).contains(&value) || value.fract() != 0.0 {
                    return Err(ContextError::InvalidInput(
                        "params requiere límites enteros entre 0 y 10000".into(),
                    ));
                }
                *target = value as usize;
            }
        }
        Ok(self)
    }

    /// Valida valores antes de calcular scores o presupuestos.
    pub fn validate(&self) -> Result<(), ContextError> {
        let weights = [
            self.sufficiency_fraction,
            self.core_min_relative,
            self.bm25_min_relative,
            self.relevance_fraction,
            self.w_anchor,
            self.mention_factor,
            self.w_lex,
            self.w_dirty,
            self.w_task_scope,
            self.w_skill,
            self.r_fix,
            self.r_modify,
            self.r_test,
            self.r_refactor,
            self.r_add,
            self.r_explain,
            self.test_factor,
            self.anchor_fraction,
            self.margin_fraction,
            self.l0_min_fraction,
            self.core_fraction,
            self.bm25_k1,
            self.bm25_b,
            self.focal_relative,
        ];
        if weights
            .iter()
            .any(|v| !v.is_finite() || *v < 0.0 || *v > 100.0)
            || [
                self.sufficiency_fraction,
                self.core_min_relative,
                self.bm25_min_relative,
                self.relevance_fraction,
                self.anchor_fraction,
                self.margin_fraction,
                self.l0_min_fraction,
                self.core_fraction,
                self.bm25_b,
                self.focal_relative,
            ]
            .iter()
            .any(|v| *v > 1.0)
            || self.bm25_k1 == 0.0
            || self.focal_min_tokens > 200_000
            || self.small_full_max_extra > 200_000
            || [
                self.bm25_top,
                self.l2_count,
                self.l0_count,
                self.core_files,
                self.focal_max_symbols,
            ]
            .iter()
            .chain(self.related_limits.iter())
            .chain(self.outline_limits.iter())
            .any(|v| *v > 10000)
        {
            return Err(ContextError::InvalidInput("params fuera de rango".into()));
        }
        Ok(())
    }
    /// Límites de suficiencia; las anclas no consumen estos máximos.
    pub fn limits(&self, intent: Intent) -> (usize, usize) {
        let index = match intent {
            Intent::Fix => 0,
            Intent::Test => 1,
            Intent::Refactor => 2,
            Intent::Add => 3,
            Intent::Modify => 4,
            Intent::Explain => 5,
        };
        (
            self.related_limits[index],
            self.outline_limits[index].min(self.l0_count),
        )
    }
    /// Factor de aristas inversas por intención.
    pub fn reverse(&self, intent: Intent) -> f64 {
        match intent {
            Intent::Fix => self.r_fix,
            Intent::Modify => self.r_modify,
            Intent::Test => self.r_test,
            Intent::Refactor => self.r_refactor,
            Intent::Add => self.r_add,
            Intent::Explain => self.r_explain,
        }
    }
}

// Los campos añadidos se omiten cuando coinciden con los defaults de ADR-028:
// los overrides anteriores conservan la forma JSON reconocida por el esquema v1.
fn pequeno_completo_predeterminado(value: &usize) -> bool {
    *value == ContextParams::default().small_full_max_extra
}
fn focal_min_predeterminado(value: &usize) -> bool {
    *value == ContextParams::default().focal_min_tokens
}
fn focal_max_predeterminado(value: &usize) -> bool {
    *value == ContextParams::default().focal_max_symbols
}
fn focal_relativo_predeterminado(value: &f64) -> bool {
    *value == ContextParams::default().focal_relative
}
fn plegado_predeterminado(value: &bool) -> bool {
    *value == ContextParams::default().inflection_folding
}
fn expansion_predeterminada(value: &bool) -> bool {
    *value == ContextParams::default().lexical_expansion
}
fn corte_bm25_predeterminado(value: &f64) -> bool {
    *value == ContextParams::default().bm25_min_relative
}
fn relevancia_predeterminada(value: &f64) -> bool {
    *value == ContextParams::default().relevance_fraction
}

fn suficiencia_predeterminada(value: &f64) -> bool {
    *value == ContextParams::default().sufficiency_fraction
}
fn limites_related_predeterminados(value: &[usize; 6]) -> bool {
    *value == ContextParams::default().related_limits
}
fn limites_outline_predeterminados(value: &[usize; 6]) -> bool {
    *value == ContextParams::default().outline_limits
}
fn corte_core_predeterminado(value: &f64) -> bool {
    *value == ContextParams::default().core_min_relative
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn campos_nuevos_preservan_forma_legacy_y_roundtrip() {
        let defaults = ContextParams::default();
        let json = serde_json::to_value(&defaults).unwrap();
        for key in [
            "lexical_expansion",
            "bm25_min_relative",
            "relevance_fraction",
            "sufficiency_fraction",
            "related_limits",
            "outline_limits",
            "core_min_relative",
        ] {
            assert!(json.get(key).is_none());
        }
        assert_eq!(
            serde_json::from_value::<ContextParams>(json).unwrap(),
            defaults
        );
        let baseline = ContextParams {
            lexical_expansion: false,
            bm25_min_relative: 0.5,
            relevance_fraction: 0.0,
            ..defaults
        };
        let json = serde_json::to_value(&baseline).unwrap();
        assert_eq!(json["lexical_expansion"], false);
        assert_eq!(json["bm25_min_relative"], 0.5);
        assert_eq!(json["relevance_fraction"], 0.0);
        assert_eq!(
            serde_json::from_value::<ContextParams>(json).unwrap(),
            baseline
        );
    }
    #[test]
    fn limites_enteros_no_truncan_ni_desbordan() {
        let defaults = ContextParams::default();
        let params = defaults
            .clone()
            .with_counts([Some(0.0), Some(10000.0), None, Some(7.0)])
            .unwrap();
        assert_eq!(
            (
                params.bm25_top,
                params.l2_count,
                params.l0_count,
                params.core_files
            ),
            (0, 10000, defaults.l0_count, 7)
        );
        assert!(params.validate().is_ok());
        for index in 0..4 {
            for value in [-1.0, 0.5, 10001.0, f64::NAN, f64::INFINITY] {
                let mut counts = [None; 4];
                counts[index] = Some(value);
                assert!(matches!(
                    defaults.clone().with_counts(counts),
                    Err(ContextError::InvalidInput(_))
                ));
            }
        }
    }

    #[test]
    fn rechaza_pesos_y_fracciones_fuera_de_rango() {
        for value in [-1.0, 101.0, f64::NAN, f64::INFINITY] {
            let params = ContextParams {
                w_anchor: value,
                ..Default::default()
            };
            assert!(params.validate().is_err());
        }
        for params in [
            ContextParams {
                sufficiency_fraction: 1.01,
                ..Default::default()
            },
            ContextParams {
                core_min_relative: f64::NAN,
                ..Default::default()
            },
            ContextParams {
                related_limits: [10001; 6],
                ..Default::default()
            },
            ContextParams {
                outline_limits: [10001; 6],
                ..Default::default()
            },
            ContextParams {
                bm25_min_relative: 1.01,
                ..Default::default()
            },
            ContextParams {
                relevance_fraction: f64::NAN,
                ..Default::default()
            },
            ContextParams {
                anchor_fraction: 1.01,
                ..Default::default()
            },
            ContextParams {
                bm25_k1: 0.0,
                ..Default::default()
            },
            ContextParams {
                core_files: 10001,
                ..Default::default()
            },
        ] {
            assert!(matches!(
                params.validate(),
                Err(ContextError::InvalidInput(_))
            ));
        }
    }
}
