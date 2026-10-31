import { NextResponse } from "next/server";
import { jsonError, readJson, requireStaff } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const g = await requireStaff(request);
  if (!g.ok) return g.response;
  const { id } = await params;
  const b = await readJson<Record<string, string | number | null | undefined>>(request);
  const update: Record<string, unknown> = {};
  for (const key of ["brand", "model", "plate", "color", "notes"] as const) {
    if (b[key] !== undefined) update[key] = b[key]?.toString().trim() || null;
  }
  if (typeof update.plate === "string") update.plate = update.plate.toUpperCase();
  if (b.year !== undefined) update.year = b.year ? Number(b.year) || null : null;
  if ("brand" in update && !update.brand) return jsonError("La marca es obligatoria");
  const { data, error } = await g.ctx.supabase.from("vehicles").update(update).eq("id", id).select().single();
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ vehicle: data });
}

export async function DELETE(request: Request, { params }: Params) {
  const g = await requireStaff(request);
  if (!g.ok) return g.response;
  const { id } = await params;
  const { error } = await g.ctx.supabase.from("vehicles").delete().eq("id", id);
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ ok: true });
}
