# ctx-gold · diagnóstico FKR-037

Baseline anterior a calibración. Recall macro 0.6889; precisión 0.0323; mediana 7545 tokens.

La precisión ya cumple §20.5: ids distintos con nivel ≥ L1, intersección con gold_modified ∪ gold_read. L0 y el contorno core no cuentan. Sin corrección de fórmula. La suite tiene 30 casos (20 fixture-a y 10 monorepo-pnpm): no satisface aún el mínimo normativo de 60.

Posiciones y razones obtenidas de un pack de 200.000 tokens con la misma petición; el ranking no depende del presupuesto. Semillado significa razón directa, no DEPENDENCY_OF/DEPENDENT_OF/CORE. Los descartes publicados se limitan a 20; fuera de ellos BUDGET se deduce del recorrido exhaustivo del selector actual (sin corte de ranking). Un archivo ausente del mapa nunca puede entrar, aunque se suba su peso.

## a-01 (fixture-a)

Recall 0.000; precisión 0.000; usados 7559.

| Archivo gold ausente | Tipo | Causa | Semillado | Posición | Score | Razones |
|---|---|---|---|---:|---:|---|
| packages/catalog/src/policy-1.ts | modified | BUDGET (fuera de los 20 descartes publicados) | no | 292 | 0.000442170973 | CORE |

Presupuesto por sección: rules: 30; core: 777; skill: 0; task_scope: 0; related: 6727; targets: 0; request: 25.

Ocupantes (metadatos deduplicados; los tokens del core se contabilizan por sección aunque un archivo también aparezca a L1+):

| Archivo | Nivel | Tokens |
|---|---|---:|
| packages/catalog/src/isPositiveQuantity.ts | L2 | 92 |
| packages/cart/src/cartWeight.ts | L2 | 86 |
| packages/ui/src/itemLabel.ts | L2 | 84 |
| packages/catalog/src/index.ts | L2 | 99 |
| packages/users/src/index.ts | L2 | 96 |
| packages/cart/src/index.ts | L1 | 101 |
| packages/pricing/src/index.ts | L1 | 105 |
| packages/orders/src/index.ts | L1 | 112 |
| packages/ui/src/index.ts | L1 | 103 |
| packages/catalog/src/record-0.ts | L1 | 68 |
| packages/catalog/src/record-1.ts | L1 | 68 |
| packages/catalog/src/record-10.ts | L1 | 69 |
| packages/catalog/src/record-11.ts | L1 | 69 |
| packages/catalog/src/record-12.ts | L1 | 69 |
| packages/catalog/src/record-13.ts | L1 | 69 |
| packages/catalog/src/record-14.ts | L1 | 69 |
| packages/catalog/src/record-15.ts | L1 | 69 |
| packages/catalog/src/record-16.ts | L1 | 69 |
| packages/catalog/src/record-17.ts | L1 | 69 |
| packages/catalog/src/record-18.ts | L1 | 69 |
| packages/catalog/src/record-19.ts | L1 | 69 |
| packages/catalog/src/record-2.ts | L1 | 68 |
| packages/catalog/src/record-20.ts | L1 | 69 |
| packages/catalog/src/record-21.ts | L1 | 69 |
| packages/catalog/src/record-3.ts | L1 | 68 |
| packages/catalog/src/record-4.ts | L1 | 68 |
| packages/catalog/src/record-5.ts | L1 | 68 |
| packages/catalog/src/record-6.ts | L1 | 68 |
| packages/catalog/src/record-7.ts | L1 | 68 |
| packages/catalog/src/record-8.ts | L1 | 68 |
| packages/catalog/src/record-9.ts | L1 | 68 |
| packages/users/src/record-0.ts | L1 | 66 |
| packages/users/src/record-1.ts | L1 | 66 |
| packages/users/src/record-10.ts | L1 | 67 |
| packages/users/src/record-11.ts | L1 | 67 |
| packages/users/src/record-12.ts | L1 | 67 |
| packages/users/src/record-13.ts | L1 | 67 |
| packages/users/src/record-14.ts | L1 | 67 |
| packages/users/src/record-15.ts | L1 | 67 |
| packages/users/src/record-16.ts | L1 | 67 |
| packages/users/src/record-17.ts | L1 | 67 |
| packages/users/src/record-18.ts | L1 | 67 |
| packages/users/src/record-19.ts | L1 | 67 |
| packages/users/src/record-2.ts | L1 | 66 |
| packages/users/src/record-20.ts | L1 | 67 |
| packages/users/src/record-21.ts | L1 | 67 |
| packages/users/src/record-3.ts | L1 | 66 |
| packages/users/src/record-4.ts | L1 | 66 |
| packages/users/src/record-5.ts | L1 | 66 |
| packages/users/src/record-6.ts | L1 | 66 |
| packages/users/src/record-7.ts | L1 | 66 |
| packages/users/src/record-8.ts | L1 | 66 |
| packages/users/src/record-9.ts | L1 | 66 |
| packages/cart/src/inventoryAmount.ts | L1 | 73 |
| packages/catalog/src/stockValue.ts | L1 | 70 |
| packages/orders/src/orderTotal.ts | L1 | 65 |
| packages/orders/src/payableAmount.ts | L1 | 67 |
| packages/orders/src/staffAccess.ts | L1 | 66 |
| packages/pricing/src/netPrice.ts | L1 | 69 |
| packages/ui/src/receiptAmount.ts | L1 | 66 |
| packages/users/src/isAdmin.ts | L1 | 61 |
| packages/cart/src/record-0.ts | L1 | 65 |
| packages/cart/src/record-1.ts | L1 | 65 |
| packages/cart/src/record-10.ts | L1 | 65 |
| packages/cart/src/record-11.ts | L1 | 65 |
| packages/cart/src/record-12.ts | L1 | 65 |
| packages/cart/src/record-13.ts | L1 | 65 |
| packages/cart/src/record-14.ts | L1 | 65 |
| packages/cart/src/record-15.ts | L1 | 65 |
| packages/cart/src/record-16.ts | L1 | 65 |
| packages/cart/src/record-17.ts | L1 | 65 |
| packages/cart/src/record-18.ts | L1 | 65 |
| packages/cart/src/record-19.ts | L1 | 65 |
| packages/cart/src/record-2.ts | L1 | 65 |
| packages/cart/src/record-20.ts | L1 | 65 |
| packages/cart/src/record-21.ts | L1 | 65 |
| packages/cart/src/record-3.ts | L1 | 65 |
| packages/cart/src/record-4.ts | L1 | 65 |
| packages/cart/src/record-5.ts | L1 | 65 |
| packages/cart/src/record-6.ts | L1 | 65 |
| packages/cart/src/record-7.ts | L1 | 65 |
| packages/cart/src/record-8.ts | L1 | 65 |
| packages/cart/src/record-9.ts | L1 | 65 |
| packages/pricing/src/record-0.ts | L1 | 68 |
| packages/pricing/src/record-1.ts | L1 | 68 |
| packages/pricing/src/record-10.ts | L1 | 69 |
| packages/pricing/src/record-11.ts | L1 | 69 |
| packages/pricing/src/record-12.ts | L1 | 69 |
| packages/pricing/src/record-13.ts | L1 | 69 |
| packages/pricing/src/record-14.ts | L1 | 69 |
| packages/pricing/src/record-15.ts | L1 | 69 |
| packages/pricing/src/record-16.ts | L1 | 69 |
| packages/pricing/src/record-17.ts | L1 | 69 |
| packages/pricing/src/record-18.ts | L1 | 69 |
| packages/pricing/src/record-19.ts | L1 | 69 |
| packages/pricing/src/record-2.ts | L1 | 68 |
| packages/cart/src/baseline.test.ts | L1 | 52 |

## a-04 (fixture-a)

Recall 0.000; precisión 0.000; usados 7532.

| Archivo gold ausente | Tipo | Causa | Semillado | Posición | Score | Razones |
|---|---|---|---|---:|---:|---|
| packages/users/src/policy-4.ts | modified | BUDGET (fuera de los 20 descartes publicados) | no | 311 | 0.000193978068 | CORE |

Presupuesto por sección: rules: 30; core: 777; skill: 0; task_scope: 0; related: 6693; targets: 0; request: 32.

Ocupantes (metadatos deduplicados; los tokens del core se contabilizan por sección aunque un archivo también aparezca a L1+):

| Archivo | Nivel | Tokens |
|---|---|---:|
| packages/catalog/src/index.ts | L2 | 99 |
| packages/cart/src/index.ts | L2 | 101 |
| packages/users/src/index.ts | L2 | 96 |
| packages/pricing/src/index.ts | L2 | 105 |
| packages/orders/src/index.ts | L2 | 112 |
| packages/ui/src/index.ts | L1 | 103 |
| packages/catalog/src/record-0.ts | L1 | 68 |
| packages/catalog/src/record-1.ts | L1 | 68 |
| packages/catalog/src/record-10.ts | L1 | 69 |
| packages/catalog/src/record-11.ts | L1 | 69 |
| packages/catalog/src/record-12.ts | L1 | 69 |
| packages/catalog/src/record-13.ts | L1 | 69 |
| packages/catalog/src/record-14.ts | L1 | 69 |
| packages/catalog/src/record-15.ts | L1 | 69 |
| packages/catalog/src/record-16.ts | L1 | 69 |
| packages/catalog/src/record-17.ts | L1 | 69 |
| packages/catalog/src/record-18.ts | L1 | 69 |
| packages/catalog/src/record-19.ts | L1 | 69 |
| packages/catalog/src/record-2.ts | L1 | 68 |
| packages/catalog/src/record-20.ts | L1 | 69 |
| packages/catalog/src/record-21.ts | L1 | 69 |
| packages/catalog/src/record-3.ts | L1 | 68 |
| packages/catalog/src/record-4.ts | L1 | 68 |
| packages/catalog/src/record-5.ts | L1 | 68 |
| packages/catalog/src/record-6.ts | L1 | 68 |
| packages/catalog/src/record-7.ts | L1 | 68 |
| packages/catalog/src/record-8.ts | L1 | 68 |
| packages/catalog/src/record-9.ts | L1 | 68 |
| packages/cart/src/record-0.ts | L1 | 65 |
| packages/cart/src/record-1.ts | L1 | 65 |
| packages/cart/src/record-10.ts | L1 | 65 |
| packages/cart/src/record-11.ts | L1 | 65 |
| packages/cart/src/record-12.ts | L1 | 65 |
| packages/cart/src/record-13.ts | L1 | 65 |
| packages/cart/src/record-14.ts | L1 | 65 |
| packages/cart/src/record-15.ts | L1 | 65 |
| packages/cart/src/record-16.ts | L1 | 65 |
| packages/cart/src/record-17.ts | L1 | 65 |
| packages/cart/src/record-18.ts | L1 | 65 |
| packages/cart/src/record-19.ts | L1 | 65 |
| packages/cart/src/record-2.ts | L1 | 65 |
| packages/cart/src/record-20.ts | L1 | 65 |
| packages/cart/src/record-21.ts | L1 | 65 |
| packages/cart/src/record-3.ts | L1 | 65 |
| packages/cart/src/record-4.ts | L1 | 65 |
| packages/cart/src/record-5.ts | L1 | 65 |
| packages/cart/src/record-6.ts | L1 | 65 |
| packages/cart/src/record-7.ts | L1 | 65 |
| packages/cart/src/record-8.ts | L1 | 65 |
| packages/cart/src/record-9.ts | L1 | 65 |
| packages/users/src/record-0.ts | L1 | 66 |
| packages/users/src/record-1.ts | L1 | 66 |
| packages/users/src/record-10.ts | L1 | 67 |
| packages/users/src/record-11.ts | L1 | 67 |
| packages/users/src/record-12.ts | L1 | 67 |
| packages/users/src/record-13.ts | L1 | 67 |
| packages/users/src/record-14.ts | L1 | 67 |
| packages/users/src/record-15.ts | L1 | 67 |
| packages/users/src/record-16.ts | L1 | 67 |
| packages/users/src/record-17.ts | L1 | 67 |
| packages/users/src/record-18.ts | L1 | 67 |
| packages/users/src/record-19.ts | L1 | 67 |
| packages/users/src/record-2.ts | L1 | 66 |
| packages/users/src/record-20.ts | L1 | 67 |
| packages/users/src/record-21.ts | L1 | 67 |
| packages/users/src/record-3.ts | L1 | 66 |
| packages/users/src/record-4.ts | L1 | 66 |
| packages/users/src/record-5.ts | L1 | 66 |
| packages/users/src/record-6.ts | L1 | 66 |
| packages/users/src/record-7.ts | L1 | 66 |
| packages/users/src/record-8.ts | L1 | 66 |
| packages/users/src/record-9.ts | L1 | 66 |
| packages/pricing/src/record-0.ts | L1 | 68 |
| packages/pricing/src/record-1.ts | L1 | 68 |
| packages/pricing/src/record-10.ts | L1 | 69 |
| packages/pricing/src/record-11.ts | L1 | 69 |
| packages/pricing/src/record-12.ts | L1 | 69 |
| packages/pricing/src/record-13.ts | L1 | 69 |
| packages/pricing/src/record-14.ts | L1 | 69 |
| packages/pricing/src/record-15.ts | L1 | 69 |
| packages/pricing/src/record-16.ts | L1 | 69 |
| packages/pricing/src/record-17.ts | L1 | 69 |
| packages/pricing/src/record-18.ts | L1 | 69 |
| packages/pricing/src/record-19.ts | L1 | 69 |
| packages/pricing/src/record-2.ts | L1 | 68 |
| packages/pricing/src/record-20.ts | L1 | 69 |
| packages/pricing/src/record-21.ts | L1 | 69 |
| packages/pricing/src/record-3.ts | L1 | 68 |
| packages/pricing/src/record-4.ts | L1 | 68 |
| packages/pricing/src/record-5.ts | L1 | 68 |
| packages/pricing/src/record-6.ts | L1 | 68 |
| packages/pricing/src/record-7.ts | L1 | 68 |
| packages/pricing/src/record-8.ts | L1 | 68 |
| packages/pricing/src/record-9.ts | L1 | 68 |
| packages/orders/src/record-0.ts | L1 | 67 |
| packages/orders/src/record-1.ts | L1 | 67 |
| packages/orders/src/record-10.ts | L1 | 68 |

