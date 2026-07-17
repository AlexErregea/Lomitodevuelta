# Supabase — operación de base de datos

> Checklist de migraciones y despliegue (ADR-0012). Las migraciones son el paso
> más peligroso del sistema: aquí siempre hay un humano leyendo.

## Primera vez (local)

```
pnpm exec supabase init    # genera config.toml (una sola vez)
pnpm db:start              # requiere Docker Desktop corriendo
pnpm db:reset              # aplica TODAS las migraciones desde cero
```

## Checklist para aplicar migraciones a producción

1. ☐ La migración es **nueva** (jamás se edita una aplicada) y es **aditiva**
   (compatible con el código que ya corre: crear antes que borrar).
2. ☐ `pnpm db:reset` local pasa sin errores.
3. ☐ Tests locales en verde: `pnpm typecheck && pnpm test`.
4. ☐ Ensayo en dev: `supabase link --project-ref <lomito-dev>` →
   `supabase db push` → smoke test contra dev.
5. ☐ Producción: `supabase link --project-ref <lomito-prod>` →
   `supabase db push`.
6. ☐ **Siempre migración antes que el código que la usa** (el deploy de Vercel
   va después).
7. ☐ Verificar en Supabase Studio (prod) que la migración aparece aplicada.

## Recordatorios

- Los secretos de Edge Functions se configuran con `supabase secrets set`
  (inventario en `.env.example`, columna `[supabase]`).
- El proyecto Free se pausa por inactividad: el cron de `lifecycle` mantiene
  vivo prod; `lomito-dev` puede pausarse — reactivar es un clic.
- `supabase/functions/` se despliega con `supabase functions deploy <nombre>`.
