# Calibración FKR-037 · semilla 37

Split SHA-256(semilla, fixture, id), 70/30 redondeado por fixture. Dataset SHA-256: abbf551bffa0e9505393e2b444b754d48293263bcdc10d3aaa93f84614851214.

Calibración (21): a-10, a-12, a-15, a-11, a-17, a-05, a-20, a-09, a-19, a-08, a-16, a-06, a-02, a-14, mono-06, mono-02, mono-03, mono-04, mono-08, mono-09, mono-07.

Validación (9): a-01, a-13, a-07, a-03, a-18, a-04, mono-10, mono-05, mono-01.

Rejilla predefinida por diagnóstico: 144 configuraciones. Maximizar recall macro en calibración sujeto a mediana ≤ 8.000; desempate por precisión macro y después conservar el primer resultado (baseline incluido). La validación se consulta solo para baseline y configuración elegida, nunca para desempatar ni explorar alternativas. Parámetros no indicados mantienen defaults originales. No se modifican tareas, gold ni semillas.

| Conjunto | Configuración | Recall | Precisión | Mediana tokens |
|---|---|---:|---:|---:|
| Calibración | Antes | 0.7143 | 0.0331 | 7548 |
| Calibración | Elegida | 0.7143 | 0.0332 | 7532 |
| Validación | Antes | 0.6296 | 0.0303 | 7540 |
| Validación | Elegida | 0.6296 | 0.0303 | 7553 |

Elegida: 23; params: `{"bm25Top":20,"wLex":0.2,"rFix":1,"rModify":1,"rTest":0.8,"rRefactor":1.4,"rAdd":0.2,"rExplain":0.6,"coreFiles":15,"l2Count":5,"marginFraction":0.05}`. Decisión: Rechazar cambio de defaults.