## a-06 (fixture-a)

Recall 0.000; precisión 0.000; usados 7548.

| Archivo gold ausente | Tipo | Causa | Semillado | Posición | Score | Razones |
|---|---|---|---|---:|---:|---|
| packages/ui/src/formatPrice.ts | modified | BUDGET (fuera de los 20 descartes publicados) | no | 306 | 0.000305267697 | CORE |

Presupuesto por sección: rules: 30; core: 777; skill: 0; task_scope: 0; related: 6711; targets: 0; request: 30.

Ocupantes (metadatos deduplicados; los tokens del core se contabilizan por sección aunque un archivo también aparezca a L1+):

| Archivo | Nivel | Tokens |
|---|---|---:|
| packages/orders/src/payableAmount.ts | L2 | 85 |
| packages/orders/src/staffAccess.ts | L2 | 84 |
| packages/ui/src/receiptAmount.ts | L2 | 84 |
| packages/cart/src/inventoryAmount.ts | L2 | 91 |
| packages/orders/src/orderTotal.ts | L2 | 94 |
| packages/pricing/src/netPrice.ts | L1 | 83 |
| packages/users/src/isAdmin.ts | L1 | 75 |
| packages/catalog/src/stockValue.ts | L1 | 85 |
| packages/catalog/src/index.ts | L1 | 99 |
| packages/users/src/index.ts | L1 | 96 |
| packages/cart/src/index.ts | L1 | 101 |
| packages/pricing/src/index.ts | L1 | 105 |
| packages/orders/src/index.ts | L1 | 112 |
| packages/ui/src/index.ts | L1 | 103 |
| packages/pricing/src/policy-8.ts | L1 | 68 |
| packages/ui/src/deliveryLink.ts | L1 | 66 |
| packages/orders/src/parcelWeight.ts | L1 | 70 |
| packages/ui/src/basketCaption.ts | L1 | 68 |
| packages/cart/src/lineTotal.ts | L1 | 71 |
| packages/orders/src/checkoutTax.ts | L1 | 74 |
| packages/orders/src/customerLabel.ts | L1 | 75 |
| packages/pricing/src/taxAmount.ts | L1 | 72 |
| packages/ui/src/referenceSearch.ts | L1 | 74 |
| packages/catalog/src/record-0.ts | L1 | 68 |
| packages/catalog/src/record-1.ts | L1 | 68 |
| packages/catalog/src/record-10.ts | L1 | 69 |
| packages/catalog/src/record-11.ts | L1 | 69 |
| packages/catalog/src/record-12.ts | L1 | 69 |
| packages/catalog/src/record-13.ts | L1 | 69 |
| packages/catalog/src/record-14.ts | L1 | 69 |
| packages/catalog/src/record-15.ts | L1 | 69 |
| packages/catalog/src/record-16.ts | L1 | 69 |
| packages/catalog/src/record-17.ts | L1 | 69 |
| packages/catalog/src/record-18.ts | L1 | 69 |
| packages/catalog/src/record-19.ts | L1 | 69 |
| packages/catalog/src/record-2.ts | L1 | 68 |
| packages/catalog/src/record-20.ts | L1 | 69 |
| packages/catalog/src/record-21.ts | L1 | 69 |
| packages/catalog/src/record-3.ts | L1 | 68 |
| packages/catalog/src/record-4.ts | L1 | 68 |
| packages/catalog/src/record-5.ts | L1 | 68 |
| packages/catalog/src/record-6.ts | L1 | 68 |
| packages/catalog/src/record-7.ts | L1 | 68 |
| packages/catalog/src/record-8.ts | L1 | 68 |
| packages/catalog/src/record-9.ts | L1 | 68 |
| packages/users/src/record-0.ts | L1 | 66 |
| packages/users/src/record-1.ts | L1 | 66 |
| packages/users/src/record-10.ts | L1 | 67 |
| packages/users/src/record-11.ts | L1 | 67 |
| packages/users/src/record-12.ts | L1 | 67 |
| packages/users/src/record-13.ts | L1 | 67 |
| packages/users/src/record-14.ts | L1 | 67 |
| packages/users/src/record-15.ts | L1 | 67 |
| packages/users/src/record-16.ts | L1 | 67 |
| packages/users/src/record-17.ts | L1 | 67 |
| packages/users/src/record-18.ts | L1 | 67 |
| packages/users/src/record-19.ts | L1 | 67 |
| packages/users/src/record-2.ts | L1 | 66 |
| packages/users/src/record-20.ts | L1 | 67 |
| packages/users/src/record-21.ts | L1 | 67 |
| packages/users/src/record-3.ts | L1 | 66 |
| packages/users/src/record-4.ts | L1 | 66 |
| packages/users/src/record-5.ts | L1 | 66 |
| packages/users/src/record-6.ts | L1 | 66 |
| packages/users/src/record-7.ts | L1 | 66 |
| packages/users/src/record-8.ts | L1 | 66 |
| packages/users/src/record-9.ts | L1 | 66 |
| packages/cart/src/record-0.ts | L1 | 65 |
| packages/cart/src/record-1.ts | L1 | 65 |
| packages/cart/src/record-10.ts | L1 | 65 |
| packages/cart/src/record-11.ts | L1 | 65 |
| packages/cart/src/record-12.ts | L1 | 65 |
| packages/cart/src/record-13.ts | L1 | 65 |
| packages/cart/src/record-14.ts | L1 | 65 |
| packages/cart/src/record-15.ts | L1 | 65 |
| packages/cart/src/record-16.ts | L1 | 65 |
| packages/cart/src/record-17.ts | L1 | 65 |
| packages/cart/src/record-18.ts | L1 | 65 |
| packages/cart/src/record-19.ts | L1 | 65 |
| packages/cart/src/record-2.ts | L1 | 65 |
| packages/cart/src/record-20.ts | L1 | 65 |
| packages/cart/src/record-21.ts | L1 | 65 |
| packages/cart/src/record-3.ts | L1 | 65 |
| packages/cart/src/record-4.ts | L1 | 65 |
| packages/cart/src/record-5.ts | L1 | 65 |
| packages/cart/src/record-6.ts | L1 | 65 |
| packages/cart/src/record-7.ts | L1 | 65 |
| packages/cart/src/record-8.ts | L1 | 65 |
| packages/cart/src/record-9.ts | L1 | 65 |
| packages/pricing/src/record-0.ts | L1 | 68 |
| packages/pricing/src/record-1.ts | L1 | 68 |
| packages/pricing/src/record-10.ts | L1 | 69 |
| packages/pricing/src/record-11.ts | L1 | 69 |
| packages/pricing/src/record-12.ts | L1 | 69 |
| packages/pricing/src/record-13.ts | L1 | 69 |

## a-09 (fixture-a)

Recall 0.500; precisión 0.011; usados 7555.

| Archivo gold ausente | Tipo | Causa | Semillado | Posición | Score | Razones |
|---|---|---|---|---:|---:|---|
| packages/catalog/src/skuMatches.ts | modified | BUDGET (fuera de los 20 descartes publicados) | no | 298 | 0.000264477654 | CORE |

Presupuesto por sección: rules: 30; core: 777; skill: 0; task_scope: 0; related: 6703; targets: 0; request: 45.

Ocupantes (metadatos deduplicados; los tokens del core se contabilizan por sección aunque un archivo también aparezca a L1+):

