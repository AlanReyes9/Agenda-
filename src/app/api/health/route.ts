import { NextResponse } from "next/server";
import { hasServiceRole } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    supabaseConfigured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    serviceRoleConfigured: hasServiceRole(),
  });
}
