# Modelo de costos — LomitoDeVuelta

> Costo por componente y por unidad de negocio, con los umbrales exactos donde las
> capas gratuitas se rompen. Criterio del fundador: gastar lo mínimo hasta validar.
> ⚠️ Precios de referencia a 2026-07; verificar al contratar. Última actualización: 2026-07-16.

## 1. Costos fijos mensuales (MVP = casi cero)

| Componente | Plan MVP | Costo | Se paga cuando… |
|---|---|---|---|
| Vercel (web) | Hobby | **$0** | Uso comercial serio/límites → Pro $20/mes |
| Supabase (BD+Storage+Functions) | Free | **$0** | Ver umbrales §3 → Pro $25/mes |
| Meta WhatsApp Cloud API | — | **$0 fijo** | Solo por mensaje (§2) |
| Resend (email fallback) | Free (3,000/mes) | **$0** | Improbable superarlo en MVP |
| PostHog (analítica + errores) | Free (1M eventos/mes) | **$0** | Improbable en MVP |
| GitHub (repo + Actions) | Free | **$0** | — |
| **Dominio** (lomitodevuelta.mx/.com) | — | **~$1-1.5/mes** (~$12-18/año) | El único gasto obligado pre-validación |
| APIs de visión (Replicate/Anthropic) | pay-per-use | variable → §2 | Cada alta |

**Total fijo del MVP: el dominio.** Todo lo demás es variable y proporcional al uso.

## 2. Costo por unidad de negocio (los dos medidores que importan)

### Unidad 1: alta de reporte (el costo de "la IA busca por ti")

| Concepto | Cálculo | Costo |
|---|---|---|
| Embeddings visuales (3 fotos × ~$0.0006) | Replicate | ~$0.002 |
| Extracción de atributos (1 llamada multimodal, hasta 3 imágenes) | Claude Haiku | ~$0.005-0.01 |
| WhatsApp `manage_link` (1 plantilla utility) | Meta | ~$0.009 |
| Búsqueda (RPC) + Storage + servidor | incluido en planes | ~$0 |
| **Total por alta** | | **~$0.02-0.03 (2-3 ¢)** |

### Unidad 2: match notificado (el costo de "te encontramos una coincidencia")

| Concepto | Cálculo | Costo |
|---|---|---|
| 2 plantillas utility (ambas partes) | Meta | ~$0.017 |
| Respuestas dentro de ventana de 24 h | gratis | $0 |
| Revelación de contacto (2 mensajes, normalmente en ventana) | gratis o ~$0.017 | $0-0.017 |
| **Total por match notificado** | | **~$0.02-0.03** |

Regla mnemotécnica: **cada alta y cada match cuestan ~un peso mexicano (2-3 ¢ USD)**.

## 3. Escenarios y umbrales de las capas gratuitas

| Escenario | Altas/mes | Matches/mes | Variable | Fijo | **Total/mes** |
|---|---|---|---|---|---|
| Piloto (validación CDMX) | 100 | 20 | ~$3 | ~$1 | **~$4** |
| Tracción temprana | 500 | 120 | ~$16 | ~$1 | **~$17** |
| Producto funcionando | 1,500 | 400 | ~$50 | ~$1 | **~$51** |
| Límite del stack gratis | ~2,500 | ~700 | ~$85 | +$45 (Supabase Pro + Vercel Pro) | **~$130** |

El presupuesto original (~100-160 USD/mes) solo se toca cuando el producto ya
procesa miles de altas — para entonces la pregunta de monetización (fase 3) ya
debería tener respuesta.

**Dónde se rompe primero el plan gratis** (vigilar en `metrics_costs_monthly`):

1. **Storage 1 GB (Supabase Free)** — fotos comprimidas ~200 KB × 3 por alta →
   **~1,600 altas acumuladas**. Primer muro real. Salida: Supabase Pro ($25, 100 GB)
   o purga más agresiva de fotos de reportes expirados.
2. **BD 500 MB** — con vectores 768d (~3 KB/foto) + filas: aguanta decenas de miles
   de reportes; no es el cuello.
3. **Edge Functions 500K invocaciones/mes** — imposible de tocar en MVP.
4. **Pausa por inactividad (Supabase Free pausa proyectos sin tráfico ~1 semana)**
   — riesgo real en pre-lanzamiento: el cron semanal de `lifecycle` cuenta como
   actividad y lo evita de facto; verificar tras el despliegue (Bloque 7).

## 4. Costo por componente del pipeline (para decisiones de optimización)

| Pieza | Costo unitario | Palanca si crece |
|---|---|---|
| Embedding (Replicate, SigLIP) | ~$0.0006/imagen | Self-hosting (~$50-80/mes fijos) rentable a partir de ~100K imágenes/mes — lejísimos; ADR-0003 |
| Extracción (Claude Haiku) | ~$0.005-0.01/alta | Prompt más corto; extraer solo foto primaria; batch API (−50 %) |
| WhatsApp utility | ~$0.0085/mensaje | Diseñar flujos para responder dentro de ventanas de 24 h (gratis); ADR-0008 |
| WhatsApp marketing | ~$0.04/mensaje | **No usar** (regla de diseño, no optimización) |

## 5. Guardarraíles de gasto (implementación Bloque 7)

- Contador mensual de mensajes e inferencias en `events` → vista
  `metrics_costs_monthly` (observability.md §4).
- Umbral 80 % del presupuesto configurado → WhatsApp al fundador; 100 % →
  kill-switch a solo-email (ADR-0008). El presupuesto vive en configuración.
- Límites duros en los dashboards de los proveedores: spend limit en Replicate y
  presupuesto de API en Anthropic Console (tarea del fundador en el Bloque 7).
