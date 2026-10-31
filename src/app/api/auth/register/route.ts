import { NextResponse } from "next/server";
import { errorMessage, jsonError, readJson } from "@/lib/api";
import { createAdminClient, hasServiceRole } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  if (!hasServiceRole()) {
    return jsonError(
      "El registro aún no está habilitado: falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor.",
      503,
    );
  }
  const body = await readJson<{ email?: string; password?: string; full_name?: string }>(request);
  const email = body.email?.trim().toLowerCase();
  const password = body.password ?? "";
  const fullName = body.full_name?.trim() ?? "";
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) return jsonError("Correo no válido");
  if (password.length < 8) return jsonError("La contraseña debe tener al menos 8 caracteres");

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (error) {
      const msg = /already|registered|exists/i.test(error.message)
        ? "Ya existe una cuenta con ese correo"
        : error.message;
      return jsonError(msg, 400);
    }
    const { data: profile } = await admin.from("users").select("role").eq("id", data.user.id).maybeSingle();
    return NextResponse.json({ ok: true, role: profile?.role ?? "pending" }, { status: 201 });
  } catch (e) {
    return jsonError(errorMessage(e), 500);
  }
}
