# ADR-0004 — Scoring multimodal: capa 1 en SQL, capa 2 en paquete TypeScript puro; pesos parametrizados; feedback como dataset

- **Estado**: Aceptado
- **Fecha**: 2026-07-15

## Contexto

La capa 2 del matching combina cuatro señales sobre los ~20 candidatos que devuelve
la capa 1: similitud visual, compatibilidad de atributos estructurados, coherencia
espaciotemporal (un perro se desplaza ~1-3 km/día, más si fue transportado) y señas
particulares (peso alto). Debe producir una **probabilidad calibrada y explicable**
("91%: misma mancha en pecho, hallado a 1.8 km, 2 días después").

Requisitos que condicionan dónde vive esta lógica: (a) es el código que más se va a
iterar — los pesos iniciales son hipótesis; (b) el feedback humano
(aceptado/rechazado/reunión confirmada) es el dataset para calibrarla; (c) debe ser
testeable sin infraestructura para que Claude Code pueda modificarla con confianza;
(d) corre en dos contextos: búsqueda interactiva (Vercel) y matching proactivo
(Edge Function).

## Decisión

### 1. División por capas

- **Capa 1 (recall) en SQL**: la RPC `match_candidates` hace geo-filtro + top-K
  vectorial y devuelve los candidatos **con sus datos crudos** (similitud coseno,
  distancia en metros, días transcurridos, atributos JSONB). SQL es imbatible junto
  a los índices, y esta parte casi no cambia.
- **Capa 2 (precisión) en `packages/matching`, TypeScript puro**: funciones sin I/O
  que reciben candidatos crudos y devuelven score + desglose + explicación.
  Testeable con casos fijos (labrador negro genérico vs. perro con seña única),
  ejecutable idéntica en Vercel y en Deno.

### 2. Fórmula parametrizada, no cableada

```
total_score = w_visual · S_visual
            + w_attr   · S_atributos      // solo atributos ESTABLES penalizan:
                                          // sexo y tamaño adulto discrepantes restan;
                                          // color/edad/pelo son volátiles y pesan menos
            + w_geo    · S_espaciotemporal // distancia plausible dado días
                                          // transcurridos (~1-3 km/día, con cola
                                          // larga por transporte humano)
            + w_marks  · S_señas          // coincidencia de señas particulares:
                                          // multiplicador alto, casi decisivo
```

Los pesos y umbrales viven en la tabla `matching_params` (una fila activa,
versionada), **no en el código**: ajustarlos no requiere despliegue, y cada match
registra con qué versión de parámetros se calculó — sin eso, el dataset de feedback
sería ininterpretable. Pesos iniciales: hipótesis heurísticas documentadas en
`/docs/matching-engine.md` (Bloque 3), marcadas explícitamente como provisionales.

### 3. Calibración por fases

- **MVP**: score heurístico normalizado a [0,1] mostrado como porcentaje con
  lenguaje honesto ("coincidencia alta", no falsa precisión decimal).
- **Fase posterior** (disparador: ~200+ matches con feedback): regresión logística
  sobre `matches` (features = componentes del score; label = confirmado/rechazado).
  Es un script de análisis que propone pesos nuevos para `matching_params` — no un
  servicio de ML en producción.

### 4. Explicabilidad template-based

Cada componente del score emite evidencia estructurada (`{ tipo: "distancia",
valor: 1.8, unidad: "km" }`); una función de presentación las convierte en frases en
español desde plantillas externalizadas (regla i18n). **Sin LLM en el camino
caliente**: determinista, gratis, testeable. Un redactor LLM opcional para la
notificación es fase posterior.

### 5. El feedback es el activo

Cada transición de `matches.status` (suggested → accepted/rejected →
confirmed_reunion) queda en la tabla de eventos con timestamp, actor y versión de
parámetros. Diseñado desde la primera migración (Bloque 3): es el dataset que
convierte el score heurístico en uno aprendido.

## Consecuencias

- (+) Iterar pesos = editar una fila o un archivo de tests, no tocar SQL ni
  infraestructura. Ideal para desarrollo AI-assisted.
- (+) Explicaciones deterministas y gratis; misma lógica en búsqueda y en proactivo.
- (+) El dataset de calibración se acumula desde el día 1 sin trabajo extra.
- (−) Doble salto (SQL devuelve crudo, TS puntúa): ~20 filas por consulta, costo
  despreciable frente a la alternativa de meter la fórmula en SQL.
- (−) Score heurístico al inicio: los porcentajes son aproximados. Mitigación:
  lenguaje de producto honesto + calibración en cuanto haya datos.
- (−) `matching_params` en BD implica un fetch extra; se cachea por proceso con TTL
  corto.

## Alternativas descartadas

1. **Todo el score en SQL** (una gran expresión en la RPC) — Rechazado: intesteable
   en unidad, ilegible para iterar, y las explicaciones quedarían enterradas en SQL.
   La parte SQL se limita a recall + datos crudos.
2. **Microservicio Python de ML** — Rechazado en MVP: no hay modelo aprendido aún ni
   datos para entrenarlo; sería infraestructura por adelantado. Fase posterior si la
   calibración evoluciona a un modelo real (el paquete puro hace el swap barato).
3. **LLM-as-judge por par de candidatos** ("¿son el mismo perro?") — Rechazado como
   mecanismo principal: ~1-3 ¢ × 20 candidatos por búsqueda rompe el presupuesto y
   añade latencia y varianza. Anotado como experimento de fase posterior solo para
   el top-3 antes de notificar (verificación fina), cuando haya presupuesto.
4. **Pesos cableados en el código** — Rechazado: cada ajuste sería un despliegue y
   el feedback histórico perdería el vínculo con los parámetros que lo generaron.
