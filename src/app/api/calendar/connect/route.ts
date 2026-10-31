import { NextResponse } from "next/server";
import { appOrigin, requireStaff } from "@/lib/api";
import { buildAuthUrl, resolveGoogleCredentials, resolveRedirectUri } from "@/lib/google-calendar";
import { hasServiceRole } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function back(origin: string, params: Record<string, string>) {
  return NextResponse.redirect(`${origin}/dashboard/configuracion?${new URLSearchParams(params)}`);
}

// Usa cookies (navegador). Redirige a la pantalla de consentimiento de Google.
export async function GET(request: Request) {
  const origin = appOrigin(request);
  const g = await requireStaff(request, { admin: true });
  if (!g.ok) return back(origin, { calendar: "error", message: "Solo un administrador puede conectar Google Calendar." });
  if (!hasServiceRole()) {
    return back(origin, { calendar: "error", message: "Falta SUPABASE_SERVICE_ROLE_KEY en el servidor." });
  }
  const creds = await resolveGoogleCredentials();
  if (!creds.clientId || !creds.clientSecret) {
    return back(origin, { calendar: "error", message: "Primero guarda el Client ID y el Client Secret de Google." });
  }
  const state = crypto.randomUUID();
  const res = NextResponse.redirect(buildAuthUrl(creds, resolveRedirectUri(creds, origin), state));
  res.cookies.set("g_oauth_state", state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/" });
  return res;
}