| Archivo | Nivel | Tokens |
|---|---|---:|
| packages/orders/src/payableAmount.ts | L2 | 86 |
| packages/orders/src/staffAccess.ts | L2 | 84 |
| packages/ui/src/receiptAmount.ts | L2 | 84 |
| packages/cart/src/inventoryAmount.ts | L2 | 92 |
| packages/orders/src/orderTotal.ts | L2 | 94 |
| packages/pricing/src/netPrice.ts | L1 | 83 |
| packages/users/src/isAdmin.ts | L1 | 75 |
| packages/catalog/src/stockValue.ts | L1 | 85 |
| packages/catalog/src/index.ts | L1 | 99 |
| packages/users/src/index.ts | L1 | 96 |
| packages/cart/src/index.ts | L1 | 101 |
| packages/pricing/src/index.ts | L1 | 105 |
| packages/orders/src/index.ts | L1 | 112 |
| packages/ui/src/index.ts | L1 | 103 |
| packages/ui/src/deliveryLink.ts | L1 | 66 |
| packages/orders/src/parcelWeight.ts | L1 | 71 |
| packages/ui/src/basketCaption.ts | L1 | 68 |
| packages/orders/src/checkoutTax.ts | L1 | 74 |
| packages/orders/src/customerLabel.ts | L1 | 75 |
| packages/ui/src/referenceSearch.ts | L1 | 74 |
| packages/catalog/src/record-0.ts | L1 | 68 |
| packages/catalog/src/record-1.ts | L1 | 68 |
| packages/catalog/src/record-10.ts | L1 | 69 |
| packages/catalog/src/record-11.ts | L1 | 69 |
| packages/catalog/src/record-12.ts | L1 | 69 |
| packages/catalog/src/record-13.ts | L1 | 69 |
| packages/catalog/src/record-14.ts | L1 | 69 |
| packages/catalog/src/record-15.ts | L1 | 69 |
| packages/catalog/src/record-16.ts | L1 | 69 |
| packages/catalog/src/record-17.ts | L1 | 69 |
| packages/catalog/src/record-18.ts | L1 | 69 |
| packages/catalog/src/record-19.ts | L1 | 69 |
| packages/catalog/src/record-2.ts | L1 | 68 |
| packages/catalog/src/record-20.ts | L1 | 69 |
| packages/catalog/src/record-21.ts | L1 | 69 |
| packages/catalog/src/record-3.ts | L1 | 68 |
| packages/catalog/src/record-4.ts | L1 | 68 |
| packages/catalog/src/record-5.ts | L1 | 68 |
| packages/catalog/src/record-6.ts | L1 | 68 |
| packages/catalog/src/record-7.ts | L1 | 68 |
| packages/catalog/src/record-8.ts | L1 | 68 |
| packages/catalog/src/record-9.ts | L1 | 68 |
| packages/users/src/record-0.ts | L1 | 66 |
| packages/users/src/record-1.ts | L1 | 66 |
| packages/users/src/record-10.ts | L1 | 67 |
| packages/users/src/record-11.ts | L1 | 67 |
| packages/users/src/record-12.ts | L1 | 67 |
| packages/users/src/record-13.ts | L1 | 67 |
| packages/users/src/record-14.ts | L1 | 67 |
| packages/users/src/record-15.ts | L1 | 67 |
| packages/users/src/record-16.ts | L1 | 67 |
| packages/users/src/record-17.ts | L1 | 67 |
| packages/users/src/record-18.ts | L1 | 67 |
| packages/users/src/record-19.ts | L1 | 67 |
| packages/users/src/record-2.ts | L1 | 66 |
| packages/users/src/record-20.ts | L1 | 67 |
| packages/users/src/record-21.ts | L1 | 67 |
| packages/users/src/record-3.ts | L1 | 66 |
| packages/users/src/record-4.ts | L1 | 66 |
| packages/users/src/record-5.ts | L1 | 66 |
| packages/users/src/record-6.ts | L1 | 66 |
| packages/users/src/record-7.ts | L1 | 66 |
| packages/users/src/record-8.ts | L1 | 66 |
| packages/users/src/record-9.ts | L1 | 66 |
| packages/cart/src/record-0.ts | L1 | 65 |
| packages/cart/src/record-1.ts | L1 | 65 |
| packages/cart/src/record-10.ts | L1 | 65 |
| packages/cart/src/record-11.ts | L1 | 65 |
| packages/cart/src/record-12.ts | L1 | 65 |
| packages/cart/src/record-13.ts | L1 | 65 |
| packages/cart/src/record-14.ts | L1 | 65 |
| packages/cart/src/record-15.ts | L1 | 65 |
| packages/cart/src/record-16.ts | L1 | 65 |
| packages/cart/src/record-17.ts | L1 | 65 |
| packages/cart/src/record-18.ts | L1 | 65 |
| packages/cart/src/record-19.ts | L1 | 65 |
| packages/cart/src/record-2.ts | L1 | 65 |
| packages/cart/src/record-20.ts | L1 | 65 |
| packages/cart/src/record-21.ts | L1 | 65 |
| packages/cart/src/record-3.ts | L1 | 65 |
| packages/cart/src/record-4.ts | L1 | 65 |
| packages/cart/src/record-5.ts | L1 | 65 |
| packages/cart/src/record-6.ts | L1 | 65 |
| packages/cart/src/record-7.ts | L1 | 65 |
| packages/cart/src/record-8.ts | L1 | 65 |
| packages/cart/src/record-9.ts | L1 | 65 |
| packages/pricing/src/record-0.ts | L1 | 68 |
| packages/pricing/src/record-1.ts | L1 | 68 |
| packages/pricing/src/record-10.ts | L1 | 69 |
| packages/pricing/src/record-11.ts | L1 | 69 |
| packages/pricing/src/record-12.ts | L1 | 69 |
| packages/pricing/src/record-13.ts | L1 | 69 |
| packages/pricing/src/record-14.ts | L1 | 69 |
| packages/pricing/src/record-15.ts | L1 | 69 |
| packages/ui/src/record-0.ts | L1 | 62 |

## a-11 (fixture-a)

Recall 0.500; precisión 0.011; usados 7553.

| Archivo gold ausente | Tipo | Causa | Semillado | Posición | Score | Razones |
|---|---|---|---|---:|---:|---|
| packages/pricing/src/taxAmount.ts | modified | BUDGET (fuera de los 20 descartes publicados) | no | 305 | 0.000264477654 | CORE |

Presupuesto por sección: rules: 30; core: 777; skill: 0; task_scope: 0; related: 6710; targets: 0; request: 36.

Ocupantes (metadatos deduplicados; los tokens del core se contabilizan por sección aunque un archivo también aparezca a L1+):

| Archivo | Nivel | Tokens |
|---|---|---:|
| packages/orders/src/payableAmount.ts | L2 | 86 |
| packages/orders/src/staffAccess.ts | L2 | 84 |
| packages/ui/src/receiptAmount.ts | L2 | 84 |
| packages/cart/src/inventoryAmount.ts | L2 | 92 |
| packages/orders/src/orderTotal.ts | L2 | 94 |
| packages/pricing/src/netPrice.ts | L1 | 83 |
| packages/users/src/isAdmin.ts | L1 | 75 |
| packages/catalog/src/stockValue.ts | L1 | 85 |
| packages/catalog/src/index.ts | L1 | 99 |
| packages/users/src/index.ts | L1 | 96 |
| packages/cart/src/index.ts | L1 | 101 |
| packages/pricing/src/index.ts | L1 | 105 |
| packages/orders/src/index.ts | L1 | 112 |
| packages/ui/src/index.ts | L1 | 103 |
| packages/ui/src/deliveryLink.ts | L1 | 66 |
| packages/orders/src/parcelWeight.ts | L1 | 71 |
| packages/ui/src/basketCaption.ts | L1 | 68 |
| packages/orders/src/checkoutTax.ts | L1 | 74 |
| packages/orders/src/customerLabel.ts | L1 | 75 |
| packages/ui/src/referenceSearch.ts | L1 | 74 |
| packages/catalog/src/record-0.ts | L1 | 68 |
| packages/catalog/src/record-1.ts | L1 | 68 |
| packages/catalog/src/record-10.ts | L1 | 69 |
| packages/catalog/src/record-11.ts | L1 | 69 |
| packages/catalog/src/record-12.ts | L1 | 69 |
| packages/catalog/src/record-13.ts | L1 | 69 |
| packages/catalog/src/record-14.ts | L1 | 69 |
| packages/catalog/src/record-15.ts | L1 | 69 |
| packages/catalog/src/record-16.ts | L1 | 69 |
| packages/catalog/src/record-17.ts | L1 | 69 |
| packages/catalog/src/record-18.ts | L1 | 69 |
| packages/catalog/src/record-19.ts | L1 | 69 |
| packages/catalog/src/record-2.ts | L1 | 68 |
| packages/catalog/src/record-20.ts | L1 | 69 |
| packages/catalog/src/record-21.ts | L1 | 69 |
| packages/catalog/src/record-3.ts | L1 | 68 |
| packages/catalog/src/record-4.ts | L1 | 68 |
| packages/catalog/src/record-5.ts | L1 | 68 |
| packages/catalog/src/record-6.ts | L1 | 68 |
| packages/catalog/src/record-7.ts | L1 | 68 |
| packages/catalog/src/record-8.ts | L1 | 68 |
| packages/catalog/src/record-9.ts | L1 | 68 |
| packages/users/src/record-0.ts | L1 | 66 |
| packages/users/src/record-1.ts | L1 | 66 |
| packages/users/src/record-10.ts | L1 | 67 |
| packages/users/src/record-11.ts | L1 | 67 |
| packages/users/src/record-12.ts | L1 | 67 |
| packages/users/src/record-13.ts | L1 | 67 |
| packages/users/src/record-14.ts | L1 | 67 |
| packages/users/src/record-15.ts | L1 | 67 |
| packages/users/src/record-16.ts | L1 | 67 |
| packages/users/src/record-17.ts | L1 | 67 |
| packages/users/src/record-18.ts | L1 | 67 |
| packages/users/src/record-19.ts | L1 | 67 |
| packages/users/src/record-2.ts | L1 | 66 |
| packages/users/src/record-20.ts | L1 | 67 |
| packages/users/src/record-21.ts | L1 | 67 |
| packages/users/src/record-3.ts | L1 | 66 |
| packages/users/src/record-4.ts | L1 | 66 |
| packages/users/src/record-5.ts | L1 | 66 |
| packages/users/src/record-6.ts | L1 | 66 |
| packages/users/src/record-7.ts | L1 | 66 |
| packages/users/src/record-8.ts | L1 | 66 |
| packages/users/src/record-9.ts | L1 | 66 |
| packages/cart/src/record-0.ts | L1 | 65 |
| packages/cart/src/record-1.ts | L1 | 65 |
| packages/cart/src/record-10.ts | L1 | 65 |
| packages/cart/src/record-11.ts | L1 | 65 |
| packages/cart/src/record-12.ts | L1 | 65 |
| packages/cart/src/record-13.ts | L1 | 65 |
| packages/cart/src/record-14.ts | L1 | 65 |
| packages/cart/src/record-15.ts | L1 | 65 |
| packages/cart/src/record-16.ts | L1 | 65 |
| packages/cart/src/record-17.ts | L1 | 65 |
| packages/cart/src/record-18.ts | L1 | 65 |
| packages/cart/src/record-19.ts | L1 | 65 |
| packages/cart/src/record-2.ts | L1 | 65 |
| packages/cart/src/record-20.ts | L1 | 65 |
| packages/cart/src/record-21.ts | L1 | 65 |
| packages/cart/src/record-3.ts | L1 | 65 |
| packages/cart/src/record-4.ts | L1 | 65 |
| packages/cart/src/record-5.ts | L1 | 65 |
| packages/cart/src/record-6.ts | L1 | 65 |
| packages/cart/src/record-7.ts | L1 | 65 |
| packages/cart/src/record-8.ts | L1 | 65 |
| packages/cart/src/record-9.ts | L1 | 65 |
| packages/pricing/src/record-0.ts | L1 | 68 |
| packages/pricing/src/record-1.ts | L1 | 68 |
| packages/pricing/src/record-10.ts | L1 | 69 |
| packages/pricing/src/record-11.ts | L1 | 69 |
| packages/pricing/src/record-12.ts | L1 | 69 |
| packages/pricing/src/record-13.ts | L1 | 69 |
| packages/pricing/src/record-14.ts | L1 | 69 |
| packages/pricing/src/record-15.ts | L1 | 69 |
| packages/pricing/src/record-16.ts | L1 | 69 |

## a-12 (fixture-a)

Recall 0.500; precisión 0.010; usados 7558.

| Archivo gold ausente | Tipo | Causa | Semillado | Posición | Score | Razones |
|---|---|---|---|---:|---:|---|
| packages/orders/src/customerLabel.ts | modified | BUDGET (fuera de los 20 descartes publicados) | no | 296 | 0.000442170973 | CORE |

Presupuesto por sección: rules: 30; core: 777; skill: 0; task_scope: 0; related: 6711; targets: 0; request: 40.

Ocupantes (metadatos deduplicados; los tokens del core se contabilizan por sección aunque un archivo también aparezca a L1+):

