//! Tabla de intención versionada y desempate fijo (FKR-030).
use crate::Intent;
/// Tabla empaquetada con el motor.
pub const KEYWORDS: &str = include_str!("../data/intent-keywords.tsv");
/// Inferencia por coincidencias de palabras, con prioridad de filas.
pub fn infer(task: &str) -> Intent {
    let words: Vec<String> = task
        .split(|c: char| !c.is_alphanumeric())
        .filter(|w| !w.is_empty())
        .map(str::to_lowercase)
        .collect();
    let priority = [
        Intent::Fix,
        Intent::Test,
        Intent::Refactor,
        Intent::Add,
        Intent::Modify,
        Intent::Explain,
    ];
    let mut result = Intent::Modify;
    let mut best = 0;
    for (intent, row) in priority.into_iter().zip(KEYWORDS.lines()) {
        let (_, keywords) = row.split_once('\t').expect("tabla versionada");
        let count = words
            .iter()
            .filter(|word| keywords.split_whitespace().any(|k| k == word.as_str()))
            .count();
        if count > best {
            best = count;
            result = intent;
        }
    }
    result
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn priority_default_and_counts() {
        assert_eq!(infer("fix test add"), Intent::Fix);
        assert_eq!(infer("test refactor"), Intent::Test);
        assert_eq!(infer("Añade la variante danger"), Intent::Add);
        assert_eq!(infer("fix test test"), Intent::Test);
        assert_eq!(infer("xyzzy"), Intent::Modify);
        assert_eq!(infer("prefix"), Intent::Modify);
    }
}
