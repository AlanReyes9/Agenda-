import { NextResponse } from "next/server";
import { errorMessage, jsonError, readJson, requireStaff } from "@/lib/api";
import { createAdminClient, hasServiceRole } from "@/lib/supabase/admin";
import { createConfirmedUser, validateCredentials } from "@/lib/users";

export async function GET(request: Request) {
  const g = await requireStaff(request, { admin: true });
  if (!g.ok) return g.response;
  const { data, error } = await g.ctx.supabase
    .from("users")
    .select("id, email, full_name, role, created_at")
    .order("created_at", { ascending: true });
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ users: data });
}

/** El administrador crea cuentas para su personal (el registro público está cerrado). */
export async function POST(request: Request) {
  const g = await requireStaff(request, { admin: true });
  if (!g.ok) return g.response;
  if (!hasServiceRole()) return jsonError("Falta SUPABASE_SERVICE_ROLE_KEY en el servidor.", 503);
  const b = await readJson<{ email?: string; password?: string; full_name?: string; role?: string }>(request);
  const email = b.email?.trim().toLowerCase();
  const invalid = validateCredentials(email, b.password);
  if (invalid) return jsonError(invalid);
  const role = b.role === "admin" ? "admin" : "staff";
  try {
    const res = await createConfirmedUser(email!, b.password!, b.full_name?.trim() ?? "");
    if ("error" in res) return jsonError(res.error!, 400);
    const { data, error } = await createAdminClient()
      .from("users")
      .update({ role })
      .eq("id", res.user.id)
      .select("id, email, full_name, role, created_at")
      .single();
    if (error) return jsonError(error.message, 500);
    return NextResponse.json({ user: data }, { status: 201 });
  } catch (e) {
    return jsonError(errorMessage(e), 500);
  }
}
