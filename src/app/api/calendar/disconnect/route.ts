import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/api";
import { markDisconnected, resolveGoogleCredentials } from "@/lib/google-calendar";

export async function POST(request: Request) {
  const g = await requireStaff(request, { admin: true });
  if (!g.ok) return g.response;
  const creds = await resolveGoogleCredentials();
  if (creds.refreshToken) {
    // Revocar en Google (si falla, igual desconectamos localmente)
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(creds.refreshToken)}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    }).catch(() => null);
  }
  await markDisconnected();
  return NextResponse.json({ ok: true });
}
