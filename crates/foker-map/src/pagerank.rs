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

#[cfg(test)]
mod tests {
    use super::*;

    fn close(a: f64, b: f64) -> bool {
        (a - b).abs() < 1e-9
    }

    #[test]
    fn sums_to_one_and_ranks_hubs_first() {
        // 0 → 2, 1 → 2, 3 → 2, 2 → 0.
        let mut g = WeightedGraph::new(4);
        g.add(0, 2, 1.0);
        g.add(1, 2, 1.0);
        g.add(3, 2, 1.0);
        g.add(2, 0, 1.0);
        let rank = g.pagerank(None);
        assert!(close(rank.iter().sum(), 1.0));
        assert!(rank[2] > rank[0] && rank[0] > rank[1]);
        assert!(close(rank[1], rank[3]));
    }

    #[test]
    fn handles_dangling_nodes_and_empty_graphs() {
        assert!(WeightedGraph::new(0).pagerank(None).is_empty());
        let rank = WeightedGraph::new(3).pagerank(None);
        assert!(rank.iter().all(|r| close(*r, 1.0 / 3.0)));
    }

    #[test]
    fn duplicate_edges_add_up() {
        let mut a = WeightedGraph::new(3);
        a.add(0, 1, 0.5);
        a.add(0, 1, 0.5);
        a.add(0, 2, 1.0);
        let rank = a.pagerank(None);
        assert!(close(rank[1], rank[2]));
    }

    #[test]
    fn personalization_biases_the_result() {
        let mut g = WeightedGraph::new(3);
        g.add(0, 1, 1.0);
        g.add(1, 2, 1.0);
        g.add(2, 0, 1.0);
        let rank = g.pagerank(Some(&[1.0, 0.0, 0.0]));
        assert!(rank[0] > rank[1] && rank[1] > rank[2]);
        assert!(close(rank.iter().sum(), 1.0));
    }

    #[test]
    fn deterministic_regardless_of_insertion_order() {
        let mut a = WeightedGraph::new(4);
        let mut b = WeightedGraph::new(4);
        let edges = [
            (0, 1, 1.0),
            (1, 2, 0.5),
            (2, 3, ln_1p(3.0)),
            (3, 0, 1.0),
            (0, 2, 0.5),
        ];
        for e in edges {
            a.add(e.0, e.1, e.2);
        }
        for e in edges.iter().rev() {
            b.add(e.0, e.1, e.2);
        }
        assert_eq!(a.pagerank(None), b.pagerank(None));
    }
}