| Archivo | Nivel | Tokens |
|---|---|---:|
| packages/users/src/displayName.ts | L2 | 92 |
| packages/catalog/src/index.ts | L2 | 99 |
| packages/users/src/index.ts | L2 | 96 |
| packages/cart/src/index.ts | L2 | 101 |
| packages/pricing/src/index.ts | L2 | 105 |
| packages/orders/src/index.ts | L1 | 112 |
| packages/ui/src/index.ts | L1 | 103 |
| packages/catalog/src/record-0.ts | L1 | 68 |
| packages/catalog/src/record-1.ts | L1 | 68 |
| packages/catalog/src/record-10.ts | L1 | 69 |
| packages/catalog/src/record-11.ts | L1 | 69 |
| packages/catalog/src/record-12.ts | L1 | 69 |
| packages/catalog/src/record-13.ts | L1 | 69 |
| packages/catalog/src/record-14.ts | L1 | 69 |
| packages/catalog/src/record-15.ts | L1 | 69 |
| packages/catalog/src/record-16.ts | L1 | 69 |
| packages/catalog/src/record-17.ts | L1 | 69 |
| packages/catalog/src/record-18.ts | L1 | 69 |
| packages/catalog/src/record-19.ts | L1 | 69 |
| packages/catalog/src/record-2.ts | L1 | 68 |
| packages/catalog/src/record-20.ts | L1 | 69 |
| packages/catalog/src/record-21.ts | L1 | 69 |
| packages/catalog/src/record-3.ts | L1 | 68 |
| packages/catalog/src/record-4.ts | L1 | 68 |
| packages/catalog/src/record-5.ts | L1 | 68 |
| packages/catalog/src/record-6.ts | L1 | 68 |
| packages/catalog/src/record-7.ts | L1 | 68 |
| packages/catalog/src/record-8.ts | L1 | 68 |
| packages/catalog/src/record-9.ts | L1 | 68 |
| packages/users/src/record-0.ts | L1 | 66 |
| packages/users/src/record-1.ts | L1 | 66 |
| packages/users/src/record-10.ts | L1 | 67 |
| packages/users/src/record-11.ts | L1 | 67 |
| packages/users/src/record-12.ts | L1 | 67 |
| packages/users/src/record-13.ts | L1 | 67 |
| packages/users/src/record-14.ts | L1 | 67 |
| packages/users/src/record-15.ts | L1 | 67 |
| packages/users/src/record-16.ts | L1 | 67 |
| packages/users/src/record-17.ts | L1 | 67 |
| packages/users/src/record-18.ts | L1 | 67 |
| packages/users/src/record-19.ts | L1 | 67 |
| packages/users/src/record-2.ts | L1 | 66 |
| packages/users/src/record-20.ts | L1 | 67 |
| packages/users/src/record-21.ts | L1 | 67 |
| packages/users/src/record-3.ts | L1 | 66 |
| packages/users/src/record-4.ts | L1 | 66 |
| packages/users/src/record-5.ts | L1 | 66 |
| packages/users/src/record-6.ts | L1 | 66 |
| packages/users/src/record-7.ts | L1 | 66 |
| packages/users/src/record-8.ts | L1 | 66 |
| packages/users/src/record-9.ts | L1 | 66 |
| packages/cart/src/inventoryAmount.ts | L1 | 73 |
| packages/catalog/src/stockValue.ts | L1 | 70 |
| packages/orders/src/orderTotal.ts | L1 | 65 |
| packages/orders/src/payableAmount.ts | L1 | 67 |
| packages/orders/src/staffAccess.ts | L1 | 66 |
| packages/pricing/src/netPrice.ts | L1 | 69 |
| packages/ui/src/receiptAmount.ts | L1 | 66 |
| packages/users/src/isAdmin.ts | L1 | 61 |
| packages/cart/src/record-0.ts | L1 | 65 |
| packages/cart/src/record-1.ts | L1 | 65 |
| packages/cart/src/record-10.ts | L1 | 65 |
| packages/cart/src/record-11.ts | L1 | 65 |
| packages/cart/src/record-12.ts | L1 | 65 |
| packages/cart/src/record-13.ts | L1 | 65 |
| packages/cart/src/record-14.ts | L1 | 65 |
| packages/cart/src/record-15.ts | L1 | 65 |
| packages/cart/src/record-16.ts | L1 | 65 |
| packages/cart/src/record-17.ts | L1 | 65 |
| packages/cart/src/record-18.ts | L1 | 65 |
| packages/cart/src/record-19.ts | L1 | 65 |
| packages/cart/src/record-2.ts | L1 | 65 |
| packages/cart/src/record-20.ts | L1 | 65 |
| packages/cart/src/record-21.ts | L1 | 65 |
| packages/cart/src/record-3.ts | L1 | 65 |
| packages/cart/src/record-4.ts | L1 | 65 |
| packages/cart/src/record-5.ts | L1 | 65 |
| packages/cart/src/record-6.ts | L1 | 65 |
| packages/cart/src/record-7.ts | L1 | 65 |
| packages/cart/src/record-8.ts | L1 | 65 |
| packages/cart/src/record-9.ts | L1 | 65 |
| packages/pricing/src/record-0.ts | L1 | 68 |
| packages/pricing/src/record-1.ts | L1 | 68 |
| packages/pricing/src/record-10.ts | L1 | 69 |
| packages/pricing/src/record-11.ts | L1 | 69 |
| packages/pricing/src/record-12.ts | L1 | 69 |
| packages/pricing/src/record-13.ts | L1 | 69 |
| packages/pricing/src/record-14.ts | L1 | 69 |
| packages/pricing/src/record-15.ts | L1 | 69 |
| packages/pricing/src/record-16.ts | L1 | 69 |
| packages/pricing/src/record-17.ts | L1 | 69 |
| packages/pricing/src/record-18.ts | L1 | 69 |
| packages/pricing/src/record-19.ts | L1 | 69 |
| packages/pricing/src/record-2.ts | L1 | 68 |
| packages/pricing/src/record-20.ts | L1 | 69 |
| packages/pricing/src/record-21.ts | L1 | 69 |
| packages/pricing/src/record-3.ts | L1 | 68 |

## a-13 (fixture-a)

Recall 0.000; precisión 0.000; usados 7557.

| Archivo gold ausente | Tipo | Causa | Semillado | Posición | Score | Razones |
|---|---|---|---|---:|---:|---|
| packages/orders/src/trackingUrl.ts | modified | BUDGET (fuera de los 20 descartes publicados) | no | 298 | 0.000442170973 | CORE |
| packages/ui/src/deliveryLink.ts | modified | BUDGET (fuera de los 20 descartes publicados) | no | 305 | 0.000442170973 | CORE |

Presupuesto por sección: rules: 30; core: 777; skill: 0; task_scope: 0; related: 6706; targets: 0; request: 44.

Ocupantes (metadatos deduplicados; los tokens del core se contabilizan por sección aunque un archivo también aparezca a L1+):

| Archivo | Nivel | Tokens |
|---|---|---:|
| vitest.config.ts | L2 | 169 |
| packages/catalog/src/index.ts | L2 | 99 |
| packages/users/src/index.ts | L2 | 96 |
| packages/cart/src/index.ts | L2 | 101 |
| packages/pricing/src/index.ts | L2 | 105 |
| packages/orders/src/index.ts | L1 | 112 |
| packages/ui/src/index.ts | L1 | 103 |
| packages/catalog/src/record-0.ts | L1 | 68 |
| packages/catalog/src/record-1.ts | L1 | 68 |
| packages/catalog/src/record-10.ts | L1 | 69 |
| packages/catalog/src/record-11.ts | L1 | 69 |
| packages/catalog/src/record-12.ts | L1 | 69 |
| packages/catalog/src/record-13.ts | L1 | 69 |
| packages/catalog/src/record-14.ts | L1 | 69 |
| packages/catalog/src/record-15.ts | L1 | 69 |
| packages/catalog/src/record-16.ts | L1 | 69 |
| packages/catalog/src/record-17.ts | L1 | 69 |
| packages/catalog/src/record-18.ts | L1 | 69 |
| packages/catalog/src/record-19.ts | L1 | 69 |
| packages/catalog/src/record-2.ts | L1 | 68 |
| packages/catalog/src/record-20.ts | L1 | 69 |
| packages/catalog/src/record-21.ts | L1 | 69 |
| packages/catalog/src/record-3.ts | L1 | 68 |
| packages/catalog/src/record-4.ts | L1 | 68 |
| packages/catalog/src/record-5.ts | L1 | 68 |
| packages/catalog/src/record-6.ts | L1 | 68 |
| packages/catalog/src/record-7.ts | L1 | 68 |
| packages/catalog/src/record-8.ts | L1 | 68 |
| packages/catalog/src/record-9.ts | L1 | 68 |
| packages/users/src/record-0.ts | L1 | 66 |
| packages/users/src/record-1.ts | L1 | 66 |
| packages/users/src/record-10.ts | L1 | 67 |
| packages/users/src/record-11.ts | L1 | 67 |
| packages/users/src/record-12.ts | L1 | 67 |
| packages/users/src/record-13.ts | L1 | 67 |
| packages/users/src/record-14.ts | L1 | 67 |
| packages/users/src/record-15.ts | L1 | 67 |
| packages/users/src/record-16.ts | L1 | 67 |
| packages/users/src/record-17.ts | L1 | 67 |
| packages/users/src/record-18.ts | L1 | 67 |
| packages/users/src/record-19.ts | L1 | 67 |
| packages/users/src/record-2.ts | L1 | 66 |
| packages/users/src/record-20.ts | L1 | 67 |
| packages/users/src/record-21.ts | L1 | 67 |
| packages/users/src/record-3.ts | L1 | 66 |
| packages/users/src/record-4.ts | L1 | 66 |
| packages/users/src/record-5.ts | L1 | 66 |
| packages/users/src/record-6.ts | L1 | 66 |
| packages/users/src/record-7.ts | L1 | 66 |
| packages/users/src/record-8.ts | L1 | 66 |
| packages/users/src/record-9.ts | L1 | 66 |
| packages/cart/src/inventoryAmount.ts | L1 | 73 |
| packages/catalog/src/stockValue.ts | L1 | 70 |
| packages/orders/src/orderTotal.ts | L1 | 65 |
| packages/orders/src/payableAmount.ts | L1 | 67 |
| packages/orders/src/staffAccess.ts | L1 | 66 |
| packages/pricing/src/netPrice.ts | L1 | 69 |
| packages/ui/src/receiptAmount.ts | L1 | 66 |
| packages/users/src/isAdmin.ts | L1 | 61 |
| packages/cart/src/record-0.ts | L1 | 65 |
| packages/cart/src/record-1.ts | L1 | 65 |
| packages/cart/src/record-10.ts | L1 | 65 |
| packages/cart/src/record-11.ts | L1 | 65 |
| packages/cart/src/record-12.ts | L1 | 65 |
| packages/cart/src/record-13.ts | L1 | 65 |
| packages/cart/src/record-14.ts | L1 | 65 |
| packages/cart/src/record-15.ts | L1 | 65 |
| packages/cart/src/record-16.ts | L1 | 65 |
| packages/cart/src/record-17.ts | L1 | 65 |
| packages/cart/src/record-18.ts | L1 | 65 |
| packages/cart/src/record-19.ts | L1 | 65 |
| packages/cart/src/record-2.ts | L1 | 65 |
| packages/cart/src/record-20.ts | L1 | 65 |
| packages/cart/src/record-21.ts | L1 | 65 |
| packages/cart/src/record-3.ts | L1 | 65 |
| packages/cart/src/record-4.ts | L1 | 65 |
| packages/cart/src/record-5.ts | L1 | 65 |
| packages/cart/src/record-6.ts | L1 | 65 |
| packages/cart/src/record-7.ts | L1 | 65 |
| packages/cart/src/record-8.ts | L1 | 65 |
| packages/cart/src/record-9.ts | L1 | 65 |
| packages/pricing/src/record-0.ts | L1 | 68 |
| packages/pricing/src/record-1.ts | L1 | 68 |
| packages/pricing/src/record-10.ts | L1 | 69 |
| packages/pricing/src/record-11.ts | L1 | 69 |
| packages/pricing/src/record-12.ts | L1 | 69 |
| packages/pricing/src/record-13.ts | L1 | 69 |
| packages/pricing/src/record-14.ts | L1 | 69 |
| packages/pricing/src/record-15.ts | L1 | 69 |
| packages/pricing/src/record-16.ts | L1 | 69 |
| packages/pricing/src/record-17.ts | L1 | 69 |
| packages/pricing/src/record-18.ts | L1 | 69 |
| packages/pricing/src/record-19.ts | L1 | 69 |
| packages/pricing/src/record-2.ts | L1 | 68 |
| packages/pricing/src/record-20.ts | L1 | 69 |
| packages/catalog/src/baseline.test.ts | L1 | 54 |

