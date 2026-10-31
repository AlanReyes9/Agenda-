import { NextResponse } from "next/server";
import { errorMessage, jsonError, requireStaff } from "@/lib/api";
import { CalendarNotConnectedError, listUpcomingEvents } from "@/lib/google-calendar";

export async function GET(request: Request) {
  const g = await requireStaff(request);
  if (!g.ok) return g.response;
  try {
    const events = await listUpcomingEvents(120);
    const ids = events.map((e) => e.id);
    const { data: linked } = ids.length
      ? await g.ctx.supabase.from("appointments").select("google_event_id").in("google_event_id", ids)
      : { data: [] as { google_event_id: string }[] };
    const registered = new Set((linked ?? []).map((r) => r.google_event_id));
    return NextResponse.json({
      events: events.map((e) => ({ ...e, registered: registered.has(e.id) || Boolean(e.appointmentId) })),
    });
  } catch (e) {
    if (e instanceof CalendarNotConnectedError) return jsonError(e.message, 409, { connected: false });
    return jsonError(errorMessage(e), 502);
  }
}
