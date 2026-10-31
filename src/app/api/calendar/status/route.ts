import { NextResponse } from "next/server";
import { appOrigin, requireStaff } from "@/lib/api";
import { resolveGoogleCredentials, resolveRedirectUri } from "@/lib/google-calendar";
import { hasServiceRole } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const g = await requireStaff(request);
  if (!g.ok) return g.response;
  const creds = await resolveGoogleCredentials();
  const { data } = await g.ctx.supabase
    .from("settings")
    .select("google_connected_email, google_connected_at")
    .eq("id", 1)
    .maybeSingle();
  return NextResponse.json({
    connected: Boolean(creds.refreshToken),
    configured: Boolean(creds.clientId && creds.clientSecret),
    serviceRoleConfigured: hasServiceRole(),
    email: data?.google_connected_email ?? null,
    connectedAt: data?.google_connected_at ?? null,
    calendarId: creds.calendarId,
    redirectUri: resolveRedirectUri(creds, appOrigin(request)),
  });
}
