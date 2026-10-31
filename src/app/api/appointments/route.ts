import { NextResponse } from "next/server";
import { APPOINTMENT_SELECT, jsonError, readJson, requireStaff } from "@/lib/api";
import { syncAppointment } from "@/lib/google-calendar";
import type { Appointment } from "@/lib/types";
import { appointmentRow, validateAppointment, type AppointmentInput } from "@/lib/appointments";

export async function GET(request: Request) {
  const g = await requireStaff(request);
  if (!g.ok) return g.response;
  const sp = new URL(request.url).searchParams;
  let query = g.ctx.supabase
    .from("appointments")
    .select(APPOINTMENT_SELECT)
    .order("next_due_date", { ascending: true })
    .limit(2000);
  const clientId = sp.get("client_id");
  if (clientId) query = query.eq("client_id", clientId);
  const active = sp.get("active");
  if (active === "true") query = query.not("status", "in", "(completado,renovado)");
  const { data, error } = await query;
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ appointments: data });
}

export async function POST(request: Request) {
  const g = await requireStaff(request);
  if (!g.ok) return g.response;
  const body = await readJson<AppointmentInput & { skip_calendar?: boolean }>(request);
  const invalid = validateAppointment(body);
  if (invalid) return jsonError(invalid);

  const { data, error } = await g.ctx.supabase
    .from("appointments")
    .insert({ ...appointmentRow(body), created_by: g.ctx.user.id })
    .select(APPOINTMENT_SELECT)
    .single();
  if (error) return jsonError(error.message, 500);

  const appointment = data as Appointment;
  const sync = body.skip_calendar ? { calendarSynced: true } : await syncAppointment(g.ctx.supabase, appointment);
  return NextResponse.json({ appointment, ...sync }, { status: 201 });
}
