# LomitoDeVuelta 🐕

Red de reunificación de perros perdidos y encontrados, impulsada por IA.
**Sube una foto y la IA busca por ti.**

> Este README está escrito para poder seguirlo **sin saber programar**. Si algo
> falla, copia el error y pégaselo a Claude Code — para eso está.

## Mapa del repositorio

| Carpeta | Qué es |
|---|---|
| `docs/` | **Empieza aquí.** Arquitectura, modelo de datos, motor de matching, seguridad, contratos de API. `docs/adr/` registra cada decisión con su porqué. |
| `apps/web/` | La aplicación web (Next.js, PWA mobile-first). UI + API. |
| `packages/shared/` | Tipos y contratos compartidos por todo el sistema. |
| `packages/matching/` | El cerebro: la lógica de scoring del matching (pura, testeable). |
| `supabase/migrations/` | La base de datos, versionada en SQL comentado. |
| `supabase/functions/` | Tareas de fondo: matching proactivo, WhatsApp, reintentos. |

## Instalación (una sola vez)

Ya tienes ✔ Git y ✔ Node. Falta:

1. **pnpm** (gestor de paquetes del monorepo). En una terminal:
   ```
   npm install -g pnpm
   ```
2. **Docker Desktop** (corre la base de datos local). Descárgalo de
   https://www.docker.com/products/docker-desktop/ e instálalo con las opciones
   por defecto (usa WSL 2 si te lo pregunta). Ábrelo y espera a que diga
   "Docker Desktop is running".

La CLI de Supabase **no** se instala aparte: viene como dependencia del repo.

## Puesta en marcha local

Desde la carpeta del proyecto (`C:\Users\Asus\LomitoDeVuelta`):

```
# 1. Instalar dependencias (primera vez y tras cada actualización)
pnpm install

# 2. Inicializar Supabase (SOLO la primera vez; genera supabase/config.toml
#    y respeta las migraciones existentes)
pnpm exec supabase init

# 3. Levantar la base de datos local (Docker debe estar corriendo).
#    La primera vez descarga varios GB: paciencia.
pnpm db:start

# 4. Crear las tablas (aplica todas las migraciones desde cero)
pnpm db:reset
```

Cuando `pnpm db:start` termine, imprime unas claves. Copia `.env.example` como
`apps/web/.env.local` y rellena:

- `NEXT_PUBLIC_SUPABASE_URL` → el **API URL** que imprimió
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` → el **anon key**
- `SUPABASE_SERVICE_ROLE_KEY` → el **service_role key**

Las demás variables pueden esperar al Bloque 7 (cada una dice para qué sirve).

```
# 5. Arrancar la web
pnpm dev
```

Abre http://localhost:3000 — deberías ver la página de LomitoDeVuelta.

## Comandos habituales

| Comando | Qué hace |
|---|---|
| `pnpm dev` | Arranca la web en http://localhost:3000 |
| `pnpm db:start` / `pnpm db:stop` | Enciende/apaga la base local (Docker) |
| `pnpm db:reset` | **Borra** la base local y la reconstruye desde las migraciones |
| `pnpm typecheck` | Revisa los tipos de todo el monorepo (tu red de seguridad) |
| `pnpm test` | Corre los tests |
| `pnpm lint` / `pnpm format` | Revisa/da formato al código |

Supabase Studio local (ver las tablas con interfaz gráfica):
http://127.0.0.1:54323 mientras `db:start` esté activo.

## Despliegue (resumen — se hace en el Bloque 7)

- **Web** → Vercel (plan Hobby). Configuración clave: *Root Directory* =
  `apps/web`. Variables de entorno según `.env.example` (columna `[vercel]`).
- **Base de datos** → proyecto en supabase.com (plan Free), conectado con
  `supabase link` y migraciones aplicadas con `supabase db push`.
- **Edge Functions** → `supabase functions deploy`, secretos con
  `supabase secrets set` (columna `[supabase]` de `.env.example`).

## Si algo falla

- **"docker no reconocido" / db:start falla** → Docker Desktop no está corriendo. Ábrelo y reintenta.
- **Puerto ocupado (54321/54323/3000)** → `pnpm db:stop` y reintenta; o reinicia la máquina (algo quedó colgado).
- **Errores raros tras actualizar** → borra `node_modules` y corre `pnpm install` de nuevo.
- **Cualquier otra cosa** → pídeselo a Claude Code con el error pegado; el contexto del proyecto está en `CLAUDE.md` y `docs/`.