## a-14 (fixture-a)

Recall 0.500; precisión 0.010; usados 7557.

| Archivo gold ausente | Tipo | Causa | Semillado | Posición | Score | Razones |
|---|---|---|---|---:|---:|---|
| packages/ui/src/basketCaption.ts | modified | BUDGET (fuera de los 20 descartes publicados) | no | 304 | 0.000442170973 | CORE |

Presupuesto por sección: rules: 30; core: 777; skill: 0; task_scope: 0; related: 6710; targets: 0; request: 40.

Ocupantes (metadatos deduplicados; los tokens del core se contabilizan por sección aunque un archivo también aparezca a L1+):

| Archivo | Nivel | Tokens |
|---|---|---:|
| packages/catalog/src/isPositiveQuantity.ts | L2 | 98 |
| packages/ui/src/itemLabel.ts | L2 | 90 |
| packages/catalog/src/index.ts | L2 | 99 |
| packages/users/src/index.ts | L2 | 96 |
| packages/cart/src/index.ts | L2 | 101 |
| packages/pricing/src/index.ts | L1 | 105 |
| packages/orders/src/index.ts | L1 | 112 |
| packages/ui/src/index.ts | L1 | 103 |
| packages/cart/src/cartWeight.ts | L1 | 69 |
| packages/catalog/src/record-0.ts | L1 | 68 |
| packages/catalog/src/record-1.ts | L1 | 68 |
| packages/catalog/src/record-10.ts | L1 | 69 |
| packages/catalog/src/record-11.ts | L1 | 69 |
| packages/catalog/src/record-12.ts | L1 | 69 |
| packages/catalog/src/record-13.ts | L1 | 69 |
| packages/catalog/src/record-14.ts | L1 | 69 |
| packages/catalog/src/record-15.ts | L1 | 69 |
| packages/catalog/src/record-16.ts | L1 | 69 |
| packages/catalog/src/record-17.ts | L1 | 69 |
| packages/catalog/src/record-18.ts | L1 | 69 |
| packages/catalog/src/record-19.ts | L1 | 69 |
| packages/catalog/src/record-2.ts | L1 | 68 |
| packages/catalog/src/record-20.ts | L1 | 69 |
| packages/catalog/src/record-21.ts | L1 | 69 |
| packages/catalog/src/record-3.ts | L1 | 68 |
| packages/catalog/src/record-4.ts | L1 | 68 |
| packages/catalog/src/record-5.ts | L1 | 68 |
| packages/catalog/src/record-6.ts | L1 | 68 |
| packages/catalog/src/record-7.ts | L1 | 68 |
| packages/catalog/src/record-8.ts | L1 | 68 |
| packages/catalog/src/record-9.ts | L1 | 68 |
| packages/users/src/record-0.ts | L1 | 66 |
| packages/users/src/record-1.ts | L1 | 66 |
| packages/users/src/record-10.ts | L1 | 67 |
| packages/users/src/record-11.ts | L1 | 67 |
| packages/users/src/record-12.ts | L1 | 67 |
| packages/users/src/record-13.ts | L1 | 67 |
| packages/users/src/record-14.ts | L1 | 67 |
| packages/users/src/record-15.ts | L1 | 67 |
| packages/users/src/record-16.ts | L1 | 67 |
| packages/users/src/record-17.ts | L1 | 67 |
| packages/users/src/record-18.ts | L1 | 67 |
| packages/users/src/record-19.ts | L1 | 67 |
| packages/users/src/record-2.ts | L1 | 66 |
| packages/users/src/record-20.ts | L1 | 67 |
| packages/users/src/record-21.ts | L1 | 67 |
| packages/users/src/record-3.ts | L1 | 66 |
| packages/users/src/record-4.ts | L1 | 66 |
| packages/users/src/record-5.ts | L1 | 66 |
| packages/users/src/record-6.ts | L1 | 66 |
| packages/users/src/record-7.ts | L1 | 66 |
| packages/users/src/record-8.ts | L1 | 66 |
| packages/users/src/record-9.ts | L1 | 66 |
| packages/cart/src/inventoryAmount.ts | L1 | 73 |
| packages/catalog/src/stockValue.ts | L1 | 70 |
| packages/orders/src/orderTotal.ts | L1 | 65 |
| packages/orders/src/payableAmount.ts | L1 | 67 |
| packages/orders/src/staffAccess.ts | L1 | 66 |
| packages/pricing/src/netPrice.ts | L1 | 69 |
| packages/ui/src/receiptAmount.ts | L1 | 66 |
| packages/users/src/isAdmin.ts | L1 | 61 |
| packages/cart/src/record-0.ts | L1 | 65 |
| packages/cart/src/record-1.ts | L1 | 65 |
| packages/cart/src/record-10.ts | L1 | 65 |
| packages/cart/src/record-11.ts | L1 | 65 |
| packages/cart/src/record-12.ts | L1 | 65 |
| packages/cart/src/record-13.ts | L1 | 65 |
| packages/cart/src/record-14.ts | L1 | 65 |
| packages/cart/src/record-15.ts | L1 | 65 |
| packages/cart/src/record-16.ts | L1 | 65 |
| packages/cart/src/record-17.ts | L1 | 65 |
| packages/cart/src/record-18.ts | L1 | 65 |
| packages/cart/src/record-19.ts | L1 | 65 |
| packages/cart/src/record-2.ts | L1 | 65 |
| packages/cart/src/record-20.ts | L1 | 65 |
| packages/cart/src/record-21.ts | L1 | 65 |
| packages/cart/src/record-3.ts | L1 | 65 |
| packages/cart/src/record-4.ts | L1 | 65 |
| packages/cart/src/record-5.ts | L1 | 65 |
| packages/cart/src/record-6.ts | L1 | 65 |
| packages/cart/src/record-7.ts | L1 | 65 |
| packages/cart/src/record-8.ts | L1 | 65 |
| packages/cart/src/record-9.ts | L1 | 65 |
| packages/pricing/src/record-0.ts | L1 | 68 |
| packages/pricing/src/record-1.ts | L1 | 68 |
| packages/pricing/src/record-10.ts | L1 | 69 |
| packages/pricing/src/record-11.ts | L1 | 69 |
| packages/pricing/src/record-12.ts | L1 | 69 |
| packages/pricing/src/record-13.ts | L1 | 69 |
| packages/pricing/src/record-14.ts | L1 | 69 |
| packages/pricing/src/record-15.ts | L1 | 69 |
| packages/pricing/src/record-16.ts | L1 | 69 |
| packages/pricing/src/record-17.ts | L1 | 69 |
| packages/pricing/src/record-18.ts | L1 | 69 |
| packages/pricing/src/record-19.ts | L1 | 69 |
| packages/pricing/src/record-2.ts | L1 | 68 |
| scripts/lint.mjs | L1 | 41 |

## a-15 (fixture-a)

Recall 0.667; precisión 0.021; usados 7551.

| Archivo gold ausente | Tipo | Causa | Semillado | Posición | Score | Razones |
|---|---|---|---|---:|---:|---|
| packages/catalog/src/moneyPolicy.ts | modified | ausente del mapa (no recuperable con parámetros) | no | — | — | — |

Presupuesto por sección: rules: 30; core: 777; skill: 0; task_scope: 0; related: 6684; targets: 0; request: 60.

Ocupantes (metadatos deduplicados; los tokens del core se contabilizan por sección aunque un archivo también aparezca a L1+):

| Archivo | Nivel | Tokens |
|---|---|---:|
| packages/catalog/src/stockValue.ts | L2 | 120 |
| packages/cart/src/inventoryAmount.ts | L2 | 108 |
| packages/orders/src/orderTotal.ts | L2 | 100 |
| packages/ui/src/receiptAmount.ts | L2 | 100 |
| packages/catalog/src/index.ts | L2 | 99 |
| packages/cart/src/index.ts | L1 | 101 |
| packages/orders/src/index.ts | L1 | 112 |
| packages/users/src/index.ts | L1 | 96 |
| packages/pricing/src/index.ts | L1 | 105 |
| packages/ui/src/index.ts | L1 | 103 |
| packages/orders/src/payableAmount.ts | L1 | 71 |
| packages/orders/src/staffAccess.ts | L1 | 69 |
| packages/catalog/src/inStock.ts | L1 | 70 |
| packages/pricing/src/netPrice.ts | L1 | 83 |
| packages/users/src/isAdmin.ts | L1 | 75 |
| packages/catalog/src/policy-1.ts | L1 | 66 |
| packages/ui/src/formatPrice.ts | L1 | 65 |
| packages/pricing/src/discount.ts | L1 | 66 |
| packages/cart/src/remainingQuantity.ts | L1 | 76 |
| packages/pricing/src/shippingCost.ts | L1 | 71 |
| packages/users/src/normalizeEmail.ts | L1 | 73 |
| packages/cart/src/policy-7.ts | L1 | 73 |
| packages/ui/src/deliveryLink.ts | L1 | 66 |
| packages/orders/src/parcelWeight.ts | L1 | 71 |
| packages/ui/src/basketCaption.ts | L1 | 68 |
| packages/orders/src/checkoutTax.ts | L1 | 74 |
| packages/orders/src/customerLabel.ts | L1 | 75 |
| packages/ui/src/referenceSearch.ts | L1 | 74 |
| packages/catalog/src/record-0.ts | L1 | 68 |
| packages/catalog/src/record-1.ts | L1 | 68 |
| packages/catalog/src/record-10.ts | L1 | 69 |
| packages/catalog/src/record-11.ts | L1 | 69 |
| packages/catalog/src/record-12.ts | L1 | 69 |
| packages/catalog/src/record-13.ts | L1 | 69 |
| packages/catalog/src/record-14.ts | L1 | 69 |
| packages/catalog/src/record-15.ts | L1 | 69 |
| packages/catalog/src/record-16.ts | L1 | 69 |
| packages/catalog/src/record-17.ts | L1 | 69 |
| packages/catalog/src/record-18.ts | L1 | 69 |
| packages/catalog/src/record-19.ts | L1 | 69 |
| packages/catalog/src/record-2.ts | L1 | 68 |
| packages/catalog/src/record-20.ts | L1 | 69 |
| packages/catalog/src/record-21.ts | L1 | 69 |
| packages/catalog/src/record-3.ts | L1 | 68 |
| packages/catalog/src/record-4.ts | L1 | 68 |
| packages/catalog/src/record-5.ts | L1 | 68 |
| packages/catalog/src/record-6.ts | L1 | 68 |
| packages/catalog/src/record-7.ts | L1 | 68 |
| packages/catalog/src/record-8.ts | L1 | 68 |
| packages/catalog/src/record-9.ts | L1 | 68 |
| packages/users/src/record-0.ts | L1 | 66 |
| packages/users/src/record-1.ts | L1 | 66 |
| packages/users/src/record-10.ts | L1 | 67 |
| packages/users/src/record-11.ts | L1 | 67 |
| packages/users/src/record-12.ts | L1 | 67 |
| packages/users/src/record-13.ts | L1 | 67 |
| packages/users/src/record-14.ts | L1 | 67 |
| packages/users/src/record-15.ts | L1 | 67 |
| packages/users/src/record-16.ts | L1 | 67 |
| packages/users/src/record-17.ts | L1 | 67 |
| packages/users/src/record-18.ts | L1 | 67 |
| packages/users/src/record-19.ts | L1 | 67 |
| packages/users/src/record-2.ts | L1 | 66 |
| packages/users/src/record-20.ts | L1 | 67 |
| packages/users/src/record-21.ts | L1 | 67 |
| packages/users/src/record-3.ts | L1 | 66 |
| packages/users/src/record-4.ts | L1 | 66 |
| packages/users/src/record-5.ts | L1 | 66 |
| packages/users/src/record-6.ts | L1 | 66 |
| packages/users/src/record-7.ts | L1 | 66 |
| packages/users/src/record-8.ts | L1 | 66 |
| packages/users/src/record-9.ts | L1 | 66 |
| packages/cart/src/record-0.ts | L1 | 65 |
| packages/cart/src/record-1.ts | L1 | 65 |
| packages/cart/src/record-10.ts | L1 | 65 |
| packages/cart/src/record-11.ts | L1 | 65 |
| packages/cart/src/record-12.ts | L1 | 65 |
| packages/cart/src/record-13.ts | L1 | 65 |
| packages/cart/src/record-14.ts | L1 | 65 |
| packages/cart/src/record-15.ts | L1 | 65 |
| packages/cart/src/record-16.ts | L1 | 65 |
| packages/cart/src/record-17.ts | L1 | 65 |
| packages/cart/src/record-18.ts | L1 | 65 |
| packages/cart/src/record-19.ts | L1 | 65 |
| packages/cart/src/record-2.ts | L1 | 65 |
| packages/cart/src/record-20.ts | L1 | 65 |
| packages/cart/src/record-21.ts | L1 | 65 |
| packages/cart/src/record-3.ts | L1 | 65 |
| packages/cart/src/record-4.ts | L1 | 65 |
| packages/cart/src/record-5.ts | L1 | 65 |
| packages/cart/src/record-6.ts | L1 | 65 |
| packages/cart/src/record-7.ts | L1 | 65 |
| packages/cart/src/record-8.ts | L1 | 65 |
| packages/catalog/src/baseline.test.ts | L1 | 54 |

