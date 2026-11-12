import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient, hasServiceRole } from "./supabase/admin";
import { formatLongDate } from "./dates";
import type { Appointment, CalendarEvent } from "./types";
import { vehicleLabel } from "./utils";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CAL_API = "https://www.googleapis.com/calendar/v3";
export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events",
];

export interface GoogleCredentials {
  clientId: string | null;
  clientSecret: string | null;
  redirectUri: string | null;
  calendarId: string;
  refreshToken: string | null;
  workshopName: string;
}

export class CalendarNotConnectedError extends Error {
  constructor(message = "Google Calendar no está conectado.") {
    super(message);
    this.name = "CalendarNotConnectedError";
  }
}

/** Credenciales: primero la tabla settings/app_secrets, luego variables de entorno. */
export async function resolveGoogleCredentials(): Promise<GoogleCredentials> {
  let settings: Record<string, unknown> | null = null;
  let secrets: Record<string, unknown> | null = null;
  if (hasServiceRole()) {
    const admin = createAdminClient();
    const [s, sec] = await Promise.all([
      admin.from("settings").select("*").eq("id", 1).maybeSingle(),
      admin.from("app_secrets").select("*").eq("id", 1).maybeSingle(),
    ]);
    settings = s.data;
    secrets = sec.data;
  }
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return {
    clientId: str(settings?.google_client_id) ?? str(process.env.GOOGLE_CLIENT_ID),
    clientSecret: str(secrets?.google_client_secret) ?? str(process.env.GOOGLE_CLIENT_SECRET),
    redirectUri: str(settings?.google_redirect_uri) ?? str(process.env.GOOGLE_REDIRECT_URI),
    calendarId: str(settings?.google_calendar_id) ?? "primary",
    refreshToken: str(secrets?.google_refresh_token),
    workshopName: str(settings?.workshop_name) ?? "Auto Soluciones Daniel",
  };
}

export function resolveRedirectUri(creds: GoogleCredentials, origin: string): string {
  return creds.redirectUri ?? `${origin}/api/calendar/callback`;
}

export function buildAuthUrl(creds: GoogleCredentials, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: creds.clientId ?? "",
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForTokens(creds: GoogleCredentials, code: string, redirectUri: string) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: creds.clientId ?? "",
      client_secret: creds.clientSecret ?? "",
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.error || "No se pudo canjear el código de Google");
  let email: string | null = null;
  if (data.id_token) {
    try {
      const payload = JSON.parse(Buffer.from(String(data.id_token).split(".")[1], "base64url").toString());
      email = payload.email ?? null;
    } catch {
      /* ignorar */
    }
  }
  return {
    accessToken: data.access_token as string,
    refreshToken: (data.refresh_token as string | undefined) ?? null,
    email,
    scopes: String(data.scope ?? "").split(" ").filter(Boolean),
  };
}

// Caché simple del access token por instancia
let tokenCache: { token: string; expiresAt: number; refreshToken: string } | null = null;

async function getAccessToken(creds: GoogleCredentials): Promise<string> {
  if (!creds.refreshToken) throw new CalendarNotConnectedError();
  if (!creds.clientId || !creds.clientSecret) {
    throw new CalendarNotConnectedError("Faltan las credenciales de Google (Client ID / Secret).");
  }
  if (tokenCache && tokenCache.refreshToken === creds.refreshToken && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.token;
  }
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      refresh_token: creds.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    if (data.error === "invalid_grant") {
      // El permiso fue revocado o expiró: marcamos como desconectado.
      await markDisconnected();
      throw new CalendarNotConnectedError(
        "Google revocó el acceso (o expiró). Vuelve a conectar Google Calendar en Configuración.",
      );
    }
    throw new Error(data.error_description || data.error || "Error al renovar el token de Google");
  }
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000,
    refreshToken: creds.refreshToken,
  };
  return data.access_token;
}

export async function markDisconnected() {
  tokenCache = null;
  if (!hasServiceRole()) return;
  const admin = createAdminClient();
  await Promise.all([
    admin.from("app_secrets").update({ google_refresh_token: null }).eq("id", 1),
    admin.from("settings").update({ google_connected_email: null, google_connected_at: null }).eq("id", 1),
  ]);
}

