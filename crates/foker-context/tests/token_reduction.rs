//! Reducción de tokens sin pérdida: determinismo, contexto diferencial, corte por relevancia,
//! firmas L1 de tipos y cabeceras de licencia.
use foker_context::{
    Anchors, ContextInputs, ContextPack, ContextParams, ContextRequest, RenderLevel, build_context,
    render::{compact_type, strip_license_header},
};
use foker_map::{
    config::MapConfig,
    engine::{MapEngine, RefreshOptions},
};
use std::{collections::BTreeMap, fs, path::Path};

fn write(root: &Path, id: &str, text: &str) {
    let path = root.join(id);
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, text).unwrap();
}

/// Proyecto pequeño: un ancla, una dependencia directa, una cadena lejana y ruido léxico.
fn fixture(root: &Path) {
    write(
        root,
        "src/core.ts",
        "/*\n * Copyright 2026 Ejemplo\n * Licensed under the Apache License, Version 2.0\n */\nimport { helper } from './helper';\nexport function core(a: number): number {\n  return helper(a) + 1;\n}\n",
    );
    write(
        root,
        "src/helper.ts",
        "import { far } from './far';\n/** Ayuda. */\nexport function helper(a: number): number {\n  return far(a) * 2;\n}\n",
    );
    write(
        root,
        "src/far.ts",
        "import { farther } from './farther';\nexport function far(a: number): number {\n  return farther(a);\n}\n",
    );
    write(
        root,
        "src/farther.ts",
        "export function farther(a: number): number {\n  return a;\n}\n",
    );
    for i in 0..12 {
        write(
            root,
            &format!("src/noise{i}.ts"),
            &format!(
                "export interface Noise{i} {{\n  /** Campo id. */\n  id: number;\n  /** Campo name. */\n  name: string;\n}}\nexport function noise{i}(): number {{\n  return {i};\n}}\n"
            ),
        );
    }
}

fn engine(root: &Path) -> MapEngine {
    let mut engine = MapEngine::open(root, MapConfig::default()).unwrap();
    engine.refresh(&RefreshOptions::default()).unwrap();
    engine
}

fn request(task: &str, anchor: &str) -> ContextRequest {
    ContextRequest {
        task: task.into(),
        anchors: Anchors {
            files: vec![anchor.into()],
            symbols: vec![],
        },
        ..Default::default()
    }
}

fn pack(engine: &MapEngine, req: &ContextRequest, inputs: &ContextInputs) -> ContextPack {
    build_context(engine.state().unwrap(), engine.root(), req, inputs).unwrap()
}

#[test]
fn pack_is_byte_for_byte_deterministic() {
    let dir = tempfile::tempdir().unwrap();
    fixture(dir.path());
    let req = request("Corregir core", "src/core.ts");
    let a = pack(&engine(dir.path()), &req, &ContextInputs::default());
    let b = pack(&engine(dir.path()), &req, &ContextInputs::default());
    assert_eq!(a.to_canonical_json(), b.to_canonical_json());
    assert_eq!(a.rendered, b.rendered);
}

#[test]
fn delta_replaces_identical_entries_and_resends_changed_ones() {
    let dir = tempfile::tempdir().unwrap();
    fixture(dir.path());
    let req = request("Corregir core", "src/core.ts");
    let first = pack(&engine(dir.path()), &req, &ContextInputs::default());
    assert!(
        first
            .files
            .iter()
            .all(|f| f.hash.len() == 16 && !f.unchanged)
    );
    let delivered: BTreeMap<_, _> = first
        .files
        .iter()
        .map(|f| (f.id.clone(), f.hash.clone()))
        .collect();
    let inputs = ContextInputs {
        delivered: delivered.clone(),
        ..Default::default()
    };
    let second = pack(&engine(dir.path()), &req, &inputs);
    assert!(second.files.iter().all(|f| f.unchanged));
    assert!(second.budget.used < first.budget.used);
    assert!(second.rendered.contains("unchanged=\""));
    assert!(!second.rendered.contains("return helper(a) + 1"));
    // Determinista también en modo diferencial.
    let again = pack(&engine(dir.path()), &req, &inputs);
    assert_eq!(second.rendered, again.rendered);

    // Un cambio en el ancla vuelve a enviar su contenido; lo demás sigue como referencia.
    write(
        dir.path(),
        "src/core.ts",
        "import { helper } from './helper';\nexport function core(a: number): number {\n  return helper(a) + 2;\n}\n",
    );
    let third = pack(&engine(dir.path()), &req, &inputs);
    let anchor = third.files.iter().find(|f| f.id == "src/core.ts").unwrap();
    assert!(!anchor.unchanged);
    assert!(third.rendered.contains("return helper(a) + 2"));
    assert!(
        third
            .files
            .iter()
            .filter(|f| f.id != "src/core.ts")
            .all(|f| f.unchanged)
    );
}

