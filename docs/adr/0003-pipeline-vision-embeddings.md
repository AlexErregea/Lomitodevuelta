# ADR-0003 — Pipeline de visión: síncrono-primero con reintentos; embeddings vía API externa tras interfaz; versionado de modelo

- **Estado**: Aceptado
- **Fecha**: 2026-07-15

## Contexto

Cada foto necesita dos inferencias: (a) un **embedding visual** (CLIP/SigLIP) para la
búsqueda de similitud, y (b) una **extracción de atributos estructurados** (raza,
colores, tamaño, sexo, edad estimada, señas) con un LLM multimodal. La promesa de
producto exige resultados en < 5 s percibidos; el presupuesto exige pagar centavos;
y el fundador aceptó depender de API externa **siempre que migrar a self-hosting no
rompa la base**. El riesgo clásico: cambiar de modelo de embeddings invalida todos
los vectores almacenados (los espacios vectoriales de modelos distintos no son
comparables).

## Decisión

### 1. Síncrono-primero, con red de seguridad asíncrona

El alta llama a ambas inferencias **en paralelo** desde el servidor, con timeout de
20 s. Si ambas responden, el usuario ve candidatos de inmediato (caso feliz, el 95%).
Si algo falla, el registro **se guarda igual** con `embedding_status = 'pending'` y
un job de pg_cron reintenta cada 5 minutos (con backoff y máximo de intentos); al
completarse, corre el matching proactivo normal. **Regla de oro: una inferencia
fallida jamás pierde un reporte** — especialmente en el Flujo B, donde el encontrador
no va a volver a intentarlo.

No hay cola de mensajes en MVP: el estado en la propia tabla + pg_cron es la cola.

### 2. Proveedor externo detrás de una interfaz

Toda inferencia pasa por dos interfaces del dominio (en `packages/shared`):

```ts
interface EmbeddingProvider {
  modelVersion: string;            // p. ej. "siglip-base-768@replicate"
  dimensions: number;              // fijado por modelo
  embed(imageUrl: string): Promise<Float32Array>;
}
interface AttributeExtractor {
  extract(imageUrl: string): Promise<DogAttributes>; // validado con Zod
}
```

Implementación MVP: **Replicate (o HF Inference como respaldo) para embeddings**
— modelo concreto de la familia SigLIP, elegido y fijado en configuración al montar
el pipeline (Bloque 7), con benchmark rápido sobre fotos reales de perros — y
**Claude Haiku para extracción de atributos** con salida JSON validada por Zod.
Migrar a self-hosting = escribir otra implementación de la interfaz + re-embed.

Costo variable dominante del sistema: **~0.1 ¢ USD por embedding y ~0.5 ¢ USD por
extracción** → un alta con 3 fotos cuesta ~2 ¢ USD. A 1,000 altas/mes: ~20 USD.

### 3. Versionado del modelo de embeddings

- Cada embedding se guarda con su `embedding_model_version` (texto, junto al vector).
- **Las búsquedas solo comparan vectores de la misma versión** (la RPC filtra por
  versión activa).
- Cambio de modelo = proceso de migración, no un switch: (1) script re-embebe el
  inventario **vigente** (lost/found activos, no el histórico) con el modelo nuevo en
  lote barato; (2) cuando la cobertura llega a 100% del inventario vigente, se cambia
  la versión activa en configuración; (3) los vectores viejos se conservan un tiempo
  como respaldo de rollback.
- La dimensión del vector la fija el modelo (SigLIP base: 768). Si un modelo futuro
  usa otra dimensión, se añade una columna/tabla nueva — pgvector exige dimensión
  fija por columna indexada. La RPC ya recibe la versión, así que el cambio queda
  contenido en SQL.

## Consecuencias

- (+) UX inmediata en el caso feliz, cero pérdida de registros en el infeliz.
- (+) Sin infraestructura de colas que operar; pg_cron ya viene con Supabase.
- (+) Cambiar de proveedor o self-hostear no toca el dominio ni el esquema.
- (−) Dependencia de disponibilidad de un tercero en el camino caliente. Mitigación:
  la ruta `pending` + reintentos convierte una caída del proveedor en degradación
  ("te avisamos cuando terminemos de analizar"), no en pérdida.
- (−) Cold starts de Replicate pueden acercarse al timeout. Mitigación: estados de
  carga por etapas en la UI; si el p95 real supera lo tolerable, cambiar a un
  endpoint dedicado (~pago fijo) es decisión de fase posterior con datos en mano.
- (−) Re-embed masivo cuesta dinero: por eso solo se re-embebe el inventario vigente.

## Alternativas descartadas

1. **Pipeline 100% asíncrono con cola desde el día 1** — Rechazado: rompe la promesa
   "sube una foto y busca por ti" (el usuario tendría que esperar una notificación),
   y añade complejidad operativa sin volumen que la justifique.
2. **Self-hosting de embeddings desde el MVP** (GPU en Modal/RunPod) — Rechazado por
   ahora: pago fijo mensual + operación de infraestructura para un volumen que las
   APIs cubren por centavos. La interfaz garantiza que sea reversible. **Fase
   posterior**, con disparador claro: cuando el gasto mensual de inferencia supere de
   forma sostenida el costo fijo del self-hosting (~50-80 USD/mes).
3. **Almacenar embeddings fuera de Postgres (Pinecone/Qdrant)** — Rechazado: otra
   pieza, otro costo, y pierde la joya de este diseño — geo-filtro y vector en la
   misma consulta SQL. pgvector con HNSW escala a cientos de miles de vectores sin
   problema (ver ADR-0005, Bloque 3).
4. **Extraer atributos con un modelo de clasificación tradicional** (raza/color) —
   Rechazado en MVP: entrenar y servir modelos propios es exactamente el tipo de
   complejidad que no podemos operar aún. El LLM multimodal da atributos + señas
   particulares en lenguaje natural con un solo llamado.
