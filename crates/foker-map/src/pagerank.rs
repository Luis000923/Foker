//! PageRank (FOKER-SPEC §8.5 y §9.6): iteración de potencias determinista.

use crate::canonical::round12;

/// Amortiguación.
pub const DAMPING: f64 = 0.85;
/// Criterio de parada: suma de diferencias absolutas.
pub const TOLERANCE: f64 = 1e-10;
/// Máximo de iteraciones.
pub const MAX_ITERATIONS: usize = 100;

/// Grafo ponderado sobre nodos `0..n` (el llamador fija su orden, p. ej. por id).
#[derive(Debug, Clone, Default)]
pub struct WeightedGraph {
    n: usize,
    /// Aristas `(origen, destino, peso)` ordenadas por (origen, destino) y sin duplicados (sumados).
    edges: Vec<(usize, usize, f64)>,
}

impl WeightedGraph {
    /// Grafo vacío con `n` nodos.
    pub fn new(n: usize) -> Self {
        WeightedGraph {
            n,
            edges: Vec::new(),
        }
    }

    /// Añade peso a la arista `from → to`. Pesos ≤ 0 se ignoran; los bucles también.
    pub fn add(&mut self, from: usize, to: usize, weight: f64) {
        if weight > 0.0 && from != to && from < self.n && to < self.n {
            self.edges.push((from, to, weight));
        }
    }

    /// Construye el grafo de archivos de §8.5; `reverse` pondera las aristas inversas de §9.6.
    /// `ids` fija el orden de nodos y debe estar ordenado por id.
    pub fn from_map_edges(ids: &[&str], edges: &[crate::model::MapEdge], reverse: f64) -> Self {
        let mut graph = Self::new(ids.len());
        for edge in edges {
            let weight = match edge.kind {
                crate::model::EdgeKind::Imports => 1.0,
                crate::model::EdgeKind::ImportsType | crate::model::EdgeKind::Reexports => 0.5,
                crate::model::EdgeKind::UsesSymbol => ln_1p(f64::from(edge.weight.unwrap_or(1))),
                _ => continue,
            };
            let file = |id: &str| id.split('#').next().unwrap_or(id).to_owned();
            if let (Ok(from), Ok(to)) = (
                ids.binary_search(&file(&edge.from).as_str()),
                ids.binary_search(&file(&edge.to).as_str()),
            ) {
                graph.add(from, to, weight);
                graph.add(to, from, weight * reverse);
            }
        }
        graph
    }

    fn normalized(&self) -> Vec<(usize, usize, f64)> {
        let mut edges = self.edges.clone();
        edges.sort_by_key(|a| (a.0, a.1));
        let mut merged: Vec<(usize, usize, f64)> = Vec::with_capacity(edges.len());
        for (from, to, weight) in edges {
            match merged.last_mut() {
                Some(last) if last.0 == from && last.1 == to => last.2 += weight,
                _ => merged.push((from, to, weight)),
            }
        }
        merged
    }

    /// PageRank con teletransporte a `personalization` (uniforme si es `None` o suma 0).
    /// Devuelve valores que suman 1, redondeados a 1e-12.
    pub fn pagerank(&self, personalization: Option<&[f64]>) -> Vec<f64> {
        let n = self.n;
        if n == 0 {
            return Vec::new();
        }
        let teleport: Vec<f64> = match personalization {
            Some(p) if p.len() == n && p.iter().sum::<f64>() > 0.0 => {
                let total: f64 = p.iter().sum();
                p.iter().map(|x| x.max(0.0) / total).collect()
            }
            _ => vec![1.0 / n as f64; n],
        };
        let edges = self.normalized();
        let mut out_weight = vec![0.0; n];
        for &(from, _, weight) in &edges {
            out_weight[from] += weight;
        }
        let mut rank = teleport.clone();
        for _ in 0..MAX_ITERATIONS {
            let dangling: f64 = (0..n)
                .filter(|&i| out_weight[i] == 0.0)
                .map(|i| rank[i])
                .sum();
            // Los nodos sin salida reparten su masa de forma uniforme (FOKER-SPEC §8.5).
            let spread = DAMPING * dangling / n as f64;
            let mut next: Vec<f64> = teleport
                .iter()
                .map(|t| (1.0 - DAMPING) * t + spread)
                .collect();
            for &(from, to, weight) in &edges {
                next[to] += DAMPING * rank[from] * weight / out_weight[from];
            }
            let delta: f64 = next.iter().zip(&rank).map(|(a, b)| (a - b).abs()).sum();
            rank = next;
            if delta < TOLERANCE {
                break;
            }
        }
        let total: f64 = rank.iter().sum();
        rank.iter().map(|r| round12(r / total)).collect()
    }
}

/// `ln(1 + x)` con `libm` (Rust puro): idéntico en todas las plataformas, a diferencia de la libm
/// del sistema.
pub fn ln_1p(x: f64) -> f64 {
    libm::log1p(x)
}
