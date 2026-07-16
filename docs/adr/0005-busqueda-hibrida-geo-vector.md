# ADR-0005 — Búsqueda híbrida: geo-filtro primero, KNN exacto sobre el subconjunto; HNSW listo para escalar

- **Estado**: Aceptado
- **Fecha**: 2026-07-16

## Contexto

La capa 1 del matching debe pasar de miles de reportes a ~20 candidatos con **recall
alto**: perder al perro correcto aquí es irrecuperable. Tenemos dos dimensiones de
búsqueda en la misma base: espacial (PostGIS) y de similitud visual (pgvector).

El problema clásico de combinar ambas es el **ANN filtrado**: un índice HNSW recorre
el grafo global de vectores y aplica el filtro (geo, status) *después* — si el filtro
es muy selectivo (nuestro caso: una colonia dentro de todo el inventario), el índice
devuelve menos resultados de los pedidos o pierde vecinos válidos (recall roto), que
es exactamente lo que no podemos permitir.

Dato clave de producto: la estrategia es hiperlocal. El geo-filtro deja **cientos**
de candidatos, no decenas de miles.

## Decisión

**Geo primero (índice GiST), vector después con KNN exacto sobre el subconjunto.**
Implementado en la función SQL `match_candidates` (migración 4):

1. **Cota superior constante e indexable**: `ST_DWithin(geo, ref, max_radius_km)` —
   el planner usa el índice GiST porque el radio es constante en la consulta.
2. **Radio dinámico por fila**: segunda condición `ST_DWithin` con
   `min(max, base + km_per_day × días)` — un perro se desplaza ~1-3 km/día; a más
   días transcurridos, más lejos pudo llegar. Esta condición no usa índice y no lo
   necesita: se evalúa solo sobre lo que pasó la cota constante.
3. **KNN exacto** sobre el subconjunto: distancia coseno contra todos los pares de
   fotos (referencia × candidato) de la **misma versión de modelo**, quedándose con
   la mejor por candidato. Recall = 100 % por construcción. Con ≤5 fotos por reporte
   y cientos de candidatos, son milisegundos de CPU.
4. **El índice HNSW se crea desde el día 1 de todos modos** (parcial:
   `embedding is not null`), pero sirve a otros usos: detección de duplicados
   (moderación, ADR-0010) y futuras búsquedas globales sin geo-filtro. Insertar
   embeddings lo mantiene al día sin costo operativo relevante.

### Camino de evolución (fase posterior, sin rediseño)

| Disparador | Acción |
|---|---|
| Subconjunto geo-filtrado > ~10k vectores por consulta (densidad altísima) | Cambiar el paso 3 a HNSW con **iterative index scans** de pgvector (`hnsw.iterative_scan`), que re-explora el grafo hasta llenar el K pedido pese al filtro. Es un cambio dentro de la función SQL. |
| Migración de modelo de embeddings | Índice HNSW parcial por `embedding_model_version` nueva; el viejo se borra al completar el runbook (matching-engine.md §7). |
| > ~1-2 M de filas en `dogs` o p95 de la RPC > 500 ms | Particionado declarativo por `zone_id` (las consultas ya filtran por zona implícitamente vía radio). |

## Consecuencias

- (+) Recall perfecto en la capa 1 a escala MVP — el requisito número uno.
- (+) Una sola consulta SQL, un solo viaje de red, junto a los índices (ADR-0002).
- (+) La latencia es predecible: GiST (ms) + coseno sobre cientos de pares (ms);
  encaja de sobra en el presupuesto de <5 s percibidos (la inferencia externa domina).
- (+) Cada paso de escala es un cambio localizado (función SQL o DDL), documentado.
- (−) El KNN exacto no escala a subconjuntos enormes — asumido: el disparador y la
  salida (iterative scans) están definidos arriba.
- (−) El HNSW ocupa espacio desde el día 1 aunque el camino caliente no lo use.
  Aceptado: lo usan moderación/duplicados y elimina una migración futura con prisa.
- (−) Dos condiciones `ST_DWithin` (constante + dinámica) hacen la consulta menos
  obvia de leer — mitigado con comentarios en el SQL explicando el porqué.

## Alternativas descartadas

1. **Vector primero (HNSW global), geo después** — Rechazado: es el anti-patrón del
   ANN filtrado. Compararía la foto contra todo el país (cómputo inútil) y el filtro
   posterior rompería el recall local. Además invierte la lógica de producto: la
   densidad local es la señal.
2. **IVFFlat en lugar de HNSW** — Rechazado: exige entrenar listas con datos previos
   (arrancamos con base vacía) y su recall se degrada con inserciones continuas —
   nuestro régimen es de altas diarias. HNSW construye más lento y ocupa más, pero a
   nuestra escala eso es irrelevante.
3. **Base vectorial externa (Pinecone/Qdrant/Weaviate)** — Ya rechazada en ADR-0003:
   perderíamos el geo-filtro y el vector en la misma transacción SQL, que es la
   ventaja estructural de este diseño, y añadiría costo y operación.
4. **Particionado por zona desde el día 1** — Rechazado: complejidad prematura con
   una sola zona activa y miles (no millones) de filas. El disparador y el camino
   están documentados arriba; el esquema (zone_id en todas las consultas) ya lo deja
   preparado.
5. **Pre-filtrar por atributos en SQL** (raza/tamaño en la capa 1) — Rechazado: los
   atributos los estima una IA y pueden estar mal; descartarían al perro correcto
   antes de que la capa 2 pondere con matices (recall primero, principio 1 del
   motor).
