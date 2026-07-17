# ADR-0010 — Cartel compartible: og:image dinámico con next/og, cacheado en CDN

- **Estado**: Aceptado
- **Fecha**: 2026-07-16

## Contexto

La distribución del producto ES compartir la ficha por WhatsApp: el preview (imagen
Open Graph) es la primera impresión y el gancho de clic. Debe generarse para cada
reporte (foto + estado + zona + CTA), verse bien en el preview de WhatsApp,
actualizarse si la ficha cambia, y costar ~cero. Restricciones: WhatsApp cachea la
og:image por URL de forma agresiva; los reportes sensibles no pueden mostrar la
foto en el preview; recomendación de peso < 300 KB y ~1200×630.

## Decisión

**Generación en runtime con `next/og` (ImageResponse) en la ruta
`/r/[id]/opengraph-image`, cacheada en el CDN de Vercel.**

1. La ruta compone el cartel (foto principal, "PERDIDO"/"ENCONTRADO", colonia
   aproximada, fecha, CTA "Ayúdalo a volver") con JSX → PNG vía `ImageResponse`.
   Cero servicios nuevos: es Next.js.
2. **Caché en dos capas**: `Cache-Control: public, s-maxage=86400,
   stale-while-revalidate` en el CDN + el **buster de versión** en la URL que la
   ficha declara en su meta `og:image`: `?v={updated_at_epoch}`. Editar el reporte
   cambia `v` → WhatsApp lo trata como imagen nueva (única forma fiable de invalidar
   su caché), y las URLs viejas siguen sirviendo la versión cacheada sin costo.
3. **Reportes sensibles** (`is_sensitive`): el cartel usa silueta/placeholder con el
   texto, jamás la foto (security-privacy.md §7). Reportes `blocked`/`deleted`:
   cartel genérico del producto (la URL puede seguir circulando en chats).
4. La foto se lee de Storage con URL firmada **dentro del render del servidor**; la
   og:image resultante es pública por naturaleza (WhatsApp la re-hospeda en sus
   previews) — por eso el cartel solo contiene lo que ya es público en la ficha.

## Consecuencias

- (+) Costo cero adicional y ninguna pieza nueva de infraestructura.
- (+) Actualizable al editar (buster) y compatible con el caché eterno de WhatsApp.
- (+) El diseño del cartel es código React: iterarlo es trivial para Claude Code.
- (−) `ImageResponse` tiene límites de CSS (subset de flexbox, sin grid): el diseño
  del cartel debe mantenerse simple. Asumido: un cartel simple y legible convierte
  mejor que uno barroco.
- (−) Primer render tras expirar caché paga latencia (~300-800 ms): invisible para
  el usuario (lo pide el crawler de WhatsApp, no una persona).
- (−) Tipografías custom deben empaquetarse como asset local (sin fetch externo en
  runtime). Detalle de implementación del Sprint 2.

## Alternativas descartadas

1. **Pre-generar el cartel al crear el reporte y guardarlo en Storage** —
   Rechazado: paga almacenamiento y una pieza de pipeline más, y cada edición exige
   regenerar y re-subir. El runtime + CDN da el mismo resultado sin estado.
2. **Servicio externo de OG images (Bannerbear, htmlcsstoimage…)** — Rechazado:
   costo por imagen para algo que Next.js hace gratis en casa.
3. **Cartel estático genérico (sin foto del perro)** — Rechazado: la foto es el
   gancho emocional y funcional del compartido; un preview genérico mata la
   conversión del canal principal. (Es exactamente lo que sí hacemos, pero solo en
   el caso sensible, donde es lo correcto.)
