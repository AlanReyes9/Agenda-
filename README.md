# Auto Soluciones Daniel

App web de gestión del taller: clientes y vehículos, agendas de cambio de aceite (fecha del próximo cambio automática), panel de alertas, recordatorios por WhatsApp y sincronización con Google Calendar.

**Stack:** Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Supabase (Postgres + Auth + RLS) · Vercel.

## Desarrollo local

```bash
cp .env.example .env.local   # completa las variables
npm install
npm run dev
```

## Base de datos

Ejecuta `supabase/schema.sql` en el SQL Editor de Supabase (se puede ejecutar varias veces).

- El **primer usuario** que se registra queda como **administrador**. Los siguientes quedan *pendientes* hasta que un admin los apruebe en Configuración → Usuarios.
- Los secretos de Google (client secret y refresh token) viven en la tabla `app_secrets`, solo accesible con la service role key.

## Variables de entorno

| Variable | Obligatoria | Notas |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Sí | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Sí | |
| `SUPABASE_SERVICE_ROLE_KEY` | Sí | Registro de usuarios y Google Calendar. Solo servidor. |
| `NEXT_PUBLIC_APP_URL` | No | En Vercel se detecta sola. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | No | Respaldo si no se configuran en la app. |

## API (también para la app Android)

Todas las rutas aceptan cookies (web) o `Authorization: Bearer <access_token>` (Android).

`/api/clients`, `/api/clients/[id]`, `/api/vehicles`, `/api/vehicles/[id]`, `/api/appointments`, `/api/appointments/[id]`, `/api/appointments/[id]/renew`, `/api/settings`, `/api/users`, `/api/me`, `/api/calendar/{connect,callback,status,disconnect,events,events/register}`.

Las operaciones que tocan Google Calendar devuelven `calendarSynced` y `calendarError`; un fallo de Google nunca bloquea guardar ni eliminar.
