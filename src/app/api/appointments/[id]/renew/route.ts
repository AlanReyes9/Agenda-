import { NextResponse } from "next/server";
import { APPOINTMENT_SELECT, jsonError, readJson, requireStaff } from "@/lib/api";
import { syncAppointment } from "@/lib/google-calendar";
import { todayISO } from "@/lib/dates";
import type { Appointment } from "@/lib/types";
import { appointmentRow, validateAppointment, type AppointmentInput } from "@/lib/appointments";

type Params = { params: Promise<{ id: string }> };

/** Renovar: crea la nueva agenda y marca la anterior como renovada. */
export async function POST(request: Request, { params }: Params) {
  const g = await requireStaff(request);
  if (!g.ok) return g.response;
  const { id } = await params;
  const { supabase, user } = g.ctx;

  const { data: prev, error: prevErr } = await supabase
    .from("appointments")
    .select(APPOINTMENT_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (prevErr) return jsonError(prevErr.message, 500);
  if (!prev) return jsonError("Agenda no encontrada", 404);

  const body = await readJson<AppointmentInput>(request);
  const input: AppointmentInput = {
    client_id: prev.client_id,
    vehicle_id: body.vehicle_id !== undefined ? body.vehicle_id : prev.vehicle_id,
    service_date: body.service_date || todayISO(),
    period_months: body.period_months,
    oil_type: body.oil_type ?? prev.oil_type,
    mileage: body.mileage,
    next_mileage: body.next_mileage,
    notes: body.notes,
  };
  const invalid = validateAppointment(input);
  if (invalid) return jsonError(invalid);

  const { data: created, error } = await supabase
    .from("appointments")
    .insert({ ...appointmentRow(input), renewed_from: prev.id, created_by: user.id })
    .select(APPOINTMENT_SELECT)
    .single();
  if (error) return jsonError(error.message, 500);

  const { data: old, error: oldErr } = await supabase
    .from("appointments")
    .update({ status: "renovado" })
    .eq("id", prev.id)
    .select(APPOINTMENT_SELECT)
    .single();
  if (oldErr) return jsonError(oldErr.message, 500);

  // Borra el evento anterior y crea el nuevo (sin bloquear)
  const [oldSync, newSync] = await Promise.all([
    syncAppointment(supabase, old as Appointment),
    syncAppointment(supabase, created as Appointment),
  ]);
  const calendarError = [oldSync.calendarError, newSync.calendarError].filter(Boolean).join(" · ") || undefined;
  return NextResponse.json(
    {
      appointment: created,
      previous: old,
      calendarSynced: oldSync.calendarSynced && newSync.calendarSynced,
      calendarError,
    },
    { status: 201 },
  );
}