| Nº | Parámetros | Recall calibración | Precisión calibración | Mediana tokens |
|---:|---|---:|---:|---:|
| 0 | {"bm25Top":20,"wLex":0.2,"rFix":0,"rModify":0,"rTest":0,"rRefactor":0,"rAdd":0,"rExplain":0,"coreFiles":0,"l2Count":0,"marginFraction":0} | 0.7143 | 0.0320 | 7925 |
| 1 | {"bm25Top":20,"wLex":0.2,"rFix":0,"rModify":0,"rTest":0,"rRefactor":0,"rAdd":0,"rExplain":0,"coreFiles":0,"l2Count":0,"marginFraction":0.05} | 0.7143 | 0.0323 | 7544 |
| 2 | {"bm25Top":20,"wLex":0.2,"rFix":0,"rModify":0,"rTest":0,"rRefactor":0,"rAdd":0,"rExplain":0,"coreFiles":0,"l2Count":5,"marginFraction":0} | 0.7143 | 0.0320 | 7925 |
| 3 | {"bm25Top":20,"wLex":0.2,"rFix":0,"rModify":0,"rTest":0,"rRefactor":0,"rAdd":0,"rExplain":0,"coreFiles":0,"l2Count":5,"marginFraction":0.05} | 0.7143 | 0.0323 | 7544 |
| 4 | {"bm25Top":20,"wLex":0.2,"rFix":0,"rModify":0,"rTest":0,"rRefactor":0,"rAdd":0,"rExplain":0,"coreFiles":15,"l2Count":0,"marginFraction":0} | 0.7143 | 0.0327 | 7942 |
| 5 | {"bm25Top":20,"wLex":0.2,"rFix":0,"rModify":0,"rTest":0,"rRefactor":0,"rAdd":0,"rExplain":0,"coreFiles":15,"l2Count":0,"marginFraction":0.05} | 0.7143 | 0.0331 | 7556 |
| 6 | {"bm25Top":20,"wLex":0.2,"rFix":0,"rModify":0,"rTest":0,"rRefactor":0,"rAdd":0,"rExplain":0,"coreFiles":15,"l2Count":5,"marginFraction":0} | 0.7143 | 0.0327 | 7932 |
| 7 | {"bm25Top":20,"wLex":0.2,"rFix":0,"rModify":0,"rTest":0,"rRefactor":0,"rAdd":0,"rExplain":0,"coreFiles":15,"l2Count":5,"marginFraction":0.05} | 0.7143 | 0.0331 | 7542 |
| 8 | {"bm25Top":20,"wLex":0.2,"rFix":0.5,"rModify":0.5,"rTest":0.4,"rRefactor":0.7,"rAdd":0.1,"rExplain":0.3,"coreFiles":0,"l2Count":0,"marginFraction":0} | 0.7143 | 0.0320 | 7925 |
| 9 | {"bm25Top":20,"wLex":0.2,"rFix":0.5,"rModify":0.5,"rTest":0.4,"rRefactor":0.7,"rAdd":0.1,"rExplain":0.3,"coreFiles":0,"l2Count":0,"marginFraction":0.05} | 0.7143 | 0.0323 | 7520 |
| 10 | {"bm25Top":20,"wLex":0.2,"rFix":0.5,"rModify":0.5,"rTest":0.4,"rRefactor":0.7,"rAdd":0.1,"rExplain":0.3,"coreFiles":0,"l2Count":5,"marginFraction":0} | 0.7143 | 0.0320 | 7930 |
| 11 | {"bm25Top":20,"wLex":0.2,"rFix":0.5,"rModify":0.5,"rTest":0.4,"rRefactor":0.7,"rAdd":0.1,"rExplain":0.3,"coreFiles":0,"l2Count":5,"marginFraction":0.05} | 0.7143 | 0.0324 | 7524 |
| 12 | {"bm25Top":20,"wLex":0.2,"rFix":0.5,"rModify":0.5,"rTest":0.4,"rRefactor":0.7,"rAdd":0.1,"rExplain":0.3,"coreFiles":15,"l2Count":0,"marginFraction":0} | 0.7143 | 0.0327 | 7946 |
| 13 | {"bm25Top":20,"wLex":0.2,"rFix":0.5,"rModify":0.5,"rTest":0.4,"rRefactor":0.7,"rAdd":0.1,"rExplain":0.3,"coreFiles":15,"l2Count":0,"marginFraction":0.05} | 0.7143 | 0.0331 | 7539 |
| 14 | {"bm25Top":20,"wLex":0.2,"rFix":0.5,"rModify":0.5,"rTest":0.4,"rRefactor":0.7,"rAdd":0.1,"rExplain":0.3,"coreFiles":15,"l2Count":5,"marginFraction":0} | 0.7143 | 0.0327 | 7926 |
| 15 | {"bm25Top":20,"wLex":0.2,"rFix":0.5,"rModify":0.5,"rTest":0.4,"rRefactor":0.7,"rAdd":0.1,"rExplain":0.3,"coreFiles":15,"l2Count":5,"marginFraction":0.05} | 0.7143 | 0.0331 | 7548 |
| 16 | {"bm25Top":20,"wLex":0.2,"rFix":1,"rModify":1,"rTest":0.8,"rRefactor":1.4,"rAdd":0.2,"rExplain":0.6,"coreFiles":0,"l2Count":0,"marginFraction":0} | 0.7143 | 0.0319 | 7928 |
| 17 | {"bm25Top":20,"wLex":0.2,"rFix":1,"rModify":1,"rTest":0.8,"rRefactor":1.4,"rAdd":0.2,"rExplain":0.6,"coreFiles":0,"l2Count":0,"marginFraction":0.05} | 0.7143 | 0.0323 | 7519 |
| 18 | {"bm25Top":20,"wLex":0.2,"rFix":1,"rModify":1,"rTest":0.8,"rRefactor":1.4,"rAdd":0.2,"rExplain":0.6,"coreFiles":0,"l2Count":5,"marginFraction":0} | 0.7143 | 0.0320 | 7920 |
| 19 | {"bm25Top":20,"wLex":0.2,"rFix":1,"rModify":1,"rTest":0.8,"rRefactor":1.4,"rAdd":0.2,"rExplain":0.6,"coreFiles":0,"l2Count":5,"marginFraction":0.05} | 0.7143 | 0.0323 | 7527 |
| 20 | {"bm25Top":20,"wLex":0.2,"rFix":1,"rModify":1,"rTest":0.8,"rRefactor":1.4,"rAdd":0.2,"rExplain":0.6,"coreFiles":15,"l2Count":0,"marginFraction":0} | 0.7143 | 0.0326 | 7935 |
| 21 | {"bm25Top":20,"wLex":0.2,"rFix":1,"rModify":1,"rTest":0.8,"rRefactor":1.4,"rAdd":0.2,"rExplain":0.6,"coreFiles":15,"l2Count":0,"marginFraction":0.05} | 0.7143 | 0.0331 | 7540 |
| 22 | {"bm25Top":20,"wLex":0.2,"rFix":1,"rModify":1,"rTest":0.8,"rRefactor":1.4,"rAdd":0.2,"rExplain":0.6,"coreFiles":15,"l2Count":5,"marginFraction":0} | 0.7143 | 0.0327 | 7948 |
| 23 | {"bm25Top":20,"wLex":0.2,"rFix":1,"rModify":1,"rTest":0.8,"rRefactor":1.4,"rAdd":0.2,"rExplain":0.6,"coreFiles":15,"l2Count":5,"marginFraction":0.05} | 0.7143 | 0.0332 | 7532 |
| 24 | {"bm25Top":20,"wLex":0.6,"rFix":0,"rModify":0,"rTest":0,"rRefactor":0,"rAdd":0,"rExplain":0,"coreFiles":0,"l2Count":0,"marginFraction":0} | 0.7143 | 0.0320 | 7925 |
| 25 | {"bm25Top":20,"wLex":0.6,"rFix":0,"rModify":0,"rTest":0,"rRefactor":0,"rAdd":0,"rExplain":0,"coreFiles":0,"l2Count":0,"marginFraction":0.05} | 0.7143 | 0.0323 | 7544 |
| 26 | {"bm25Top":20,"wLex":0.6,"rFix":0,"rModify":0,"rTest":0,"rRefactor":0,"rAdd":0,"rExplain":0,"coreFiles":0,"l2Count":5,"marginFraction":0} | 0.7143 | 0.0320 | 7925 |
| 27 | {"bm25Top":20,"wLex":0.6,"rFix":0,"rModify":0,"rTest":0,"rRefactor":0,"rAdd":0,"rExplain":0,"coreFiles":0,"l2Count":5,"marginFraction":0.05} | 0.7143 | 0.0323 | 7544 |
| 28 | {"bm25Top":20,"wLex":0.6,"rFix":0,"rModify":0,"rTest":0,"rRefactor":0,"rAdd":0,"rExplain":0,"coreFiles":15,"l2Count":0,"marginFraction":0} | 0.7143 | 0.0327 | 7942 |
| 29 | {"bm25Top":20,"wLex":0.6,"rFix":0,"rModify":0,"rTest":0,"rRefactor":0,"rAdd":0,"rExplain":0,"coreFiles":15,"l2Count":0,"marginFraction":0.05} | 0.7143 | 0.0331 | 7556 |
| 30 | {"bm25Top":20,"wLex":0.6,"rFix":0,"rModify":0,"rTest":0,"rRefactor":0,"rAdd":0,"rExplain":0,"coreFiles":15,"l2Count":5,"marginFraction":0} | 0.7143 | 0.0327 | 7932 |
| 31 | {"bm25Top":20,"wLex":0.6,"rFix":0,"rModify":0,"rTest":0,"rRefactor":0,"rAdd":0,"rExplain":0,"coreFiles":15,"l2Count":5,"marginFraction":0.05} | 0.7143 | 0.0331 | 7542 |
| 32 | {"bm25Top":20,"wLex":0.6,"rFix":0.5,"rModify":0.5,"rTest":0.4,"rRefactor":0.7,"rAdd":0.1,"rExplain":0.3,"coreFiles":0,"l2Count":0,"marginFraction":0} | 0.7143 | 0.0320 | 7925 |
| 33 | {"bm25Top":20,"wLex":0.6,"rFix":0.5,"rModify":0.5,"rTest":0.4,"rRefactor":0.7,"rAdd":0.1,"rExplain":0.3,"coreFiles":0,"l2Count":0,"marginFraction":0.05} | 0.7143 | 0.0323 | 7520 |
| 34 | {"bm25Top":20,"wLex":0.6,"rFix":0.5,"rModify":0.5,"rTest":0.4,"rRefactor":0.7,"rAdd":0.1,"rExplain":0.3,"coreFiles":0,"l2Count":5,"marginFraction":0} | 0.7143 | 0.0320 | 7930 |
| 35 | {"bm25Top":20,"wLex":0.6,"rFix":0.5,"rModify":0.5,"rTest":0.4,"rRefactor":0.7,"rAdd":0.1,"rExplain":0.3,"coreFiles":0,"l2Count":5,"marginFraction":0.05} | 0.7143 | 0.0324 | 7524 |
| 36 | {"bm25Top":20,"wLex":0.6,"rFix":0.5,"rModify":0.5,"rTest":0.4,"rRefactor":0.7,"rAdd":0.1,"rExplain":0.3,"coreFiles":15,"l2Count":0,"marginFraction":0} | 0.7143 | 0.0327 | 7946 |
| 37 | {"bm25Top":20,"wLex":0.6,"rFix":0.5,"rModify":0.5,"rTest":0.4,"rRefactor":0.7,"rAdd":0.1,"rExplain":0.3,"coreFiles":15,"l2Count":0,"marginFraction":0.05} | 0.7143 | 0.0331 | 7539 |
| 38 | {"bm25Top":20,"wLex":0.6,"rFix":0.5,"rModify":0.5,"rTest":0.4,"rRefactor":0.7,"rAdd":0.1,"rExplain":0.3,"coreFiles":15,"l2Count":5,"marginFraction":0} | 0.7143 | 0.0327 | 7926 |
| 39 | {"bm25Top":20,"wLex":0.6,"rFix":0.5,"rModify":0.5,"rTest":0.4,"rRefactor":0.7,"rAdd":0.1,"rExplain":0.3,"coreFiles":15,"l2Count":5,"marginFraction":0.05} | 0.7143 | 0.0331 | 7548 |
| 40 | {"bm25Top":20,"wLex":0.6,"rFix":1,"rModify":1,"rTest":0.8,"rRefactor":1.4,"rAdd":0.2,"rExplain":0.6,"coreFiles":0,"l2Count":0,"marginFraction":0} | 0.7143 | 0.0319 | 7928 |
| 41 | {"bm25Top":20,"wLex":0.6,"rFix":1,"rModify":1,"rTest":0.8,"rRefactor":1.4,"rAdd":0.2,"rExplain":0.6,"coreFiles":0,"l2Count":0,"marginFraction":0.05} | 0.7143 | 0.0323 | 7519 |
| 42 | {"bm25Top":20,"wLex":0.6,"rFix":1,"rModify":1,"rTest":0.8,"rRefactor":1.4,"rAdd":0.2,"rExplain":0.6,"coreFiles":0,"l2Count":5,"marginFraction":0} | 0.7143 | 0.0320 | 7920 |
| 43 | {"bm25Top":20,"wLex":0.6,"rFix":1,"rModify":1,"rTest":0.8,"rRefactor":1.4,"rAdd":0.2,"rExplain":0.6,"coreFiles":0,"l2Count":5,"marginFraction":0.05} | 0.7143 | 0.0323 | 7527 |
| 44 | {"bm25Top":20,"wLex":0.6,"rFix":1,"rModify":1,"rTest":0.8,"rRefactor":1.4,"rAdd":0.2,"rExplain":0.6,"coreFiles":15,"l2Count":0,"marginFraction":0} | 0.7143 | 0.0326 | 7935 |
| 45 | {"bm25Top":20,"wLex":0.6,"rFix":1,"rModify":1,"rTest":0.8,"rRefactor":1.4,"rAdd":0.2,"rExplain":0.6,"coreFiles":15,"l2Count":0,"marginFraction":0.05} | 0.7143 | 0.0331 | 7540 |
| 46 | {"bm25Top":20,"wLex":0.6,"rFix":1,"rModify":1,"rTest":0.8,"rRefactor":1.4,"rAdd":0.2,"rExplain":0.6,"coreFiles":15,"l2Count":5,"marginFraction":0} | 0.7143 | 0.0327 | 7948 |
| 47 | {"bm25Top":20,"wLex":0.6,"rFix":1,"rModify":1,"rTest":0.8,"rRefactor":1.4,"rAdd":0.2,"rExplain":0.6,"coreFiles":15,"l2Count":5,"marginFraction":0.05} | 0.7143 | 0.0332 | 7532 |
| 48 | {"bm25Top":20,"wLex":1.2,"rFix":0,"rModify":0,"rTest":0,"rRefactor":0,"rAdd":0,"rExplain":0,"coreFiles":0,"l2Count":0,"marginFraction":0} | 0.7143 | 0.0320 | 7925 |
| 49 | {"bm25Top":20,"wLex":1.2,"rFix":0,"rModify":0,"rTest":0,"rRefactor":0,"rAdd":0,"rExplain":0,"coreFiles":0,"l2Count":0,"marginFraction":0.05} | 0.7143 | 0.0323 | 7544 |
| 50 | {"bm25Top":20,"wLex":1.2,"rFix":0,"rModify":0,"rTest":0,"rRefactor":0,"rAdd":0,"rExplain":0,"coreFiles":0,"l2Count":5,"marginFraction":0} | 0.7143 | 0.0320 | 7925 |
| 51 | {"bm25Top":20,"wLex":1.2,"rFix":0,"rModify":0,"rTest":0,"rRefactor":0,"rAdd":0,"rExplain":0,"coreFiles":0,"l2Count":5,"marginFraction":0.05} | 0.7143 | 0.0323 | 7547 |
| 52 | {"bm25Top":20,"wLex":1.2,"rFix":0,"rModify":0,"rTest":0,"rRefactor":0,"rAdd":0,"rExplain":0,"coreFiles":15,"l2Count":0,"marginFraction":0} | 0.7143 | 0.0327 | 7942 |
| 53 | {"bm25Top":20,"wLex":1.2,"rFix":0,"rModify":0,"rTest":0,"rRefactor":0,"rAdd":0,"rExplain":0,"coreFiles":15,"l2Count":0,"marginFraction":0.05} | 0.7143 | 0.0331 | 7556 |
| 54 | {"bm25Top":20,"wLex":1.2,"rFix":0,"rModify":0,"rTest":0,"rRefactor":0,"rAdd":0,"rExplain":0,"coreFiles":15,"l2Count":5,"marginFraction":0} | 0.7143 | 0.0327 | 7932 |
| 55 | {"bm25Top":20,"wLex":1.2,"rFix":0,"rModify":0,"rTest":0,"rRefactor":0,"rAdd":0,"rExplain":0,"coreFiles":15,"l2Count":5,"marginFraction":0.05} | 0.7143 | 0.0331 | 7531 |
| 56 | {"bm25Top":20,"wLex":1.2,"rFix":0.5,"rModify":0.5,"rTest":0.4,"rRefactor":0.7,"rAdd":0.1,"rExplain":0.3,"coreFiles":0,"l2Count":0,"marginFraction":0} | 0.7143 | 0.0320 | 7925 |
| 57 | {"bm25Top":20,"wLex":1.2,"rFix":0.5,"rModify":0.5,"rTest":0.4,"rRefactor":0.7,"rAdd":0.1,"rExplain":0.3,"coreFiles":0,"l2Count":0,"marginFraction":0.05} | 0.7143 | 0.0323 | 7520 |
| 58 | {"bm25Top":20,"wLex":1.2,"rFix":0.5,"rModify":0.5,"rTest":0.4,"rRefactor":0.7,"rAdd":0.1,"rExplain":0.3,"coreFiles":0,"l2Count":5,"marginFraction":0} | 0.7143 | 0.0320 | 7930 |
| 59 | {"bm25Top":20,"wLex":1.2,"rFix":0.5,"rModify":0.5,"rTest":0.4,"rRefactor":0.7,"rAdd":0.1,"rExplain":0.3,"coreFiles":0,"l2Count":5,"marginFraction":0.05} | 0.7143 | 0.0324 | 7524 |
| 60 | {"bm25Top":20,"wLex":1.2,"rFix":0.5,"rModify":0.5,"rTest":0.4,"rRefactor":0.7,"rAdd":0.1,"rExplain":0.3,"coreFiles":15,"l2Count":0,"marginFraction":0} | 0.7143 | 0.0327 | 7946 |
| 61 | {"bm25Top":20,"wLex":1.2,"rFix":0.5,"rModify":0.5,"rTest":0.4,"rRefactor":0.7,"rAdd":0.1,"rExplain":0.3,"coreFiles":15,"l2Count":0,"marginFraction":0.05} | 0.7143 | 0.0331 | 7539 |
| 62 | {"bm25Top":20,"wLex":1.2,"rFix":0.5,"rModify":0.5,"rTest":0.4,"rRefactor":0.7,"rAdd":0.1,"rExplain":0.3,"coreFiles":15,"l2Count":5,"marginFraction":0} | 0.7143 | 0.0327 | 7926 |
| 63 | {"bm25Top":20,"wLex":1.2,"rFix":0.5,"rModify":0.5,"rTest":0.4,"rRefactor":0.7,"rAdd":0.1,"rExplain":0.3,"coreFiles":15,"l2Count":5,"marginFraction":0.05} | 0.7143 | 0.0331 | 7548 |
| 64 | {"bm25Top":20,"wLex":1.2,"rFix":1,"rModify":1,"rTest":0.8,"rRefactor":1.4,"rAdd":0.2,"rExplain":0.6,"coreFiles":0,"l2Count":0,"marginFraction":0} | 0.7143 | 0.0319 | 7928 |
| 65 | {"bm25Top":20,"wLex":1.2,"rFix":1,"rModify":1,"rTest":0.8,"rRefactor":1.4,"rAdd":0.2,"rExplain":0.6,"coreFiles":0,"l2Count":0,"marginFraction":0.05} | 0.7143 | 0.0323 | 7519 |
| 66 | {"bm25Top":20,"wLex":1.2,"rFix":1,"rModify":1,"rTest":0.8,"rRefactor":1.4,"rAdd":0.2,"rExplain":0.6,"coreFiles":0,"l2Count":5,"marginFraction":0} | 0.7143 | 0.0320 | 7920 |
| 67 | {"bm25Top":20,"wLex":1.2,"rFix":1,"rModify":1,"rTest":0.8,"rRefactor":1.4,"rAdd":0.2,"rExplain":0.6,"coreFiles":0,"l2Count":5,"marginFraction":0.05} | 0.7143 | 0.0323 | 7527 |
| 68 | {"bm25Top":20,"wLex":1.2,"rFix":1,"rModify":1,"rTest":0.8,"rRefactor":1.4,"rAdd":0.2,"rExplain":0.6,"coreFiles":15,"l2Count":0,"marginFraction":0} | 0.7143 | 0.0326 | 7935 |
| 69 | {"bm25Top":20,"wLex":1.2,"rFix":1,"rModify":1,"rTest":0.8,"rRefactor":1.4,"rAdd":0.2,"rExplain":0.6,"coreFiles":15,"l2Count":0,"marginFraction":0.05} | 0.7143 | 0.0331 | 7540 |
| 70 | {"bm25Top":20,"wLex":1.2,"rFix":1,"rModify":1,"rTest":0.8,"rRefactor":1.4,"rAdd":0.2,"rExplain":0.6,"coreFiles":15,"l2Count":5,"marginFraction":0} | 0.7143 | 0.0327 | 7948 |
| 71 | {"bm25Top":20,"wLex":1.2,"rFix":1,"rModify":1,"rTest":0.8,"rRefactor":1.4,"rAdd":0.2,"rExplain":0.6,"coreFiles":15,"l2Count":5,"marginFraction":0.05} | 0.7143 | 0.0332 | 7532 |
| 72 | {"bm25Top":80,"wLex":0.2,"rFix":0,"rModify":0,"rTest":0,"rRefactor":0,"rAdd":0,"rExplain":0,"coreFiles":0,"l2Count":0,"marginFraction":0} | 0.7143 | 0.0320 | 7925 |
| 73 | {"bm25Top":80,"wLex":0.2,"rFix":0,"rModify":0,"rTest":0,"rRefactor":0,"rAdd":0,"rExplain":0,"coreFiles":0,"l2Count":0,"marginFraction":0.05} | 0.7143 | 0.0323 | 7544 |
| 74 | {"bm25Top":80,"wLex":0.2,"rFix":0,"rModify":0,"rTest":0,"rRefactor":0,"rAdd":0,"rExplain":0,"coreFiles":0,"l2Count":5,"marginFraction":0} | 0.7143 | 0.0320 | 7925 |
| 75 | {"bm25Top":80,"wLex":0.2,"rFix":0,"rModify":0,"rTest":0,"rRefactor":0,"rAdd":0,"rExplain":0,"coreFiles":0,"l2Count":5,"marginFraction":0.05} | 0.7143 | 0.0323 | 7544 |
| 76 | {"bm25Top":80,"wLex":0.2,"rFix":0,"rModify":0,"rTest":0,"rRefactor":0,"rAdd":0,"rExplain":0,"coreFiles":15,"l2Count":0,"marginFraction":0} | 0.7143 | 0.0327 | 7942 |
| 77 | {"bm25Top":80,"wLex":0.2,"rFix":0,"rModify":0,"rTest":0,"rRefactor":0,"rAdd":0,"rExplain":0,"coreFiles":15,"l2Count":0,"marginFraction":0.05} | 0.7143 | 0.0331 | 7556 |
| 78 | {"bm25Top":80,"wLex":0.2,"rFix":0,"rModify":0,"rTest":0,"rRefactor":0,"rAdd":0,"rExplain":0,"coreFiles":15,"l2Count":5,"marginFraction":0} | 0.7143 | 0.0327 | 7932 |
| 79 | {"bm25Top":80,"wLex":0.2,"rFix":0,"rModify":0,"rTest":0,"rRefactor":0,"rAdd":0,"rExplain":0,"coreFiles":15,"l2Count":5,"marginFraction":0.05} | 0.7143 | 0.0331 | 7542 |
| 80 | {"bm25Top":80,"wLex":0.2,"rFix":0.5,"rModify":0.5,"rTest":0.4,"rRefactor":0.7,"rAdd":0.1,"rExplain":0.3,"coreFiles":0,"l2Count":0,"marginFraction":0} | 0.7143 | 0.0320 | 7925 |
| 81 | {"bm25Top":80,"wLex":0.2,"rFix":0.5,"rModify":0.5,"rTest":0.4,"rRefactor":0.7,"rAdd":0.1,"rExplain":0.3,"coreFiles":0,"l2Count":0,"marginFraction":0.05} | 0.7143 | 0.0323 | 7520 |
| 82 | {"bm25Top":80,"wLex":0.2,"rFix":0.5,"rModify":0.5,"rTest":0.4,"rRefactor":0.7,"rAdd":0.1,"rExplain":0.3,"coreFiles":0,"l2Count":5,"marginFraction":0} | 0.7143 | 0.0320 | 7930 |
| 83 | {"bm25Top":80,"wLex":0.2,"rFix":0.5,"rModify":0.5,"rTest":0.4,"rRefactor":0.7,"rAdd":0.1,"rExplain":0.3,"coreFiles":0,"l2Count":5,"marginFraction":0.05} | 0.7143 | 0.0324 | 7524 |
| 84 | {"bm25Top":80,"wLex":0.2,"rFix":0.5,"rModify":0.5,"rTest":0.4,"rRefactor":0.7,"rAdd":0.1,"rExplain":0.3,"coreFiles":15,"l2Count":0,"marginFraction":0} | 0.7143 | 0.0327 | 7946 |
| 85 | {"bm25Top":80,"wLex":0.2,"rFix":0.5,"rModify":0.5,"rTest":0.4,"rRefactor":0.7,"rAdd":0.1,"rExplain":0.3,"coreFiles":15,"l2Count":0,"marginFraction":0.05} | 0.7143 | 0.0331 | 7539 |
| 86 | {"bm25Top":80,"wLex":0.2,"rFix":0.5,"rModify":0.5,"rTest":0.4,"rRefactor":0.7,"rAdd":0.1,"rExplain":0.3,"coreFiles":15,"l2Count":5,"marginFraction":0} | 0.7143 | 0.0327 | 7926 |
| 87 | {"bm25Top":80,"wLex":0.2,"rFix":0.5,"rModify":0.5,"rTest":0.4,"rRefactor":0.7,"rAdd":0.1,"rExplain":0.3,"coreFiles":15,"l2Count":5,"marginFraction":0.05} | 0.7143 | 0.0331 | 7548 |
| 88 | {"bm25Top":80,"wLex":0.2,"rFix":1,"rModify":1,"rTest":0.8,"rRefactor":1.4,"rAdd":0.2,"rExplain":0.6,"coreFiles":0,"l2Count":0,"marginFraction":0} | 0.7143 | 0.0319 | 7928 |
| 89 | {"bm25Top":80,"wLex":0.2,"rFix":1,"rModify":1,"rTest":0.8,"rRefactor":1.4,"rAdd":0.2,"rExplain":0.6,"coreFiles":0,"l2Count":0,"marginFraction":0.05} | 0.7143 | 0.0323 | 7519 |
| 90 | {"bm25Top":80,"wLex":0.2,"rFix":1,"rModify":1,"rTest":0.8,"rRefactor":1.4,"rAdd":0.2,"rExplain":0.6,"coreFiles":0,"l2Count":5,"marginFraction":0} | 0.7143 | 0.0320 | 7920 |
| 91 | {"bm25Top":80,"wLex":0.2,"rFix":1,"rModify":1,"rTest":0.8,"rRefactor":1.4,"rAdd":0.2,"rExplain":0.6,"coreFiles":0,"l2Count":5,"marginFraction":0.05} | 0.7143 | 0.0323 | 7527 |
| 92 | {"bm25Top":80,"wLex":0.2,"rFix":1,"rModify":1,"rTest":0.8,"rRefactor":1.4,"rAdd":0.2,"rExplain":0.6,"coreFiles":15,"l2Count":0,"marginFraction":0} | 0.7143 | 0.0326 | 7935 |
| 93 | {"bm25Top":80,"wLex":0.2,"rFix":1,"rModify":1,"rTest":0.8,"rRefactor":1.4,"rAdd":0.2,"rExplain":0.6,"coreFiles":15,"l2Count":0,"marginFraction":0.05} | 0.7143 | 0.0331 | 7540 |
| 94 | {"bm25Top":80,"wLex":0.2,"rFix":1,"rModify":1,"rTest":0.8,"rRefactor":1.4,"rAdd":0.2,"rExplain":0.6,"coreFiles":15,"l2Count":5,"marginFraction":0} | 0.7143 | 0.0327 | 7948 |
| 95 | {"bm25Top":80,"wLex":0.2,"rFix":1,"rModify":1,"rTest":0.8,"rRefactor":1.4,"rAdd":0.2,"rExplain":0.6,"coreFiles":15,"l2Count":5,"marginFraction":0.05} | 0.7143 | 0.0332 | 7532 |
| 96 | {"bm25Top":80,"wLex":0.6,"rFix":0,"rModify":0,"rTest":0,"rRefactor":0,"rAdd":0,"rExplain":0,"coreFiles":0,"l2Count":0,"marginFraction":0} | 0.7143 | 0.0320 | 7925 |
| 97 | {"bm25Top":80,"wLex":0.6,"rFix":0,"rModify":0,"rTest":0,"rRefactor":0,"rAdd":0,"rExplain":0,"coreFiles":0,"l2Count":0,"marginFraction":0.05} | 0.7143 | 0.0323 | 7544 |
| 98 | {"bm25Top":80,"wLex":0.6,"rFix":0,"rModify":0,"rTest":0,"rRefactor":0,"rAdd":0,"rExplain":0,"coreFiles":0,"l2Count":5,"marginFraction":0} | 0.7143 | 0.0320 | 7925 |
| 99 | {"bm25Top":80,"wLex":0.6,"rFix":0,"rModify":0,"rTest":0,"rRefactor":0,"rAdd":0,"rExplain":0,"coreFiles":0,"l2Count":5,"marginFraction":0.05} | 0.7143 | 0.0323 | 7544 |
| 100 | {"bm25Top":80,"wLex":0.6,"rFix":0,"rModify":0,"rTest":0,"rRefactor":0,"rAdd":0,"rExplain":0,"coreFiles":15,"l2Count":0,"marginFraction":0} | 0.7143 | 0.0327 | 7942 |
| 101 | {"bm25Top":80,"wLex":0.6,"rFix":0,"rModify":0,"rTest":0,"rRefactor":0,"rAdd":0,"rExplain":0,"coreFiles":15,"l2Count":0,"marginFraction":0.05} | 0.7143 | 0.0331 | 7556 |
| 102 | {"bm25Top":80,"wLex":0.6,"rFix":0,"rModify":0,"rTest":0,"rRefactor":0,"rAdd":0,"rExplain":0,"coreFiles":15,"l2Count":5,"marginFraction":0} | 0.7143 | 0.0327 | 7932 |
| 103 | {"bm25Top":80,"wLex":0.6,"rFix":0,"rModify":0,"rTest":0,"rRefactor":0,"rAdd":0,"rExplain":0,"coreFiles":15,"l2Count":5,"marginFraction":0.05} | 0.7143 | 0.0331 | 7542 |
| 104 | {"bm25Top":80,"wLex":0.6,"rFix":0.5,"rModify":0.5,"rTest":0.4,"rRefactor":0.7,"rAdd":0.1,"rExplain":0.3,"coreFiles":0,"l2Count":0,"marginFraction":0} | 0.7143 | 0.0320 | 7925 |
| 105 | {"bm25Top":80,"wLex":0.6,"rFix":0.5,"rModify":0.5,"rTest":0.4,"rRefactor":0.7,"rAdd":0.1,"rExplain":0.3,"coreFiles":0,"l2Count":0,"marginFraction":0.05} | 0.7143 | 0.0323 | 7520 |
| 106 | {"bm25Top":80,"wLex":0.6,"rFix":0.5,"rModify":0.5,"rTest":0.4,"rRefactor":0.7,"rAdd":0.1,"rExplain":0.3,"coreFiles":0,"l2Count":5,"marginFraction":0} | 0.7143 | 0.0320 | 7930 |
| 107 | {"bm25Top":80,"wLex":0.6,"rFix":0.5,"rModify":0.5,"rTest":0.4,"rRefactor":0.7,"rAdd":0.1,"rExplain":0.3,"coreFiles":0,"l2Count":5,"marginFraction":0.05} | 0.7143 | 0.0324 | 7524 |
| 108 | {"bm25Top":80,"wLex":0.6,"rFix":0.5,"rModify":0.5,"rTest":0.4,"rRefactor":0.7,"rAdd":0.1,"rExplain":0.3,"coreFiles":15,"l2Count":0,"marginFraction":0} | 0.7143 | 0.0327 | 7946 |
| 109 | {"bm25Top":80,"wLex":0.6,"rFix":0.5,"rModify":0.5,"rTest":0.4,"rRefactor":0.7,"rAdd":0.1,"rExplain":0.3,"coreFiles":15,"l2Count":0,"marginFraction":0.05} | 0.7143 | 0.0331 | 7539 |
| 110 | {"bm25Top":80,"wLex":0.6,"rFix":0.5,"rModify":0.5,"rTest":0.4,"rRefactor":0.7,"rAdd":0.1,"rExplain":0.3,"coreFiles":15,"l2Count":5,"marginFraction":0} | 0.7143 | 0.0327 | 7926 |
| 111 | {"bm25Top":80,"wLex":0.6,"rFix":0.5,"rModify":0.5,"rTest":0.4,"rRefactor":0.7,"rAdd":0.1,"rExplain":0.3,"coreFiles":15,"l2Count":5,"marginFraction":0.05} | 0.7143 | 0.0331 | 7548 |
| 112 | {"bm25Top":80,"wLex":0.6,"rFix":1,"rModify":1,"rTest":0.8,"rRefactor":1.4,"rAdd":0.2,"rExplain":0.6,"coreFiles":0,"l2Count":0,"marginFraction":0} | 0.7143 | 0.0319 | 7928 |
| 113 | {"bm25Top":80,"wLex":0.6,"rFix":1,"rModify":1,"rTest":0.8,"rRefactor":1.4,"rAdd":0.2,"rExplain":0.6,"coreFiles":0,"l2Count":0,"marginFraction":0.05} | 0.7143 | 0.0323 | 7519 |
| 114 | {"bm25Top":80,"wLex":0.6,"rFix":1,"rModify":1,"rTest":0.8,"rRefactor":1.4,"rAdd":0.2,"rExplain":0.6,"coreFiles":0,"l2Count":5,"marginFraction":0} | 0.7143 | 0.0320 | 7920 |
| 115 | {"bm25Top":80,"wLex":0.6,"rFix":1,"rModify":1,"rTest":0.8,"rRefactor":1.4,"rAdd":0.2,"rExplain":0.6,"coreFiles":0,"l2Count":5,"marginFraction":0.05} | 0.7143 | 0.0323 | 7527 |
| 116 | {"bm25Top":80,"wLex":0.6,"rFix":1,"rModify":1,"rTest":0.8,"rRefactor":1.4,"rAdd":0.2,"rExplain":0.6,"coreFiles":15,"l2Count":0,"marginFraction":0} | 0.7143 | 0.0326 | 7935 |
| 117 | {"bm25Top":80,"wLex":0.6,"rFix":1,"rModify":1,"rTest":0.8,"rRefactor":1.4,"rAdd":0.2,"rExplain":0.6,"coreFiles":15,"l2Count":0,"marginFraction":0.05} | 0.7143 | 0.0331 | 7540 |
| 118 | {"bm25Top":80,"wLex":0.6,"rFix":1,"rModify":1,"rTest":0.8,"rRefactor":1.4,"rAdd":0.2,"rExplain":0.6,"coreFiles":15,"l2Count":5,"marginFraction":0} | 0.7143 | 0.0327 | 7948 |
| 119 | {"bm25Top":80,"wLex":0.6,"rFix":1,"rModify":1,"rTest":0.8,"rRefactor":1.4,"rAdd":0.2,"rExplain":0.6,"coreFiles":15,"l2Count":5,"marginFraction":0.05} | 0.7143 | 0.0332 | 7532 |
| 120 | {"bm25Top":80,"wLex":1.2,"rFix":0,"rModify":0,"rTest":0,"rRefactor":0,"rAdd":0,"rExplain":0,"coreFiles":0,"l2Count":0,"marginFraction":0} | 0.7143 | 0.0320 | 7925 |
| 121 | {"bm25Top":80,"wLex":1.2,"rFix":0,"rModify":0,"rTest":0,"rRefactor":0,"rAdd":0,"rExplain":0,"coreFiles":0,"l2Count":0,"marginFraction":0.05} | 0.7143 | 0.0323 | 7544 |
| 122 | {"bm25Top":80,"wLex":1.2,"rFix":0,"rModify":0,"rTest":0,"rRefactor":0,"rAdd":0,"rExplain":0,"coreFiles":0,"l2Count":5,"marginFraction":0} | 0.7143 | 0.0320 | 7925 |
| 123 | {"bm25Top":80,"wLex":1.2,"rFix":0,"rModify":0,"rTest":0,"rRefactor":0,"rAdd":0,"rExplain":0,"coreFiles":0,"l2Count":5,"marginFraction":0.05} | 0.7143 | 0.0323 | 7547 |
| 124 | {"bm25Top":80,"wLex":1.2,"rFix":0,"rModify":0,"rTest":0,"rRefactor":0,"rAdd":0,"rExplain":0,"coreFiles":15,"l2Count":0,"marginFraction":0} | 0.7143 | 0.0327 | 7942 |
| 125 | {"bm25Top":80,"wLex":1.2,"rFix":0,"rModify":0,"rTest":0,"rRefactor":0,"rAdd":0,"rExplain":0,"coreFiles":15,"l2Count":0,"marginFraction":0.05} | 0.7143 | 0.0331 | 7556 |
| 126 | {"bm25Top":80,"wLex":1.2,"rFix":0,"rModify":0,"rTest":0,"rRefactor":0,"rAdd":0,"rExplain":0,"coreFiles":15,"l2Count":5,"marginFraction":0} | 0.7143 | 0.0327 | 7932 |
| 127 | {"bm25Top":80,"wLex":1.2,"rFix":0,"rModify":0,"rTest":0,"rRefactor":0,"rAdd":0,"rExplain":0,"coreFiles":15,"l2Count":5,"marginFraction":0.05} | 0.7143 | 0.0331 | 7531 |
| 128 | {"bm25Top":80,"wLex":1.2,"rFix":0.5,"rModify":0.5,"rTest":0.4,"rRefactor":0.7,"rAdd":0.1,"rExplain":0.3,"coreFiles":0,"l2Count":0,"marginFraction":0} | 0.7143 | 0.0320 | 7925 |
| 129 | {"bm25Top":80,"wLex":1.2,"rFix":0.5,"rModify":0.5,"rTest":0.4,"rRefactor":0.7,"rAdd":0.1,"rExplain":0.3,"coreFiles":0,"l2Count":0,"marginFraction":0.05} | 0.7143 | 0.0323 | 7520 |
| 130 | {"bm25Top":80,"wLex":1.2,"rFix":0.5,"rModify":0.5,"rTest":0.4,"rRefactor":0.7,"rAdd":0.1,"rExplain":0.3,"coreFiles":0,"l2Count":5,"marginFraction":0} | 0.7143 | 0.0320 | 7930 |
| 131 | {"bm25Top":80,"wLex":1.2,"rFix":0.5,"rModify":0.5,"rTest":0.4,"rRefactor":0.7,"rAdd":0.1,"rExplain":0.3,"coreFiles":0,"l2Count":5,"marginFraction":0.05} | 0.7143 | 0.0324 | 7524 |
| 132 | {"bm25Top":80,"wLex":1.2,"rFix":0.5,"rModify":0.5,"rTest":0.4,"rRefactor":0.7,"rAdd":0.1,"rExplain":0.3,"coreFiles":15,"l2Count":0,"marginFraction":0} | 0.7143 | 0.0327 | 7946 |
| 133 | {"bm25Top":80,"wLex":1.2,"rFix":0.5,"rModify":0.5,"rTest":0.4,"rRefactor":0.7,"rAdd":0.1,"rExplain":0.3,"coreFiles":15,"l2Count":0,"marginFraction":0.05} | 0.7143 | 0.0331 | 7539 |
| 134 | {"bm25Top":80,"wLex":1.2,"rFix":0.5,"rModify":0.5,"rTest":0.4,"rRefactor":0.7,"rAdd":0.1,"rExplain":0.3,"coreFiles":15,"l2Count":5,"marginFraction":0} | 0.7143 | 0.0327 | 7926 |
| 135 | {"bm25Top":80,"wLex":1.2,"rFix":0.5,"rModify":0.5,"rTest":0.4,"rRefactor":0.7,"rAdd":0.1,"rExplain":0.3,"coreFiles":15,"l2Count":5,"marginFraction":0.05} | 0.7143 | 0.0331 | 7548 |
| 136 | {"bm25Top":80,"wLex":1.2,"rFix":1,"rModify":1,"rTest":0.8,"rRefactor":1.4,"rAdd":0.2,"rExplain":0.6,"coreFiles":0,"l2Count":0,"marginFraction":0} | 0.7143 | 0.0319 | 7928 |
| 137 | {"bm25Top":80,"wLex":1.2,"rFix":1,"rModify":1,"rTest":0.8,"rRefactor":1.4,"rAdd":0.2,"rExplain":0.6,"coreFiles":0,"l2Count":0,"marginFraction":0.05} | 0.7143 | 0.0323 | 7519 |
| 138 | {"bm25Top":80,"wLex":1.2,"rFix":1,"rModify":1,"rTest":0.8,"rRefactor":1.4,"rAdd":0.2,"rExplain":0.6,"coreFiles":0,"l2Count":5,"marginFraction":0} | 0.7143 | 0.0320 | 7920 |
| 139 | {"bm25Top":80,"wLex":1.2,"rFix":1,"rModify":1,"rTest":0.8,"rRefactor":1.4,"rAdd":0.2,"rExplain":0.6,"coreFiles":0,"l2Count":5,"marginFraction":0.05} | 0.7143 | 0.0323 | 7527 |
| 140 | {"bm25Top":80,"wLex":1.2,"rFix":1,"rModify":1,"rTest":0.8,"rRefactor":1.4,"rAdd":0.2,"rExplain":0.6,"coreFiles":15,"l2Count":0,"marginFraction":0} | 0.7143 | 0.0326 | 7935 |
| 141 | {"bm25Top":80,"wLex":1.2,"rFix":1,"rModify":1,"rTest":0.8,"rRefactor":1.4,"rAdd":0.2,"rExplain":0.6,"coreFiles":15,"l2Count":0,"marginFraction":0.05} | 0.7143 | 0.0331 | 7540 |
| 142 | {"bm25Top":80,"wLex":1.2,"rFix":1,"rModify":1,"rTest":0.8,"rRefactor":1.4,"rAdd":0.2,"rExplain":0.6,"coreFiles":15,"l2Count":5,"marginFraction":0} | 0.7143 | 0.0327 | 7948 |
| 143 | {"bm25Top":80,"wLex":1.2,"rFix":1,"rModify":1,"rTest":0.8,"rRefactor":1.4,"rAdd":0.2,"rExplain":0.6,"coreFiles":15,"l2Count":5,"marginFraction":0.05} | 0.7143 | 0.0332 | 7532 |

La suite tiene 30 casos, inferior al mínimo de 60 de REQ-CTX-003. El split evita usar validación en el ajuste, pero no aporta independencia entre tareas parecidas de la misma fixture ni demuestra generalización a otros repositorios. Tokens del estimador bytes-lf/3.2@1, no de un tokenizer externo.
