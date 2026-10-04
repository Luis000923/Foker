# ADR-017 · Seguridad del proyecto generado alineada con OWASP ASVS 5.0 (sin afirmar cumplimiento)

- **Estado**: Aceptada (modifica ADR-005 original)
- **Fecha**: 2026-10-04

## Contexto
La investigación prometía "forzar algorítmicamente" ASVS nivel 2 y aplicaba AISVS al código generado. HECHO verificado: ASVS 5.0.0 es la versión estable (redefine niveles respecto a 4.0.x); AISVS 1.0 es estable y cubre sistemas de IA, incluida la orquestación agéntica.

## Problema
Muchos controles de ASVS L2 (autorización, lógica de negocio, sesiones) no son verificables automáticamente; afirmar cumplimiento sería falso.

## Decisión
- Proyecto generado: controles por defecto en la plantilla y checks/lint que cubren L1 automatizable + subconjunto de L2, con matriz de trazabilidad `docs/security/asvs-matrix.md` (estado por control: automatizado, por-skill, manual, no-aplica). Lenguaje explícito: "no constituye certificación".
- AISVS se usa como referencia para la seguridad **de Foker** (ADR-009), no de la app web.

## Alternativas
1. *Mantener "cumplimiento L2"*: engañoso.
2. *Sin referencia normativa*: pierde trazabilidad.

## Consecuencias
- (+) Afirmaciones verificables; trabajo de seguridad priorizado por evidencia.
- (−) Auth, rate limiting y SSRF quedan para V0.2.
