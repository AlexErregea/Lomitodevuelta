# ADR-0009 — Moderación y anti-fraude: post-moderación con flags automáticos y revisión humana

- **Estado**: Aceptado
- **Fecha**: 2026-07-16

## Contexto

Amenazas reales del dominio: reportes duplicados, fotos robadas de otros anuncios
(base de extorsiones), lenguaje de estafa ("deposita para que te lo devuelva"),
contenido que no es un perro, y contenido sensible (perros heridos/fallecidos) que
es legítimo pero requiere tratamiento. Restricciones: el Flujo B no puede esperar
aprobación (fricción cero), no hay equipo de moderación (un fundador), y el
presupuesto no admite APIs de moderación dedicadas.

## Decisión

**Post-moderación**: los reportes nacen `approved` y participan del matching de
inmediato; señales automáticas los degradan a `flagged` (visible, en cola de
revisión) o `blocked` (invisible). El fundador revisa la cola — en MVP directamente
en Supabase Studio con una vista SQL filtrada; panel de moderación = fase posterior.

### Señales automáticas (MVP)

1. **Duplicados por embedding** — al completarse el embedding de una foto, consulta
   HNSW contra fotos del **mismo** tipo de reporte (aquí sí sirve el índice global,
   ADR-0005): similitud > 0.985 en la misma zona y ventana de 30 días → `flagged`
   como posible duplicado (se conserva activo: puede ser legítimo — dos personas
   viendo al mismo perro callejero es señal, no ruido).
2. **El prompt de extracción de atributos hace doble servicio** (costo marginal
   cero): además de atributos devuelve `is_dog` (false → `blocked` automático:
   único bloqueo sin humano, con reversa vía revisión) e `is_sensitive` (true →
   difuminado con opt-in del espectador, security-privacy.md §7; el reporte sigue
   activo — un perro herido es un caso urgente real).
3. **Heurísticas de lenguaje de estafa** en campos de texto libre (`finder_note`,
   `feedback_note`): lista mantenida de patrones en español-MX (depósito, anticipo,
   transferencia antes de, OXXO antes de entrega…) → `flagged`. Es una lista de
   texto en configuración, no un modelo.
4. **Rate-limits** por `value_hash` e IP (api-contracts.md §6): acotan el volumen de
   abuso antes de que llegue a moderación.

### Anti-fraude en el reclamo (resumen; detalle en security-privacy.md §6)

Prueba de propiedad ligera **entre pares** (foto histórica o seña no pública,
validada por la contraparte), plataforma sin dinero, copys anti-extorsión en cada
revelación de contacto, entrega en punto seguro.

### Fase posterior (no implementar aún)

- Clasificador LLM de estafa sobre texto (cuando las heurísticas se queden cortas y
  haya presupuesto — es un llamado barato pero multiplicado por cada texto).
- Búsqueda inversa de imágenes robadas (sin API económica hoy; para flags, revisión
  manual con búsqueda inversa a mano).
- Panel de moderación propio con acciones en un clic.
- Reputación por contacto (`value_hash` reincidente en flags).

## Consecuencias

- (+) El Flujo B conserva fricción cero y el inventario no pierde registros por
  falsos positivos: `flagged` sigue visible mientras un humano decide.
- (+) Costo de moderación ≈ 0: reutiliza el embedding y el prompt que ya pagamos.
- (+) La carga humana inicial es proporcional al tamaño real de la red (decenas de
  reportes/semana en el arranque hiperlocal → minutos de revisión).
- (−) Ventana de exposición: contenido malicioso puede estar público hasta la
  revisión. Asumido conscientemente: el único auto-bloqueo es `is_dog = false`, y el
  radio de daño de un reporte falso visible unas horas es bajo (no hay dinero en la
  plataforma y el contacto está enmascarado).
- (−) Las heurísticas de texto tendrán falsos negativos. Mitigado: el punto de daño
  real (revelación de contacto) siempre lleva el copy anti-extorsión, pase lo que
  pase con los flags.
- (−) Revisión en Supabase Studio es incómoda. Aceptado: es exactamente el tipo de
  herramienta interna que NO se construye antes de validar el producto.

## Alternativas descartadas

1. **Pre-moderación (aprobar antes de publicar)** — Rechazado: mata el Flujo B (el
   encontrador no vuelve) y congela el matching proactivo justo cuando el tiempo
   importa. Con un solo revisor humano, además, sería el cuello de botella de toda
   la red.
2. **API de moderación de terceros (Hive, Rekognition, OpenAI moderation)** —
   Rechazado en MVP: costo por imagen/texto adicional para cubrir riesgos que las
   señales gratuitas ya cubren razonablemente. Reevaluar con volumen.
3. **Clasificador LLM en todo texto desde el día 1** — Rechazado: multiplicar
   llamadas por cada nota/edición rompe el presupuesto para un beneficio marginal
   sobre las heurísticas en esta escala. Es la primera candidata a promoverse cuando
   haya ingresos.
4. **Bloqueo automático agresivo (cualquier flag → invisible)** — Rechazado: en una
   red que vive de la densidad, un falso positivo (reporte legítimo oculto) cuesta
   más que un falso negativo visible unas horas. La excepción única es `is_dog =
   false`, donde el falso positivo es casi imposible.
