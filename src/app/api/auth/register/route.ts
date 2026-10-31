import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { errorMessage, jsonError, readJson } from "@/lib/api";
import { createAdminClient, hasServiceRole } from "@/lib/supabase/admin";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/env";
import { createConfirmedUser, validateCredentials } from "@/lib/users";

export const dynamic = "force-dynamic";

/** El registro público solo está abierto mientras no exista ninguna cuenta. */
async function registrationOpen(): Promise<boolean> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await supabase.rpc("registration_open");
  if (error) return false;
  return data === true;
}

export async function GET() {
  return NextResponse.json({ open: await registrationOpen() });
}

export async function POST(request: Request) {
  if (!(await registrationOpen())) {
    return jsonError("El registro está cerrado. Pide a un administrador que te cree una cuenta.", 403);
  }
  if (!hasServiceRole()) {
    return jsonError("El registro aún no está habilitado: falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor.", 503);
  }
  const body = await readJson<{ email?: string; password?: string; full_name?: string }>(request);
  const email = body.email?.trim().toLowerCase();
  const invalid = validateCredentials(email, body.password);
  if (invalid) return jsonError(invalid);

  try {
    const res = await createConfirmedUser(email!, body.password!, body.full_name?.trim() ?? "");
    if ("error" in res) return jsonError(res.error!, 400);
    const { data: profile } = await createAdminClient().from("users").select("role").eq("id", res.user.id).maybeSingle();
    return NextResponse.json({ ok: true, role: profile?.role ?? "pending" }, { status: 201 });
  } catch (e) {
    return jsonError(errorMessage(e), 500);
  }
}
