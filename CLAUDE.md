# Auto Soluciones Daniel — Contexto del proyecto (v2)

App de gestión para el taller "Auto Soluciones Daniel" (propietario: Alan, JAAJ Producciones, RD). UI y comunicación en **español**, directo y práctico (el usuario no siempre es técnico).

## Stack
Next.js 15 (App Router) + React 19 + TypeScript + Tailwind CSS 4 + lucide-react + date-fns + sonner. Supabase (Postgres + Auth + RLS), proyecto `auto-soluciones-daniel` (ref `pznigwhsmofukpfaijea`). Despliegue en **Vercel** (team Nexusdev), auto-deploy desde `main` de GitHub `AlanReyes9/Agenda-`.

## Arquitectura
- API routes en `src/app/api/*`. Auth dual con `getSupabaseAndUser(request)` (`src/lib/supabase/server.ts`): cookies (web) o `Authorization: Bearer` (Android). Guard `requireStaff(request, {admin?})` en `src/lib/api.ts`.
- Roles en `public.users.role`: `admin` | `staff` | `pending`. Primer usuario = admin (trigger `handle_new_auth_user`); el resto queda pendiente hasta aprobación. RLS usa funciones `is_staff()` / `is_admin()` (security definer, evitan recursión).
- Registro público: solo abierto mientras no exista ninguna cuenta (función SQL `registration_open()`); el primer usuario es admin. Después, el admin crea cuentas en Configuración → Usuarios (`POST /api/users`). Ambos crean el usuario confirmado con la service role key.
- `settings` (fila id=1, sin secretos) + `app_secrets` (client secret y refresh token de Google; RLS sin políticas → solo service role). La API nunca devuelve secretos, solo `google_client_secret_set`.
- Google Calendar vía REST con `fetch` (`src/lib/google-calendar.ts`), sin googleapis. `syncAppointment` nunca lanza: devuelve `calendarSynced` / `calendarError`.

## Módulos
- **Calendario** (`/dashboard/calendario`): vista mensual (lunes primero) + lista; panel del día con `AppointmentsTable compact`. Sin librerías de calendario: date-fns.
- **Etiquetas** (`/dashboard/etiquetas`, `src/lib/labels.ts`): UN solo formato, el del taller (diseño original en ZDesigner): sticker de aceite horizontal 2.5″ × 1.4″ (63.5 × 35.6 mm). Encabezado centrado (nombre; dirección - teléfono de `settings.workshop_address`/`workshop_phone`) y 4 renglones a la izquierda en mayúsculas: `FECHA d-M-yy PROX. d-M-yy`, `MI. ACTUAL. n`, `PROX. MI. n`, `ACEITE …`. Impresora del taller: **Zebra LP 2844 (EPL, 203 dpi)** compartida como `\\SERVIDOR\ZDesigner LP 2844`. Salidas: impresión con driver (`@page`), Zebra Browser Print en EPL (por defecto) o ZPL, y archivos EPL/ZPL/TSPL. EPL y TSPL usan mapa de bits (bit 0 = negro). `?agenda=<id>` rellena los datos. El taller usa **millas** (mi), no km.

## Reglas de negocio
- Próximo cambio = `service_date` + `period_months` (trigger `compute_appointment_fields`). El estado se recalcula también en el cliente con `effectiveStatus()` (el de la BD puede quedar desfasado).
- `period_months = 0` es válido (evento externo). Nunca validar con `!period_months`.
- Renovar = crear nueva agenda (`renewed_from`) y marcar la anterior `renovado` (borra su evento y crea el nuevo).
- Completado/renovado borran el evento de Google. Eliminar con confirmación inline.
- Registrar evento externo: `service_date = fecha exacta del evento`, `period_months = 0`, `google_event_id`; no se modifica el evento original.
- Evento: día completo en `next_due_date`, popups el día anterior (9 a. m.) y el mismo día.

## Trampas
- `useSearchParams()` dentro de `<Suspense>` (configuración).
- Los `route.ts`/`page.tsx` solo pueden exportar lo permitido por Next: helpers en `src/lib`.
- Pantalla de consentimiento de Google en "Testing": añadir la cuenta como usuario de prueba.

## Convenciones
- No pedir ni imprimir secretos. `npm run build` debe pasar antes de hacer push (Vercel despliega solo).
