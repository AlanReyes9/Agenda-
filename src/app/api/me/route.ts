import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { getSupabaseAndUser } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const ctx = await getSupabaseAndUser(request);
  if (!ctx) return jsonError("No autenticado", 401);
  return NextResponse.json({
    user: ctx.profile ?? { id: ctx.user.id, email: ctx.user.email, full_name: null, role: "pending" },
  });
}