async function calendarFetch(creds: GoogleCredentials, path: string, init: RequestInit = {}) {
  const token = await getAccessToken(creds);
  const res = await fetch(`${CAL_API}/calendars/${encodeURIComponent(creds.calendarId)}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  return res;
}

function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function eventBody(a: Appointment, workshopName: string) {
  const vehicle = vehicleLabel(a.vehicle);
  const lines = [
    `Cliente: ${a.client?.name ?? "—"}`,
    a.client?.phone ? `Teléfono: ${a.client.phone}` : null,
    `Vehículo: ${vehicle}`,
    a.oil_type ? `Aceite: ${a.oil_type}` : null,
    a.next_mileage ? `Próximo kilometraje: ${a.next_mileage} km` : null,
    `Fecha: ${formatLongDate(a.next_due_date)}`,
    a.notes ? `Notas: ${a.notes}` : null,
    "",
    `— ${workshopName}`,
  ].filter((l) => l !== null);
  return {
    summary: `🛢️ Cambio de aceite · ${a.client?.name ?? "Cliente"} (${vehicle})`,
    description: lines.join("\n"),
    start: { date: a.next_due_date },
    end: { date: nextDay(a.next_due_date) },
    reminders: {
      useDefault: false,
      overrides: [
        { method: "popup", minutes: 24 * 60 - 9 * 60 }, // día anterior, 9:00 a. m.
        { method: "popup", minutes: 0 }, // el mismo día
      ],
    },
    extendedProperties: { private: { appointmentId: a.id } },
  };
}

/** Crea o actualiza el evento de día completo. Devuelve el id del evento. */
export async function upsertCalendarEvent(a: Appointment, creds?: GoogleCredentials): Promise<string> {
  const c = creds ?? (await resolveGoogleCredentials());
  const body = JSON.stringify(eventBody(a, c.workshopName));
  if (a.google_event_id) {
    const res = await calendarFetch(c, `/events/${encodeURIComponent(a.google_event_id)}`, { method: "PATCH", body });
    if (res.ok) return (await res.json()).id;
    if (res.status !== 404 && res.status !== 410) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `Google Calendar respondió ${res.status}`);
    }
    // El evento fue borrado en Google: lo recreamos.
  }
  const res = await calendarFetch(c, "/events", { method: "POST", body });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Google Calendar respondió ${res.status}`);
  return data.id;
}

export async function deleteCalendarEvent(eventId: string, creds?: GoogleCredentials): Promise<void> {
  const c = creds ?? (await resolveGoogleCredentials());
  const res = await calendarFetch(c, `/events/${encodeURIComponent(eventId)}`, { method: "DELETE" });
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Google Calendar respondió ${res.status}`);
  }
}

export async function listUpcomingEvents(days = 90, creds?: GoogleCredentials) {
  const c = creds ?? (await resolveGoogleCredentials());
  const now = new Date();
  now.setUTCDate(now.getUTCDate() - 7);
  const until = new Date(Date.now() + days * 86400_000);
  const params = new URLSearchParams({
    timeMin: now.toISOString(),
    timeMax: until.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "100",
  });
  const res = await calendarFetch(c, `/events?${params}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Google Calendar respondió ${res.status}`);
  type GEvent = {
    id: string;
    summary?: string;
    description?: string;
    htmlLink?: string;
    start?: { date?: string; dateTime?: string };
    extendedProperties?: { private?: { appointmentId?: string } };
  };
  return ((data.items ?? []) as GEvent[]).map((e) => ({
    id: e.id,
    summary: e.summary ?? "(Sin título)",
    description: e.description,
    htmlLink: e.htmlLink,
    // La fecha exacta del evento tal como está en Google (sin conversión UTC)
    date: e.start?.date ?? (e.start?.dateTime ?? "").slice(0, 10),
    appointmentId: e.extendedProperties?.private?.appointmentId ?? null,
  }));
}

export type CalendarSyncResult = { calendarSynced: boolean; calendarError?: string };

/**
 * Sincroniza una agenda con Google Calendar. Nunca lanza excepción:
 * los fallos de Google no deben bloquear guardar/eliminar.
 */
export async function syncAppointment(
  supabase: SupabaseClient,
  a: Appointment,
): Promise<CalendarSyncResult> {
  try {
    const creds = await resolveGoogleCredentials();
    if (!creds.refreshToken) return { calendarSynced: false };
    const closed = a.status === "completado" || a.status === "renovado";
    if (closed) {
      if (a.google_event_id) {
        await deleteCalendarEvent(a.google_event_id, creds);
        await supabase.from("appointments").update({ google_event_id: null }).eq("id", a.id);
      }
      return { calendarSynced: true };
    }
    const eventId = await upsertCalendarEvent(a, creds);
    if (eventId !== a.google_event_id) {
      await supabase.from("appointments").update({ google_event_id: eventId }).eq("id", a.id);
      a.google_event_id = eventId;
    }
    return { calendarSynced: true };
  } catch (e) {
    const msg = friendlyCalendarError(e instanceof Error ? e.message : String(e));
    console.error("[calendar] sync failed", a.id, msg);
    return { calendarSynced: false, calendarError: msg };
  }
}

export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

/** Traduce los errores más comunes de Google a algo entendible. */
export function friendlyCalendarError(msg: string): string {
  if (/insufficient.*scope|insufficientPermissions|Request had insufficient authentication scopes/i.test(msg)) {
    return "Google no dio permiso para editar el calendario. Reconecta en Configuración y marca la casilla de Google Calendar.";
  }
  if (/has not been used|is disabled|accessNotConfigured/i.test(msg)) {
    return "La Google Calendar API no está activada en tu proyecto de Google Cloud. Actívala y vuelve a intentar.";
  }
  if (/Not Found/i.test(msg)) return "No se encontró el calendario configurado. Revisa el «ID del calendario» (normalmente: primary).";
  return msg;
}

export type { CalendarEvent };
