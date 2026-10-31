import "server-only";
import { createAdminClient } from "./supabase/admin";

export async function createConfirmedUser(email: string, password: string, fullName: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error) {
    const msg = /already|registered|exists/i.test(error.message) ? "Ya existe una cuenta con ese correo" : error.message;
    return { error: msg } as const;
  }
  return { user: data.user } as const;
}

export function validateCredentials(email: string | undefined, password: string | undefined): string | null {
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) return "Correo no válido";
  if (!password || password.length < 8) return "La contraseña debe tener al menos 8 caracteres";
  return null;
}
