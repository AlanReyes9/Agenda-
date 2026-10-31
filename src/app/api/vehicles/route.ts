import { NextResponse } from "next/server";
import { jsonError, readJson, requireStaff } from "@/lib/api";

export async function GET(request: Request) {
  const g = await requireStaff(request);
  if (!g.ok) return g.response;
  const clientId = new URL(request.url).searchParams.get("client_id");
  let query = g.ctx.supabase.from("vehicles").select("*").order("created_at", { ascending: false });
  if (clientId) query = query.eq("client_id", clientId);
  const { data, error } = await query;
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ vehicles: data });
}

export async function POST(request: Request) {
  const g = await requireStaff(request);
  if (!g.ok) return g.response;
  const b = await readJson<{ client_id?: string; brand?: string; model?: string; year?: number | string; plate?: string; color?: string; notes?: string }>(request);
  if (!b.client_id) return jsonError("Falta el cliente");
  if (!b.brand?.trim()) return jsonError("La marca es obligatoria");
  const { data, error } = await g.ctx.supabase
    .from("vehicles")
    .insert({
      client_id: b.client_id,
      brand: b.brand.trim(),
      model: b.model?.trim() || null,
      year: b.year ? Number(b.year) || null : null,
      plate: b.plate?.trim().toUpperCase() || null,
      color: b.color?.trim() || null,
      notes: b.notes?.trim() || null,
    })
    .select()
    .single();
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ vehicle: data }, { status: 201 });
}
