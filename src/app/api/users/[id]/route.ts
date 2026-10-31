import { NextResponse } from "next/server";
import { jsonError, readJson, requireStaff } from "@/lib/api";
import { createAdminClient, hasServiceRole } from "@/lib/supabase/admin";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const g = await requireStaff(request, { admin: true });
  if (!g.ok) return g.response;
  const { id } = await params;
  const b = await readJson<{ role?: string; full_name?: string }>(request);
  const update: Record<string, unknown> = {};
  if (b.role !== undefined) {
    if (!["admin", "staff", "pending"].includes(b.role)) return jsonError("Rol no válido");
    if (id === g.ctx.user.id && b.role !== "admin") return jsonError("No puedes quitarte tu propio rol de administrador");
    update.role = b.role;
  }
  if (b.full_name !== undefined) update.full_name = b.full_name?.trim() || null;
  const { data, error } = await g.ctx.supabase.from("users").update(update).eq("id", id).select().single();
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ user: data });
}

export async function DELETE(request: Request, { params }: Params) {
  const g = await requireStaff(request, { admin: true });
  if (!g.ok) return g.response;
  const { id } = await params;
  if (id === g.ctx.user.id) return jsonError("No puedes eliminar tu propia cuenta");
  if (hasServiceRole()) {
    const { error } = await createAdminClient().auth.admin.deleteUser(id);
    if (error) return jsonError(error.message, 500);
  } else {
    const { error } = await g.ctx.supabase.from("users").delete().eq("id", id);
    if (error) return jsonError(error.message, 500);
  }
  return NextResponse.json({ ok: true });
}
