import { NextResponse } from "next/server";
import { jsonError, readJson, requireStaff } from "@/lib/api";
import { deleteCalendarEvent, resolveGoogleCredentials } from "@/lib/google-calendar";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const g = await requireStaff(request);
  if (!g.ok) return g.response;
  const { id } = await params;
  const { data, error } = await g.ctx.supabase.from("clients").select("*, vehicles(*)").eq("id", id).maybeSingle();
  if (error) return jsonError(error.message, 500);
  if (!data) return jsonError("Cliente no encontrado", 404);
  return NextResponse.json({ client: data });
}

export async function PATCH(request: Request, { params }: Params) {
  const g = await requireStaff(request);
  if (!g.ok) return g.response;
  const { id } = await params;
  const body = await readJson<Record<string, string | null | undefined>>(request);
  const update: Record<string, string | null> = {};
  for (const key of ["name", "phone", "email", "notes"] as const) {
    if (body[key] !== undefined) update[key] = body[key]?.toString().trim() || null;
  }
  if ("name" in update && !update.name) return jsonError("El nombre es obligatorio");
  const { data, error } = await g.ctx.supabase.from("clients").update(update).eq("id", id).select("*, vehicles(*)").single();
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ client: data });
}

export async function DELETE(request: Request, { params }: Params) {
  const g = await requireStaff(request);
  if (!g.ok) return g.response;
  const { id } = await params;

  // Borrar eventos de calendario de sus agendas (sin bloquear si falla)
  let calendarError: string | undefined;
  const { data: appts } = await g.ctx.supabase
    .from("appointments")
    .select("google_event_id")
    .eq("client_id", id)
    .not("google_event_id", "is", null);
  if (appts?.length) {
    try {
      const creds = await resolveGoogleCredentials();
      if (creds.refreshToken) {
        await Promise.all(appts.map((a) => deleteCalendarEvent(a.google_event_id as string, creds)));
      }
    } catch (e) {
      calendarError = e instanceof Error ? e.message : String(e);
    }
  }

  const { error } = await g.ctx.supabase.from("clients").delete().eq("id", id);
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ ok: true, calendarSynced: !calendarError, calendarError });
}
