import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { appOrigin, errorMessage, requireStaff } from "@/lib/api";
import { CALENDAR_SCOPE, exchangeCodeForTokens, resolveGoogleCredentials, resolveRedirectUri } from "@/lib/google-calendar";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const origin = appOrigin(request);
  const back = (params: Record<string, string>) =>
    NextResponse.redirect(`${origin}/dashboard/configuracion?${new URLSearchParams(params)}`);

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const googleError = url.searchParams.get("error");
  const cookieStore = await cookies();
  const expected = cookieStore.get("g_oauth_state")?.value;
  cookieStore.delete("g_oauth_state");

  if (googleError) return back({ calendar: "error", message: `Google: ${googleError}` });
  if (!code || !state || state !== expected) {
    return back({ calendar: "error", message: "La solicitud de Google no es válida o expiró. Inténtalo de nuevo." });
  }
  const g = await requireStaff(request, { admin: true });
  if (!g.ok) return back({ calendar: "error", message: "Inicia sesión como administrador." });

  try {
    const creds = await resolveGoogleCredentials();
    const tokens = await exchangeCodeForTokens(creds, code, resolveRedirectUri(creds, origin));
    if (tokens.scopes.length && !tokens.scopes.includes(CALENDAR_SCOPE)) {
      return back({
        calendar: "error",
        message: "No se dio permiso a Google Calendar. Vuelve a conectar y marca la casilla «Ver, editar, compartir y eliminar… eventos».",
      });
    }
    const admin = createAdminClient();
    const refreshToken = tokens.refreshToken ?? creds.refreshToken;
    if (!refreshToken) {
      return back({
        calendar: "error",
        message: "Google no devolvió un refresh token. Quita el acceso de la app en tu cuenta de Google y vuelve a conectar.",
      });
    }
    await admin
      .from("app_secrets")
      .update({ google_refresh_token: refreshToken, updated_at: new Date().toISOString() })
      .eq("id", 1);
    await admin
      .from("settings")
      .update({ google_connected_email: tokens.email, google_connected_at: new Date().toISOString() })
      .eq("id", 1);
    return back({ calendar: "connected" });
  } catch (e) {
    return back({ calendar: "error", message: errorMessage(e) });
  }
}