## a-16 (fixture-a)

Recall 0.667; precisión 0.022; usados 7525.

| Archivo gold ausente | Tipo | Causa | Semillado | Posición | Score | Razones |
|---|---|---|---|---:|---:|---|
| packages/pricing/src/moneyPolicy.ts | modified | ausente del mapa (no recuperable con parámetros) | no | — | — | — |

Presupuesto por sección: rules: 30; core: 777; skill: 0; task_scope: 0; related: 6658; targets: 0; request: 60.

Ocupantes (metadatos deduplicados; los tokens del core se contabilizan por sección aunque un archivo también aparezca a L1+):

| Archivo | Nivel | Tokens |
|---|---|---:|
| packages/pricing/src/netPrice.ts | L2 | 113 |
| packages/orders/src/payableAmount.ts | L2 | 101 |
| packages/cart/src/inventoryAmount.ts | L2 | 113 |
| packages/catalog/src/stockValue.ts | L2 | 102 |
| packages/orders/src/orderTotal.ts | L2 | 100 |
| packages/ui/src/receiptAmount.ts | L1 | 85 |
| packages/catalog/src/index.ts | L1 | 99 |
| packages/cart/src/index.ts | L1 | 101 |
| packages/orders/src/index.ts | L1 | 112 |
| packages/users/src/index.ts | L1 | 96 |
| packages/pricing/src/index.ts | L1 | 105 |
| packages/ui/src/index.ts | L1 | 103 |
| packages/orders/src/staffAccess.ts | L1 | 69 |
| packages/ui/src/formatPrice.ts | L1 | 71 |
| packages/users/src/isAdmin.ts | L1 | 75 |
| packages/catalog/src/inStock.ts | L1 | 65 |
| packages/pricing/src/discount.ts | L1 | 66 |
| packages/cart/src/remainingQuantity.ts | L1 | 76 |
| packages/pricing/src/shippingCost.ts | L1 | 71 |
| packages/users/src/normalizeEmail.ts | L1 | 73 |
| packages/cart/src/lineTotal.ts | L1 | 70 |
| packages/ui/src/deliveryLink.ts | L1 | 66 |
| packages/orders/src/parcelWeight.ts | L1 | 71 |
| packages/ui/src/basketCaption.ts | L1 | 68 |
| packages/orders/src/checkoutTax.ts | L1 | 74 |
| packages/orders/src/customerLabel.ts | L1 | 75 |
| packages/ui/src/referenceSearch.ts | L1 | 74 |
| packages/catalog/src/record-0.ts | L1 | 68 |
| packages/catalog/src/record-1.ts | L1 | 68 |
| packages/catalog/src/record-10.ts | L1 | 69 |
| packages/catalog/src/record-11.ts | L1 | 69 |
| packages/catalog/src/record-12.ts | L1 | 69 |
| packages/catalog/src/record-13.ts | L1 | 69 |
| packages/catalog/src/record-14.ts | L1 | 69 |
| packages/catalog/src/record-15.ts | L1 | 69 |
| packages/catalog/src/record-16.ts | L1 | 69 |
| packages/catalog/src/record-17.ts | L1 | 69 |
| packages/catalog/src/record-18.ts | L1 | 69 |
| packages/catalog/src/record-19.ts | L1 | 69 |
| packages/catalog/src/record-2.ts | L1 | 68 |
| packages/catalog/src/record-20.ts | L1 | 69 |
| packages/catalog/src/record-21.ts | L1 | 69 |
| packages/catalog/src/record-3.ts | L1 | 68 |
| packages/catalog/src/record-4.ts | L1 | 68 |
| packages/catalog/src/record-5.ts | L1 | 68 |
| packages/catalog/src/record-6.ts | L1 | 68 |
| packages/catalog/src/record-7.ts | L1 | 68 |
| packages/catalog/src/record-8.ts | L1 | 68 |
| packages/catalog/src/record-9.ts | L1 | 68 |
| packages/users/src/record-0.ts | L1 | 66 |
| packages/users/src/record-1.ts | L1 | 66 |
| packages/users/src/record-10.ts | L1 | 67 |
| packages/users/src/record-11.ts | L1 | 67 |
| packages/users/src/record-12.ts | L1 | 67 |
| packages/users/src/record-13.ts | L1 | 67 |
| packages/users/src/record-14.ts | L1 | 67 |
| packages/users/src/record-15.ts | L1 | 67 |
| packages/users/src/record-16.ts | L1 | 67 |
| packages/users/src/record-17.ts | L1 | 67 |
| packages/users/src/record-18.ts | L1 | 67 |
| packages/users/src/record-19.ts | L1 | 67 |
| packages/users/src/record-2.ts | L1 | 66 |
| packages/users/src/record-20.ts | L1 | 67 |
| packages/users/src/record-21.ts | L1 | 67 |
| packages/users/src/record-3.ts | L1 | 66 |
| packages/users/src/record-4.ts | L1 | 66 |
| packages/users/src/record-5.ts | L1 | 66 |
| packages/users/src/record-6.ts | L1 | 66 |
| packages/users/src/record-7.ts | L1 | 66 |
| packages/users/src/record-8.ts | L1 | 66 |
| packages/users/src/record-9.ts | L1 | 66 |
| packages/cart/src/record-0.ts | L1 | 65 |
| packages/cart/src/record-1.ts | L1 | 65 |
| packages/cart/src/record-10.ts | L1 | 65 |
| packages/cart/src/record-11.ts | L1 | 65 |
| packages/cart/src/record-12.ts | L1 | 65 |
| packages/cart/src/record-13.ts | L1 | 65 |
| packages/cart/src/record-14.ts | L1 | 65 |
| packages/cart/src/record-15.ts | L1 | 65 |
| packages/cart/src/record-16.ts | L1 | 65 |
| packages/cart/src/record-17.ts | L1 | 65 |
| packages/cart/src/record-18.ts | L1 | 65 |
| packages/cart/src/record-19.ts | L1 | 65 |
| packages/cart/src/record-2.ts | L1 | 65 |
| packages/cart/src/record-20.ts | L1 | 65 |
| packages/cart/src/record-21.ts | L1 | 65 |
| packages/cart/src/record-3.ts | L1 | 65 |
| packages/cart/src/record-4.ts | L1 | 65 |
| packages/cart/src/record-5.ts | L1 | 65 |
| packages/cart/src/record-6.ts | L1 | 65 |
| packages/cart/src/record-7.ts | L1 | 65 |
| packages/cart/src/record-8.ts | L1 | 65 |
| packages/cart/src/record-9.ts | L1 | 65 |

## a-17 (fixture-a)

Recall 0.667; precisión 0.021; usados 7549.

| Archivo gold ausente | Tipo | Causa | Semillado | Posición | Score | Razones |
|---|---|---|---|---:|---:|---|
| packages/users/src/accessPolicy.ts | modified | ausente del mapa (no recuperable con parámetros) | no | — | — | — |

Presupuesto por sección: rules: 30; core: 777; skill: 0; task_scope: 0; related: 6685; targets: 0; request: 57.

Ocupantes (metadatos deduplicados; los tokens del core se contabilizan por sección aunque un archivo también aparezca a L1+):

| Archivo | Nivel | Tokens |
|---|---|---:|
| packages/users/src/isAdmin.ts | L2 | 118 |
| packages/orders/src/staffAccess.ts | L2 | 99 |
| packages/catalog/src/index.ts | L2 | 99 |
| packages/cart/src/index.ts | L2 | 101 |
| packages/orders/src/index.ts | L2 | 112 |
| packages/users/src/index.ts | L1 | 96 |
| packages/pricing/src/index.ts | L1 | 105 |
| packages/ui/src/index.ts | L1 | 103 |
| packages/orders/src/payableAmount.ts | L1 | 71 |
| packages/ui/src/receiptAmount.ts | L1 | 69 |
| packages/cart/src/inventoryAmount.ts | L1 | 77 |
| packages/orders/src/orderTotal.ts | L1 | 79 |
| packages/pricing/src/netPrice.ts | L1 | 83 |
| packages/catalog/src/stockValue.ts | L1 | 85 |
| packages/catalog/src/policy-1.ts | L1 | 67 |
| packages/orders/src/canCancel.ts | L1 | 67 |
| packages/catalog/src/inStock.ts | L1 | 65 |
| packages/pricing/src/discount.ts | L1 | 66 |
| packages/catalog/src/skuMatches.ts | L1 | 73 |
| packages/cart/src/remainingQuantity.ts | L1 | 76 |
| packages/pricing/src/shippingCost.ts | L1 | 71 |
| packages/users/src/normalizeEmail.ts | L1 | 73 |
| packages/ui/src/deliveryLink.ts | L1 | 66 |
| packages/orders/src/parcelWeight.ts | L1 | 71 |
| packages/ui/src/basketCaption.ts | L1 | 68 |
| packages/orders/src/checkoutTax.ts | L1 | 74 |
| packages/orders/src/customerLabel.ts | L1 | 75 |
| packages/ui/src/referenceSearch.ts | L1 | 74 |
| packages/catalog/src/record-0.ts | L1 | 68 |
| packages/catalog/src/record-1.ts | L1 | 68 |
| packages/catalog/src/record-10.ts | L1 | 69 |
| packages/catalog/src/record-11.ts | L1 | 69 |
| packages/catalog/src/record-12.ts | L1 | 69 |
| packages/catalog/src/record-13.ts | L1 | 69 |
| packages/catalog/src/record-14.ts | L1 | 69 |
| packages/catalog/src/record-15.ts | L1 | 69 |
| packages/catalog/src/record-16.ts | L1 | 69 |
| packages/catalog/src/record-17.ts | L1 | 69 |
| packages/catalog/src/record-18.ts | L1 | 69 |
| packages/catalog/src/record-19.ts | L1 | 69 |
| packages/catalog/src/record-2.ts | L1 | 68 |
| packages/catalog/src/record-20.ts | L1 | 69 |
| packages/catalog/src/record-21.ts | L1 | 69 |
| packages/catalog/src/record-3.ts | L1 | 68 |
| packages/catalog/src/record-4.ts | L1 | 68 |
| packages/catalog/src/record-5.ts | L1 | 68 |
| packages/catalog/src/record-6.ts | L1 | 68 |
| packages/catalog/src/record-7.ts | L1 | 68 |
| packages/catalog/src/record-8.ts | L1 | 68 |
| packages/catalog/src/record-9.ts | L1 | 68 |
| packages/users/src/record-0.ts | L1 | 66 |
| packages/users/src/record-1.ts | L1 | 66 |
| packages/users/src/record-10.ts | L1 | 67 |
| packages/users/src/record-11.ts | L1 | 67 |
| packages/users/src/record-12.ts | L1 | 67 |
| packages/users/src/record-13.ts | L1 | 67 |
| packages/users/src/record-14.ts | L1 | 67 |
| packages/users/src/record-15.ts | L1 | 67 |
| packages/users/src/record-16.ts | L1 | 67 |
| packages/users/src/record-17.ts | L1 | 67 |
| packages/users/src/record-18.ts | L1 | 67 |
| packages/users/src/record-19.ts | L1 | 67 |
| packages/users/src/record-2.ts | L1 | 66 |
| packages/users/src/record-20.ts | L1 | 67 |
| packages/users/src/record-21.ts | L1 | 67 |
| packages/users/src/record-3.ts | L1 | 66 |
| packages/users/src/record-4.ts | L1 | 66 |
| packages/users/src/record-5.ts | L1 | 66 |
| packages/users/src/record-6.ts | L1 | 66 |
| packages/users/src/record-7.ts | L1 | 66 |
| packages/users/src/record-8.ts | L1 | 66 |
| packages/users/src/record-9.ts | L1 | 66 |
| packages/cart/src/record-0.ts | L1 | 65 |
| packages/cart/src/record-1.ts | L1 | 65 |
| packages/cart/src/record-10.ts | L1 | 65 |
| packages/cart/src/record-11.ts | L1 | 65 |
| packages/cart/src/record-12.ts | L1 | 65 |
| packages/cart/src/record-13.ts | L1 | 65 |
| packages/cart/src/record-14.ts | L1 | 65 |
| packages/cart/src/record-15.ts | L1 | 65 |
| packages/cart/src/record-16.ts | L1 | 65 |
| packages/cart/src/record-17.ts | L1 | 65 |
| packages/cart/src/record-18.ts | L1 | 65 |
| packages/cart/src/record-19.ts | L1 | 65 |
| packages/cart/src/record-2.ts | L1 | 65 |
| packages/cart/src/record-20.ts | L1 | 65 |
| packages/cart/src/record-21.ts | L1 | 65 |
| packages/cart/src/record-3.ts | L1 | 65 |
| packages/cart/src/record-4.ts | L1 | 65 |
| packages/cart/src/record-5.ts | L1 | 65 |
| packages/cart/src/record-6.ts | L1 | 65 |
| packages/cart/src/record-7.ts | L1 | 65 |
| packages/cart/src/record-8.ts | L1 | 65 |
| packages/cart/src/record-9.ts | L1 | 65 |
| scripts/lint.mjs | L1 | 41 |

