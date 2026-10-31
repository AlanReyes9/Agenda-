import { NextResponse } from "next/server";
import { jsonError, readJson, requireStaff } from "@/lib/api";

type VehicleInput = { brand?: string; model?: string; year?: number | string; plate?: string; color?: string };

export async function GET(request: Request) {
  const g = await requireStaff(request);
  if (!g.ok) return g.response;
  const q = new URL(request.url).searchParams.get("q")?.trim();
  let query = g.ctx.supabase
    .from("clients")
    .select("*, vehicles(*)")
    .order("name", { ascending: true })
    .limit(1000);
  if (q) {
    const safe = q.replace(/[%,()]/g, " ");
    query = query.or(`name.ilike.%${safe}%,phone.ilike.%${safe}%,email.ilike.%${safe}%`);
  }
  const { data, error } = await query;
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ clients: data });
}

export async function POST(request: Request) {
  const g = await requireStaff(request);
  if (!g.ok) return g.response;
  const body = await readJson<{ name?: string; phone?: string; email?: string; notes?: string; vehicle?: VehicleInput }>(
    request,
  );
  const name = body.name?.trim();
  if (!name) return jsonError("El nombre del cliente es obligatorio");

  const { data: client, error } = await g.ctx.supabase
    .from("clients")
    .insert({
      name,
      phone: body.phone?.trim() || null,
      email: body.email?.trim() || null,
      notes: body.notes?.trim() || null,
      created_by: g.ctx.user.id,
    })
    .select()
    .single();
  if (error) return jsonError(error.message, 500);

  let vehicle = null;
  if (body.vehicle?.brand?.trim()) {
    const v = body.vehicle;
    const res = await g.ctx.supabase
      .from("vehicles")
      .insert({
        client_id: client.id,
        brand: v.brand!.trim(),
        model: v.model?.trim() || null,
        year: v.year ? Number(v.year) || null : null,
        plate: v.plate?.trim().toUpperCase() || null,
        color: v.color?.trim() || null,
      })
      .select()
      .single();
    if (res.error) return jsonError(res.error.message, 500);
    vehicle = res.data;
  }
  return NextResponse.json({ client: { ...client, vehicles: vehicle ? [vehicle] : [] }, vehicle }, { status: 201 });
}
