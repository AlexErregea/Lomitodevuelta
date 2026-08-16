-- ============================================================================
-- LomitoDeVuelta · Migración 13 — Token de acceso por lado del match
-- ----------------------------------------------------------------------------
-- El aviso de coincidencia mandaba a la ficha PÚBLICA de la contraparte, una
-- página anónima que por diseño no puede saber quién la abre (los ciudadanos
-- no tienen cuenta, ADR-0006) y por tanto no puede pedirle nada. El mensaje
-- prometía "dinos si es él" y terminaba en un callejón sin salida.
--
-- El destino correcto es el panel del propio reporte, donde ya existen los
-- botones. Pero llegar ahí exige un token, y del token de gestión solo se
-- guarda el hash: para mandar ese enlace habría que emitir uno nuevo y
-- **invalidar el que la persona guardó al crear su reporte** — en cada
-- notificación, y un reporte puede recibir varias.
--
-- Por eso el match lleva su propio token, con dos propiedades que el de
-- gestión no puede dar:
--
--   1. **No invalida nada.** El enlace original sigue vivo.
--   2. **Mínimo privilegio.** El token de gestión también permite EDITAR y
--      BORRAR el reporte (derechos ARCO). Un enlace que se reenvía por
--      WhatsApp no debería poder hacer eso: este solo sirve para ver esa
--      coincidencia y responderla.
--
-- Un token POR LADO, no uno por match: con uno compartido, el enlace de quien
-- encontró al perro autenticaría como el dueño y podría aportar la prueba de
-- propiedad en su nombre. Además el lado deja de venir en el cuerpo del
-- request: se deduce de cuál hash coincidió.
--
-- Se guarda solo el HMAC-SHA256 con el pepper del servidor, igual que el token
-- de gestión: un volcado de la tabla no permite responder matches ajenos.
-- ============================================================================

alter table public.matches
  add column lost_access_token_hash  text,
  add column found_access_token_hash text;

comment on column public.matches.lost_access_token_hash is
  'HMAC del token del enlace de coincidencia del lado "perdí". Solo autoriza ver y responder ESTE match; no da acceso ARCO al reporte.';
comment on column public.matches.found_access_token_hash is
  'HMAC del token del enlace de coincidencia del lado "encontré". Ver la nota del lado lost.';
