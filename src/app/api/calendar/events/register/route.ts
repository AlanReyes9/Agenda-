import { NextResponse } from "next/server";
import { APPOINTMENT_SELECT, jsonError, readJson, requireStaff } from "@/lib/api";

/**
 * Registra un evento existente de Google Calendar como agenda.
 * La fecha del evento se usa EXACTAMENTE como próximo cambio (period_months = 0).
 */
export async function POST(request: Request) {
  const g = await requireStaff(request);
  if (!g.ok) return g.response;
  const b = await readJson<{
    event_id?: string;
    date?: string;
    client_id?: string;
    vehicle_id?: string | null;
    oil_type?: string;
    notes?: string;
  }>(request);
  if (!b.event_id) return jsonError("Falta el evento");
  if (!b.client_id) return jsonError("Selecciona un cliente");
  if (!b.date || !/^\d{4}-\d{2}-\d{2}$/.test(b.date)) return jsonError("Fecha del evento no válida");

  const { data: dup } = await g.ctx.supabase.from("appointments").select("id").eq("google_event_id", b.event_id).maybeSingle();
  if (dup) return jsonError("Este evento ya está registrado", 409);

  const { data, error } = await g.ctx.supabase
    .from("appointments")
    .insert({
      client_id: b.client_id,
      vehicle_id: b.vehicle_id || null,
      service_date: b.date,
      period_months: 0,
      oil_type: b.oil_type?.trim() || null,
      notes: b.notes?.trim() || null,
      google_event_id: b.event_id,
      created_by: g.ctx.user.id,
    })
    .select(APPOINTMENT_SELECT)
    .single();
  if (error) return jsonError(error.message, 500);
  // No se modifica el evento original de Google.
  return NextResponse.json({ appointment: data, calendarSynced: true }, { status: 201 });
}
