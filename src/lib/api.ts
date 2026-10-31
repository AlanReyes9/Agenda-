import "server-only";
import { NextResponse } from "next/server";
import { getSupabaseAndUser, type AuthContext } from "./supabase/server";

export function jsonError(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

type Guard = { ok: true; ctx: AuthContext } | { ok: false; response: NextResponse };

/** Exige sesión y rol aprobado (staff/admin). */
export async function requireStaff(request: Request, opts: { admin?: boolean } = {}): Promise<Guard> {
  const ctx = await getSupabaseAndUser(request);
  if (!ctx) return { ok: false, response: jsonError("No autenticado", 401) };
  const role = ctx.profile?.role;
  if (role !== "admin" && role !== "staff") {
    return { ok: false, response: jsonError("Tu cuenta está pendiente de aprobación por un administrador.", 403) };
  }
  if (opts.admin && role !== "admin") {
    return { ok: false, response: jsonError("Solo un administrador puede hacer esto.", 403) };
  }
  return { ok: true, ctx };
}

export async function readJson<T = Record<string, unknown>>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    return {} as T;
  }
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return String(e);
}

export function appOrigin(request: Request): string {
  const env = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (env && !env.includes("localhost")) return env;
  const url = new URL(request.url);
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
  return `${proto}://${host}`;
}

export const APPOINTMENT_SELECT =
  "*, client:clients(id, name, phone, email), vehicle:vehicles(id, brand, model, year, plate)";