#[test]
fn relevance_cut_keeps_anchor_and_direct_neighbors() {
    let dir = tempfile::tempdir().unwrap();
    fixture(dir.path());
    let req = request("Corregir core y su noise", "src/core.ts");
    let strict = ContextRequest {
        params: Some(ContextParams {
            related_min_relative: 1.0,
            related_free_fraction: 0.0,
            ..Default::default()
        }),
        ..req.clone()
    };
    let cut = pack(&engine(dir.path()), &strict, &ContextInputs::default());
    let ids: Vec<_> = cut.files.iter().map(|f| f.id.as_str()).collect();
    assert!(ids.contains(&"src/core.ts"));
    assert!(ids.contains(&"src/helper.ts"), "vecino directo: {ids:?}");
    assert!(!ids.iter().any(|id| id.starts_with("src/noise")), "{ids:?}");
    let loose = ContextRequest {
        params: Some(ContextParams {
            related_min_relative: 0.0,
            ..Default::default()
        }),
        ..req
    };
    let full = pack(&engine(dir.path()), &loose, &ContextInputs::default());
    // Con ruido léxico débil, el corte lo excluye y sin corte entra por ranking.
    let lexical_noise = |p: &ContextPack| {
        p.files.iter().any(|f| {
            f.id.starts_with("src/noise") && f.reasons.iter().any(|r| r.starts_with("LEXICAL:"))
        })
    };
    assert!(lexical_noise(&full), "{:?}", full.files);
    assert!(!lexical_noise(&cut));
}

#[test]
fn free_allowance_keeps_small_projects_whole() {
    let dir = tempfile::tempdir().unwrap();
    fixture(dir.path());
    let req = ContextRequest {
        params: Some(ContextParams {
            related_min_relative: 1.0,
            related_free_fraction: 1.0,
            ..Default::default()
        }),
        ..request("Corregir core y su noise", "src/core.ts")
    };
    let built = pack(&engine(dir.path()), &req, &ContextInputs::default());
    assert!(
        built.files.iter().any(|f| f.id.starts_with("src/noise")
            && f.reasons.iter().any(|r| r.starts_with("LEXICAL:")))
    );
}

#[test]
fn anchor_l3_omits_license_header_with_marker() {
    let dir = tempfile::tempdir().unwrap();
    fixture(dir.path());
    let built = pack(
        &engine(dir.path()),
        &request("Corregir core", "src/core.ts"),
        &ContextInputs::default(),
    );
    let anchor = built.files.iter().find(|f| f.id == "src/core.ts").unwrap();
    assert_eq!(anchor.level, RenderLevel::L3);
    assert!(
        built
            .rendered
            .contains("// foker: cabecera de licencia omitida (4 líneas)")
    );
    assert!(!built.rendered.contains("Apache License"));
    assert!(built.rendered.contains("return helper(a) + 1"));
}

#[test]
fn compact_type_strips_comments_outside_literals() {
    let source = "export interface A {\n  /** Campo id. */\n  id: number; // comentario\n  url: '//no-es-comentario';\n  /* bloque */ name: string\n}";
    assert_eq!(
        compact_type(source),
        "export interface A { id: number; url: '//no-es-comentario'; name: string }"
    );
}

#[test]
fn compact_type_cuts_at_member_boundary() {
    let members: String = (0..80).map(|i| format!("  field{i}: string;\n")).collect();
    let out = compact_type(&format!("export interface Big {{\n{members}}}"));
    assert!(out.ends_with("; … }"), "{out}");
    assert!(out.chars().count() <= foker_context::render::L1_TYPE_MAX_CHARS + 4);
    // Ningún miembro queda partido: cada segmento antes de la marca es `fieldN: string`.
    let body = out
        .trim_start_matches("export interface Big { ")
        .trim_end_matches(" … }");
    for member in body.split(';').filter(|m| !m.trim().is_empty()) {
        assert!(member.trim().ends_with(": string"), "{member}");
    }
}

#[test]
fn license_header_rules() {
    let spdx = "// SPDX-License-Identifier: MIT\nexport const a = 1;\n";
    assert_eq!(strip_license_header(spdx), spdx, "una línea no compensa");
    let plain = "// Utilidades\n// de texto\n// varias\nexport const a = 1;\n";
    assert_eq!(
        strip_license_header(plain),
        plain,
        "sin licencia no se toca"
    );
    let shebang = "#!/usr/bin/env node\n// Copyright X\n// Licencia MIT\n// Ver LICENSE\nrun();\n";
    assert_eq!(
        strip_license_header(shebang),
        "#!/usr/bin/env node\n// foker: cabecera de licencia omitida (3 líneas)\nrun();\n"
    );
}
