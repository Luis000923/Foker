# ADR-014 · Distribución npm con binarios por plataforma y CI en GitHub Actions

- **Estado**: Aceptada (modifica V1 §15)
- **Fecha**: 2026-10-04

## Contexto
V1 listaba 5 targets, sin estrategia de glibc, smoke tests ni seguridad de publicación.

## Problema
Distribuir un addon nativo de forma fiable a Linux, macOS y Windows (x64 y ARM64) sin que el usuario compile.

## Decisión
- 6 targets en el MVP: linux x64/arm64 gnu (con `--use-napi-cross`, suelo glibc 2.17), darwin x64/arm64, win32 x64/arm64 msvc. musl en V0.2.
- Build en runners nativos donde existan; **smoke test de cada artefacto en su runner nativo** (`ubuntu-24.04-arm`, `macos-15-intel`, `windows-11-arm`…) antes de publicar.
- Publicación con npm **trusted publishing** (OIDC, procedencia automática), Actions fijadas por SHA, permisos mínimos por job.
- Node soportado: 22.14+, 24, 26.

## Alternativas
1. *Cross-compilar todo desde Linux con zig/xwin*: menos runners; macOS con SDK propietario y menos confianza sin smoke test nativo.
2. *Descarga de binario en `postinstall`*: bloqueado por defecto en pnpm 10+ y peor para supply chain. Descartada.

## Consecuencias
- (+) Instalación sin toolchain; artefactos verificados y con procedencia.
- (−) Pipeline de release más largo; minutos de runners ARM/macOS.