## a-18 (fixture-a)

Recall 0.667; precisión 0.021; usados 7554.

| Archivo gold ausente | Tipo | Causa | Semillado | Posición | Score | Razones |
|---|---|---|---|---:|---:|---|
| packages/orders/src/moneyPolicy.ts | modified | ausente del mapa (no recuperable con parámetros) | no | — | — | — |

Presupuesto por sección: rules: 30; core: 777; skill: 0; task_scope: 0; related: 6692; targets: 0; request: 55.

Ocupantes (metadatos deduplicados; los tokens del core se contabilizan por sección aunque un archivo también aparezca a L1+):

| Archivo | Nivel | Tokens |
|---|---|---:|
| packages/orders/src/orderTotal.ts | L2 | 116 |
| packages/ui/src/receiptAmount.ts | L2 | 100 |
| packages/catalog/src/index.ts | L2 | 99 |
| packages/cart/src/index.ts | L2 | 101 |
| packages/orders/src/index.ts | L2 | 112 |
| packages/users/src/index.ts | L1 | 96 |
| packages/pricing/src/index.ts | L1 | 105 |
| packages/ui/src/index.ts | L1 | 103 |
| packages/orders/src/payableAmount.ts | L1 | 71 |
| packages/orders/src/staffAccess.ts | L1 | 69 |
| packages/cart/src/inventoryAmount.ts | L1 | 77 |
| packages/pricing/src/netPrice.ts | L1 | 83 |
| packages/users/src/isAdmin.ts | L1 | 75 |
| packages/catalog/src/stockValue.ts | L1 | 85 |
| packages/cart/src/lineTotal.ts | L1 | 70 |
| packages/ui/src/formatPrice.ts | L1 | 65 |
| packages/catalog/src/inStock.ts | L1 | 65 |
| packages/pricing/src/discount.ts | L1 | 66 |
| packages/cart/src/remainingQuantity.ts | L1 | 76 |
| packages/pricing/src/shippingCost.ts | L1 | 71 |
| packages/users/src/normalizeEmail.ts | L1 | 73 |
| packages/ui/src/deliveryLink.ts | L1 | 66 |
| packages/orders/src/parcelWeight.ts | L1 | 71 |
| packages/ui/src/basketCaption.ts | L1 | 68 |
| packages/orders/src/checkoutTax.ts | L1 | 74 |
| packages/orders/src/customerLabel.ts | L1 | 75 |
| packages/ui/src/referenceSearch.ts | L1 | 74 |
| packages/catalog/src/record-0.ts | L1 | 68 |
| packages/catalog/src/record-1.ts | L1 | 68 |
| packages/catalog/src/record-10.ts | L1 | 69 |
| packages/catalog/src/record-11.ts | L1 | 69 |
| packages/catalog/src/record-12.ts | L1 | 69 |
| packages/catalog/src/record-13.ts | L1 | 69 |
| packages/catalog/src/record-14.ts | L1 | 69 |
| packages/catalog/src/record-15.ts | L1 | 69 |
| packages/catalog/src/record-16.ts | L1 | 69 |
| packages/catalog/src/record-17.ts | L1 | 69 |
| packages/catalog/src/record-18.ts | L1 | 69 |
| packages/catalog/src/record-19.ts | L1 | 69 |
| packages/catalog/src/record-2.ts | L1 | 68 |
| packages/catalog/src/record-20.ts | L1 | 69 |
| packages/catalog/src/record-21.ts | L1 | 69 |
| packages/catalog/src/record-3.ts | L1 | 68 |
| packages/catalog/src/record-4.ts | L1 | 68 |
| packages/catalog/src/record-5.ts | L1 | 68 |
| packages/catalog/src/record-6.ts | L1 | 68 |
| packages/catalog/src/record-7.ts | L1 | 68 |
| packages/catalog/src/record-8.ts | L1 | 68 |
| packages/catalog/src/record-9.ts | L1 | 68 |
| packages/users/src/record-0.ts | L1 | 66 |
| packages/users/src/record-1.ts | L1 | 66 |
| packages/users/src/record-10.ts | L1 | 67 |
| packages/users/src/record-11.ts | L1 | 67 |
| packages/users/src/record-12.ts | L1 | 67 |
| packages/users/src/record-13.ts | L1 | 67 |
| packages/users/src/record-14.ts | L1 | 67 |
| packages/users/src/record-15.ts | L1 | 67 |
| packages/users/src/record-16.ts | L1 | 67 |
| packages/users/src/record-17.ts | L1 | 67 |
| packages/users/src/record-18.ts | L1 | 67 |
| packages/users/src/record-19.ts | L1 | 67 |
| packages/users/src/record-2.ts | L1 | 66 |
| packages/users/src/record-20.ts | L1 | 67 |
| packages/users/src/record-21.ts | L1 | 67 |
| packages/users/src/record-3.ts | L1 | 66 |
| packages/users/src/record-4.ts | L1 | 66 |
| packages/users/src/record-5.ts | L1 | 66 |
| packages/users/src/record-6.ts | L1 | 66 |
| packages/users/src/record-7.ts | L1 | 66 |
| packages/users/src/record-8.ts | L1 | 66 |
| packages/users/src/record-9.ts | L1 | 66 |
| packages/cart/src/record-0.ts | L1 | 65 |
| packages/cart/src/record-1.ts | L1 | 65 |
| packages/cart/src/record-10.ts | L1 | 65 |
| packages/cart/src/record-11.ts | L1 | 65 |
| packages/cart/src/record-12.ts | L1 | 65 |
| packages/cart/src/record-13.ts | L1 | 65 |
| packages/cart/src/record-14.ts | L1 | 65 |
| packages/cart/src/record-15.ts | L1 | 65 |
| packages/cart/src/record-16.ts | L1 | 65 |
| packages/cart/src/record-17.ts | L1 | 65 |
| packages/cart/src/record-18.ts | L1 | 65 |
| packages/cart/src/record-19.ts | L1 | 65 |
| packages/cart/src/record-2.ts | L1 | 65 |
| packages/cart/src/record-20.ts | L1 | 65 |
| packages/cart/src/record-21.ts | L1 | 65 |
| packages/cart/src/record-3.ts | L1 | 65 |
| packages/cart/src/record-4.ts | L1 | 65 |
| packages/cart/src/record-5.ts | L1 | 65 |
| packages/cart/src/record-6.ts | L1 | 65 |
| packages/cart/src/record-7.ts | L1 | 65 |
| packages/cart/src/record-8.ts | L1 | 65 |
| packages/cart/src/record-9.ts | L1 | 65 |
| packages/pricing/src/record-0.ts | L1 | 68 |
| packages/catalog/src/baseline.test.ts | L1 | 54 |

## a-19 (fixture-a)

Recall 0.000; precisión 0.000; usados 7560.

| Archivo gold ausente | Tipo | Causa | Semillado | Posición | Score | Razones |
|---|---|---|---|---:|---:|---|
| packages/catalog/src/isPositiveQuantity.test.ts | modified | ausente del mapa (no recuperable con parámetros) | no | — | — | — |
| packages/catalog/src/isPositiveQuantity.ts | modified | BUDGET (fuera de los 20 descartes publicados) | no | 290 | 0.000442170973 | CORE |

Presupuesto por sección: rules: 30; core: 777; skill: 0; task_scope: 0; related: 6698; targets: 0; request: 55.

Ocupantes (metadatos deduplicados; los tokens del core se contabilizan por sección aunque un archivo también aparezca a L1+):

