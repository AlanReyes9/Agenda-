import { NextResponse } from "next/server";
import { errorMessage, jsonError, readJson, requireStaff } from "@/lib/api";
import { createAdminClient, hasServiceRole } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Settings } from "@/lib/types";
import { sanitizeDesign } from "@/lib/label-design";

async function loadSettings(supabase: SupabaseClient): Promise<Settings> {
  const { data, error } = await supabase.from("settings").select("*").eq("id", 1).maybeSingle();
  if (error) throw error;
  let secretSet = Boolean(process.env.GOOGLE_CLIENT_SECRET);
  let connected = false;
  if (hasServiceRole()) {
    const { data: sec } = await createAdminClient()
      .from("app_secrets")
      .select("google_client_secret, google_refresh_token")
      .eq("id", 1)
      .maybeSingle();
    secretSet = secretSet || Boolean(sec?.google_client_secret);
    connected = Boolean(sec?.google_refresh_token);
  }
  return {
    workshop_name: data?.workshop_name ?? "Auto Soluciones Daniel",
    workshop_phone: data?.workshop_phone ?? null,
    workshop_address: data?.workshop_address ?? null,
    label_design: sanitizeDesign(data?.label_design),
    whatsapp_template: data?.whatsapp_template ?? "",
    reminder_days: data?.reminder_days ?? 7,
    google_client_id: data?.google_client_id ?? null,
    google_redirect_uri: data?.google_redirect_uri ?? null,
    google_calendar_id: data?.google_calendar_id ?? "primary",
    google_connected_email: data?.google_connected_email ?? null,
    google_connected_at: data?.google_connected_at ?? null,
    google_client_secret_set: secretSet,
    google_connected: connected,
  };
}

export async function GET(request: Request) {
  const g = await requireStaff(request);
  if (!g.ok) return g.response;
  try {
    const settings = await loadSettings(g.ctx.supabase);
    return NextResponse.json({ settings, serviceRoleConfigured: hasServiceRole() });
  } catch (e) {
    return jsonError(errorMessage(e), 500);
  }
}

export async function PATCH(request: Request) {
  const g = await requireStaff(request, { admin: true });
  if (!g.ok) return g.response;
  const b = await readJson<Record<string, unknown>>(request);

  const update: Record<string, unknown> = {};
  const text = (k: string) => {
    if (b[k] !== undefined) update[k] = typeof b[k] === "string" && (b[k] as string).trim() ? (b[k] as string).trim() : null;
  };
  ["workshop_phone", "workshop_address", "google_client_id", "google_redirect_uri"].forEach(text);
  if (b.workshop_name !== undefined) {
    const v = String(b.workshop_name ?? "").trim();
    if (!v) return jsonError("El nombre del taller es obligatorio");
    update.workshop_name = v;
  }
  if (b.whatsapp_template !== undefined) {
    const v = String(b.whatsapp_template ?? "").trim();
    if (!v) return jsonError("La plantilla de WhatsApp no puede estar vacía");
    update.whatsapp_template = v;
  }
  if (b.google_calendar_id !== undefined) update.google_calendar_id = String(b.google_calendar_id || "").trim() || "primary";
  if (b.label_design !== undefined) {
    if (b.label_design === null) update.label_design = null;
    else {
      const design = sanitizeDesign(b.label_design);
      if (!design) return jsonError("Diseño de etiqueta no válido");
      update.label_design = design;
    }
  }
  if (b.reminder_days !== undefined) {
    const n = Number(b.reminder_days);
    if (!Number.isInteger(n) || n < 0 || n > 60) return jsonError("Días de aviso: entre 0 y 60");
    update.reminder_days = n;
  }

  if (Object.keys(update).length) {
    const { error } = await g.ctx.supabase.from("settings").update(update).eq("id", 1);
    if (error) return jsonError(error.message, 500);
  }

  const secret = typeof b.google_client_secret === "string" ? b.google_client_secret.trim() : "";
  if (secret || b.clear_google_client_secret === true) {
    if (!hasServiceRole()) return jsonError("Para guardar el Client Secret falta SUPABASE_SERVICE_ROLE_KEY en el servidor.", 503);
    const { error } = await createAdminClient()
      .from("app_secrets")
      .update({ google_client_secret: secret || null, updated_at: new Date().toISOString() })
      .eq("id", 1);
    if (error) return jsonError(error.message, 500);
  }

  try {
    return NextResponse.json({ settings: await loadSettings(g.ctx.supabase) });
  } catch (e) {
    return jsonError(errorMessage(e), 500);
  }
}
