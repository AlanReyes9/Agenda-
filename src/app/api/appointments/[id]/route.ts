import { NextResponse } from "next/server";
import { APPOINTMENT_SELECT, jsonError, readJson, requireStaff } from "@/lib/api";
import { deleteCalendarEvent, resolveGoogleCredentials, syncAppointment } from "@/lib/google-calendar";
import type { Appointment, AppointmentStatus } from "@/lib/types";
import { appointmentRow, validateAppointment, type AppointmentInput } from "@/lib/appointments";

type Params = { params: Promise<{ id: string }> };
const STATUSES: AppointmentStatus[] = ["pendiente", "proximo", "vencido", "completado", "renovado"];

export async function GET(request: Request, { params }: Params) {
  const g = await requireStaff(request);
  if (!g.ok) return g.response;
  const { id } = await params;
  const { data, error } = await g.ctx.supabase.from("appointments").select(APPOINTMENT_SELECT).eq("id", id).maybeSingle();
  if (error) return jsonError(error.message, 500);
  if (!data) return jsonError("Agenda no encontrada", 404);
  return NextResponse.json({ appointment: data });
}

export async function PATCH(request: Request, { params }: Params) {
  const g = await requireStaff(request);
  if (!g.ok) return g.response;
  const { id } = await params;
  const body = await readJson<AppointmentInput & { status?: AppointmentStatus }>(request);
  const invalid = validateAppointment(body, true);
  if (invalid) return jsonError(invalid);

  const update = appointmentRow(body);
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) return jsonError("Estado no válido");
    // Reabrir: el trigger recalcula pendiente/próximo/vencido
    update.status = body.status;
  }
  if (Object.keys(update).length === 0) return jsonError("Nada que actualizar");

  const { data, error } = await g.ctx.supabase
    .from("appointments")
    .update(update)
    .eq("id", id)
    .select(APPOINTMENT_SELECT)
    .single();
  if (error) return jsonError(error.message, 500);
  const appointment = data as Appointment;
  const sync = await syncAppointment(g.ctx.supabase, appointment);
  return NextResponse.json({ appointment, ...sync });
}

export async function DELETE(request: Request, { params }: Params) {
  const g = await requireStaff(request);
  if (!g.ok) return g.response;
  const { id } = await params;
  const { data: existing } = await g.ctx.supabase.from("appointments").select("google_event_id").eq("id", id).maybeSingle();

  let calendarSynced = true;
  let calendarError: string | undefined;
  if (existing?.google_event_id) {
    try {
      const creds = await resolveGoogleCredentials();
      if (creds.refreshToken) await deleteCalendarEvent(existing.google_event_id, creds);
      else calendarSynced = false;
    } catch (e) {
      calendarSynced = false;
      calendarError = e instanceof Error ? e.message : String(e);
    }
  }

  const { error } = await g.ctx.supabase.from("appointments").delete().eq("id", id);
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ ok: true, calendarSynced, calendarError });
}