| Archivo | Nivel | Tokens |
|---|---|---:|
| packages/cart/src/policy-7.ts | L2 | 92 |
| packages/catalog/src/index.ts | L2 | 99 |
| packages/users/src/index.ts | L2 | 96 |
| packages/cart/src/index.ts | L2 | 101 |
| packages/pricing/src/index.ts | L2 | 105 |
| packages/orders/src/index.ts | L1 | 112 |
| packages/ui/src/index.ts | L1 | 103 |
| packages/catalog/src/record-0.ts | L1 | 68 |
| packages/catalog/src/record-1.ts | L1 | 68 |
| packages/catalog/src/record-10.ts | L1 | 69 |
| packages/catalog/src/record-11.ts | L1 | 69 |
| packages/catalog/src/record-12.ts | L1 | 69 |
| packages/catalog/src/record-13.ts | L1 | 69 |
| packages/catalog/src/record-14.ts | L1 | 69 |
| packages/catalog/src/record-15.ts | L1 | 69 |
| packages/catalog/src/record-16.ts | L1 | 69 |
| packages/catalog/src/record-17.ts | L1 | 69 |
| packages/catalog/src/record-18.ts | L1 | 69 |
| packages/catalog/src/record-19.ts | L1 | 69 |
| packages/catalog/src/record-2.ts | L1 | 68 |
| packages/catalog/src/record-20.ts | L1 | 69 |
| packages/catalog/src/record-21.ts | L1 | 69 |
| packages/catalog/src/record-3.ts | L1 | 68 |
| packages/catalog/src/record-4.ts | L1 | 68 |
| packages/catalog/src/record-5.ts | L1 | 68 |
| packages/catalog/src/record-6.ts | L1 | 68 |
| packages/catalog/src/record-7.ts | L1 | 68 |
| packages/catalog/src/record-8.ts | L1 | 68 |
| packages/catalog/src/record-9.ts | L1 | 68 |
| packages/users/src/record-0.ts | L1 | 66 |
| packages/users/src/record-1.ts | L1 | 66 |
| packages/users/src/record-10.ts | L1 | 67 |
| packages/users/src/record-11.ts | L1 | 67 |
| packages/users/src/record-12.ts | L1 | 67 |
| packages/users/src/record-13.ts | L1 | 67 |
| packages/users/src/record-14.ts | L1 | 67 |
| packages/users/src/record-15.ts | L1 | 67 |
| packages/users/src/record-16.ts | L1 | 67 |
| packages/users/src/record-17.ts | L1 | 67 |
| packages/users/src/record-18.ts | L1 | 67 |
| packages/users/src/record-19.ts | L1 | 67 |
| packages/users/src/record-2.ts | L1 | 66 |
| packages/users/src/record-20.ts | L1 | 67 |
| packages/users/src/record-21.ts | L1 | 67 |
| packages/users/src/record-3.ts | L1 | 66 |
| packages/users/src/record-4.ts | L1 | 66 |
| packages/users/src/record-5.ts | L1 | 66 |
| packages/users/src/record-6.ts | L1 | 66 |
| packages/users/src/record-7.ts | L1 | 66 |
| packages/users/src/record-8.ts | L1 | 66 |
| packages/users/src/record-9.ts | L1 | 66 |
| packages/cart/src/inventoryAmount.ts | L1 | 73 |
| packages/catalog/src/stockValue.ts | L1 | 70 |
| packages/orders/src/orderTotal.ts | L1 | 65 |
| packages/orders/src/payableAmount.ts | L1 | 67 |
| packages/orders/src/staffAccess.ts | L1 | 66 |
| packages/pricing/src/netPrice.ts | L1 | 69 |
| packages/ui/src/receiptAmount.ts | L1 | 66 |
| packages/users/src/isAdmin.ts | L1 | 61 |
| packages/cart/src/record-0.ts | L1 | 65 |
| packages/cart/src/record-1.ts | L1 | 65 |
| packages/cart/src/record-10.ts | L1 | 65 |
| packages/cart/src/record-11.ts | L1 | 65 |
| packages/cart/src/record-12.ts | L1 | 65 |
| packages/cart/src/record-13.ts | L1 | 65 |
| packages/cart/src/record-14.ts | L1 | 65 |
| packages/cart/src/record-15.ts | L1 | 65 |
| packages/cart/src/record-16.ts | L1 | 65 |
| packages/cart/src/record-17.ts | L1 | 65 |
| packages/cart/src/record-18.ts | L1 | 65 |
| packages/cart/src/record-19.ts | L1 | 65 |
| packages/cart/src/record-2.ts | L1 | 65 |
| packages/cart/src/record-20.ts | L1 | 65 |
| packages/cart/src/record-21.ts | L1 | 65 |
| packages/cart/src/record-3.ts | L1 | 65 |
| packages/cart/src/record-4.ts | L1 | 65 |
| packages/cart/src/record-5.ts | L1 | 65 |
| packages/cart/src/record-6.ts | L1 | 65 |
| packages/cart/src/record-7.ts | L1 | 65 |
| packages/cart/src/record-8.ts | L1 | 65 |
| packages/cart/src/record-9.ts | L1 | 65 |
| packages/pricing/src/record-0.ts | L1 | 68 |
| packages/pricing/src/record-1.ts | L1 | 68 |
| packages/pricing/src/record-10.ts | L1 | 69 |
| packages/pricing/src/record-11.ts | L1 | 69 |
| packages/pricing/src/record-12.ts | L1 | 69 |
| packages/pricing/src/record-13.ts | L1 | 69 |
| packages/pricing/src/record-14.ts | L1 | 69 |
| packages/pricing/src/record-15.ts | L1 | 69 |
| packages/pricing/src/record-16.ts | L1 | 69 |
| packages/pricing/src/record-17.ts | L1 | 69 |
| packages/pricing/src/record-18.ts | L1 | 69 |
| packages/pricing/src/record-19.ts | L1 | 69 |
| packages/pricing/src/record-2.ts | L1 | 68 |
| packages/pricing/src/record-20.ts | L1 | 69 |
| packages/pricing/src/record-21.ts | L1 | 69 |
| packages/catalog/src/baseline.test.ts | L1 | 54 |

## a-20 (fixture-a)

Recall 0.000; precisión 0.000; usados 7552.

| Archivo gold ausente | Tipo | Causa | Semillado | Posición | Score | Razones |
|---|---|---|---|---:|---:|---|
| packages/users/src/isValidEmail.test.ts | modified | ausente del mapa (no recuperable con parámetros) | no | — | — | — |
| packages/users/src/isValidEmail.ts | modified | BUDGET (fuera de los 20 descartes publicados) | no | 309 | 0.000193978068 | CORE |

Presupuesto por sección: rules: 30; core: 777; skill: 0; task_scope: 0; related: 6693; targets: 0; request: 52.

Ocupantes (metadatos deduplicados; los tokens del core se contabilizan por sección aunque un archivo también aparezca a L1+):

| Archivo | Nivel | Tokens |
|---|---|---:|
| packages/catalog/src/index.ts | L2 | 99 |
| packages/cart/src/index.ts | L2 | 101 |
| packages/users/src/index.ts | L2 | 96 |
| packages/pricing/src/index.ts | L2 | 105 |
| packages/orders/src/index.ts | L2 | 112 |
| packages/ui/src/index.ts | L1 | 103 |
| packages/catalog/src/record-0.ts | L1 | 68 |
| packages/catalog/src/record-1.ts | L1 | 68 |
| packages/catalog/src/record-10.ts | L1 | 69 |
| packages/catalog/src/record-11.ts | L1 | 69 |
| packages/catalog/src/record-12.ts | L1 | 69 |
| packages/catalog/src/record-13.ts | L1 | 69 |
| packages/catalog/src/record-14.ts | L1 | 69 |
| packages/catalog/src/record-15.ts | L1 | 69 |
| packages/catalog/src/record-16.ts | L1 | 69 |
| packages/catalog/src/record-17.ts | L1 | 69 |
| packages/catalog/src/record-18.ts | L1 | 69 |
| packages/catalog/src/record-19.ts | L1 | 69 |
| packages/catalog/src/record-2.ts | L1 | 68 |
| packages/catalog/src/record-20.ts | L1 | 69 |
| packages/catalog/src/record-21.ts | L1 | 69 |
| packages/catalog/src/record-3.ts | L1 | 68 |
| packages/catalog/src/record-4.ts | L1 | 68 |
| packages/catalog/src/record-5.ts | L1 | 68 |
| packages/catalog/src/record-6.ts | L1 | 68 |
| packages/catalog/src/record-7.ts | L1 | 68 |
| packages/catalog/src/record-8.ts | L1 | 68 |
| packages/catalog/src/record-9.ts | L1 | 68 |
| packages/cart/src/record-0.ts | L1 | 65 |
| packages/cart/src/record-1.ts | L1 | 65 |
| packages/cart/src/record-10.ts | L1 | 65 |
| packages/cart/src/record-11.ts | L1 | 65 |
| packages/cart/src/record-12.ts | L1 | 65 |
| packages/cart/src/record-13.ts | L1 | 65 |
| packages/cart/src/record-14.ts | L1 | 65 |
| packages/cart/src/record-15.ts | L1 | 65 |
| packages/cart/src/record-16.ts | L1 | 65 |
| packages/cart/src/record-17.ts | L1 | 65 |
| packages/cart/src/record-18.ts | L1 | 65 |
| packages/cart/src/record-19.ts | L1 | 65 |
| packages/cart/src/record-2.ts | L1 | 65 |
| packages/cart/src/record-20.ts | L1 | 65 |
| packages/cart/src/record-21.ts | L1 | 65 |
| packages/cart/src/record-3.ts | L1 | 65 |
| packages/cart/src/record-4.ts | L1 | 65 |
| packages/cart/src/record-5.ts | L1 | 65 |
| packages/cart/src/record-6.ts | L1 | 65 |
| packages/cart/src/record-7.ts | L1 | 65 |
| packages/cart/src/record-8.ts | L1 | 65 |
| packages/cart/src/record-9.ts | L1 | 65 |
| packages/users/src/record-0.ts | L1 | 66 |
| packages/users/src/record-1.ts | L1 | 66 |
| packages/users/src/record-10.ts | L1 | 67 |
| packages/users/src/record-11.ts | L1 | 67 |
| packages/users/src/record-12.ts | L1 | 67 |
| packages/users/src/record-13.ts | L1 | 67 |
| packages/users/src/record-14.ts | L1 | 67 |
| packages/users/src/record-15.ts | L1 | 67 |
| packages/users/src/record-16.ts | L1 | 67 |
| packages/users/src/record-17.ts | L1 | 67 |
| packages/users/src/record-18.ts | L1 | 67 |
| packages/users/src/record-19.ts | L1 | 67 |
| packages/users/src/record-2.ts | L1 | 66 |
| packages/users/src/record-20.ts | L1 | 67 |
| packages/users/src/record-21.ts | L1 | 67 |
| packages/users/src/record-3.ts | L1 | 66 |
| packages/users/src/record-4.ts | L1 | 66 |
| packages/users/src/record-5.ts | L1 | 66 |
| packages/users/src/record-6.ts | L1 | 66 |
| packages/users/src/record-7.ts | L1 | 66 |
| packages/users/src/record-8.ts | L1 | 66 |
| packages/users/src/record-9.ts | L1 | 66 |
| packages/pricing/src/record-0.ts | L1 | 68 |
| packages/pricing/src/record-1.ts | L1 | 68 |
| packages/pricing/src/record-10.ts | L1 | 69 |
| packages/pricing/src/record-11.ts | L1 | 69 |
| packages/pricing/src/record-12.ts | L1 | 69 |
| packages/pricing/src/record-13.ts | L1 | 69 |
| packages/pricing/src/record-14.ts | L1 | 69 |
| packages/pricing/src/record-15.ts | L1 | 69 |
| packages/pricing/src/record-16.ts | L1 | 69 |
| packages/pricing/src/record-17.ts | L1 | 69 |
| packages/pricing/src/record-18.ts | L1 | 69 |
| packages/pricing/src/record-19.ts | L1 | 69 |
| packages/pricing/src/record-2.ts | L1 | 68 |
| packages/pricing/src/record-20.ts | L1 | 69 |
| packages/pricing/src/record-21.ts | L1 | 69 |
| packages/pricing/src/record-3.ts | L1 | 68 |
| packages/pricing/src/record-4.ts | L1 | 68 |
| packages/pricing/src/record-5.ts | L1 | 68 |
| packages/pricing/src/record-6.ts | L1 | 68 |
| packages/pricing/src/record-7.ts | L1 | 68 |
| packages/pricing/src/record-8.ts | L1 | 68 |
| packages/pricing/src/record-9.ts | L1 | 68 |
| packages/orders/src/record-0.ts | L1 | 67 |
| packages/orders/src/record-1.ts | L1 | 67 |
| packages/orders/src/record-10.ts | L1 | 68 |

## Implicaciones para la búsqueda

Evaluar pesos léxicos, top BM25, recorrido inverso y reserva core: los misses de posición baja compiten con firmas de numerosos candidatos y el contorno estático. Evaluar nº L2 y umbral de ancla para comprobar su coste. No usar gold como semillas. Los tests nuevos ausentes y el desajuste entre lenguaje de tarea y documentos léxicos necesitan cambios de algoritmo/dataset, no ajuste de pesos.
