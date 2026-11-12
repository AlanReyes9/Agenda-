import { NextResponse } from "next/server";
import { APPOINTMENT_SELECT, jsonError, requireStaff } from "@/lib/api";
import { resolveGoogleCredentials, syncAppointment } from "@/lib/google-calendar";
import type { Appointment } from "@/lib/types";

export const maxDuration = 60;

/** Sube a Google Calendar las agendas activas que aún no tienen evento. */
export async function POST(request: Request) {
  const g = await requireStaff(request);
  if (!g.ok) return g.response;
  const creds = await resolveGoogleCredentials();
  if (!creds.refreshToken) return jsonError("Google Calendar no está conectado.", 409);

  const { data, error } = await g.ctx.supabase
    .from("appointments")
    .select(APPOINTMENT_SELECT)
    .not("status", "in", "(completado,renovado)")
    .is("google_event_id", null)
    .order("next_due_date")
    .limit(200);
  if (error) return jsonError(error.message, 500);

  let synced = 0;
  const errors: string[] = [];
  for (const a of (data ?? []) as Appointment[]) {
    const r = await syncAppointment(g.ctx.supabase, a);
    if (r.calendarSynced) synced++;
    else if (r.calendarError) {
      errors.push(r.calendarError);
      if (errors.length >= 3) break; // si falla de forma repetida, no insistir
    }
  }
  return NextResponse.json({ pending: data?.length ?? 0, synced, failed: errors.length, error: errors[0] ?? null });
}
