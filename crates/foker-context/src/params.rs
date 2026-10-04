//! Parámetros internos de calibración; no son configuración pública de CLI/MCP.
use crate::{ContextError, Intent};
use serde::{Deserialize, Serialize};
/// Pesos y umbrales efectivos; defaults originales de §9.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct ContextParams {
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
        ];
        if weights
            .iter()
            .any(|v| !v.is_finite() || *v < 0.0 || *v > 100.0)
            || [
                self.anchor_fraction,
                self.margin_fraction,
                self.l0_min_fraction,
                self.core_fraction,
                self.bm25_b,
            ]
            .iter()
            .any(|v| *v > 1.0)
            || self.bm25_k1 == 0.0
            || [self.bm25_top, self.l2_count, self.l0_count, self.core_files]
                .iter()
                .any(|v| *v > 10000)
        {
            return Err(ContextError::InvalidInput("params fuera de rango".into()));
        }
        Ok(())
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
