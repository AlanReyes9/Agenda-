import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient as createJsClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./env";
import type { AppUser } from "../types";

/** Cliente basado en cookies (páginas y rutas web). */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Llamado desde un Server Component: el middleware refresca la sesión.
        }
      },
    },
  });
}

export interface AuthContext {
  supabase: SupabaseClient;
  user: User;
  profile: AppUser | null;
}

/**
 * Auth dual: `Authorization: Bearer <token>` (Android) o cookies (web).
 * Devuelve null si no hay sesión válida.
 */
export async function getSupabaseAndUser(request: Request): Promise<AuthContext | null> {
  const header = request.headers.get("authorization");
  let supabase: SupabaseClient;
  let user: User | null = null;

  if (header?.toLowerCase().startsWith("bearer ")) {
    const token = header.slice(7).trim();
    supabase = createJsClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data } = await supabase.auth.getUser(token);
    user = data.user;
  } else {
    supabase = (await createClient()) as unknown as SupabaseClient;
    const { data } = await supabase.auth.getUser();
    user = data.user;
  }

  if (!user) return null;

  const { data: profile } = await supabase
    .from("users")
    .select("id, email, full_name, role, created_at")
    .eq("id", user.id)
    .maybeSingle();

  return { supabase, user, profile: (profile as AppUser | null) ?? null };
}
