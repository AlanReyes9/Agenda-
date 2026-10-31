import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/api";

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
