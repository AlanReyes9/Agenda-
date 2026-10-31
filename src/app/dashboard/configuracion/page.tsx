"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, CalendarCheck2, CalendarX2, Copy, KeyRound, MessageCircle, Plug, Save, ShieldCheck, Store, Trash2, UserPlus, Users } from "lucide-react";
import { api } from "@/lib/fetcher";
import { useSettings } from "@/lib/hooks";
import { formatDate } from "@/lib/dates";
import { renderMessageTemplate, TEMPLATE_VARIABLES } from "@/lib/whatsapp";
import type { AppUser, Settings } from "@/lib/types";
import { cn, initials } from "@/lib/utils";
import { Button, Card, Field, Input, PageHeader, Select, Skeleton, Textarea } from "@/components/ui";

export default function ConfiguracionPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <ConfiguracionContent />
    </Suspense>
  );
}

function ConfiguracionContent() {
  const params = useSearchParams();
  const router = useRouter();
  const { data: settings, setData: setSettings, loading, reload } = useSettings();
  const [me, setMe] = useState<AppUser | null>(null);
  const [serviceRole, setServiceRole] = useState(true);

  useEffect(() => {
    api<{ user: AppUser }>("/api/me").then((r) => setMe(r.user)).catch(() => null);
    api<{ serviceRoleConfigured: boolean }>("/api/health").then((r) => setServiceRole(r.serviceRoleConfigured)).catch(() => null);
  }, []);

  useEffect(() => {
    const cal = params.get("calendar");
    if (!cal) return;
    if (cal === "connected") toast.success("Google Calendar conectado ✅");
    else toast.error("No se pudo conectar Google Calendar", { description: params.get("message") ?? undefined, duration: 10000 });
    router.replace("/dashboard/configuracion");
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const isAdmin = me?.role === "admin";

  return (
    <>
      <PageHeader title="Configuración" description="Datos del taller, mensajes de WhatsApp, Google Calendar y usuarios." />

      {!serviceRole && (
        <div className="mb-6 flex gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
          <AlertTriangle className="size-5 shrink-0 text-amber-600" />
          <div>
            <p className="font-medium">Falta la variable SUPABASE_SERVICE_ROLE_KEY en el servidor</p>
            <p className="text-muted mt-0.5">
              Sin ella no funcionan el registro de nuevos usuarios ni Google Calendar. Agrégala en Vercel → Settings → Environment Variables y vuelve a desplegar.
            </p>
          </div>
        </div>
      )}

      {loading || !settings ? (
        <div className="grid gap-6">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          <WorkshopSection settings={settings} onSaved={setSettings} readOnly={!isAdmin} />
          <WhatsAppSection settings={settings} onSaved={setSettings} readOnly={!isAdmin} />
          <CalendarSection settings={settings} onSaved={setSettings} onReload={reload} readOnly={!isAdmin} />
          {isAdmin && me && <UsersSection meId={me.id} />}
        </div>
      )}
    </>
  );
}

function SectionCard({ icon: Icon, title, description, children, className }: { icon: React.ComponentType<{ className?: string }>; title: string; description: string; children: React.ReactNode; className?: string }) {
  return (
    <Card className={cn("p-5 sm:p-6", className)}>
      <div className="mb-5 flex items-start gap-3">
        <div className="grid place-items-center size-10 shrink-0 rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400">
          <Icon className="size-5" />
        </div>
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="text-sm text-muted">{description}</p>
        </div>
      </div>
      {children}
    </Card>
  );
}

async function patchSettings(body: Record<string, unknown>): Promise<Settings> {
  const r = await api<{ settings: Settings }>("/api/settings", { method: "PATCH", json: body });
  return r.settings;
}

function WorkshopSection({ settings, onSaved, readOnly }: { settings: Settings; onSaved: (s: Settings) => void; readOnly: boolean }) {
  const [form, setForm] = useState({
    workshop_name: settings.workshop_name,
    workshop_phone: settings.workshop_phone ?? "",
    reminder_days: String(settings.reminder_days),
  });
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      onSaved(await patchSettings({ ...form, reminder_days: Number(form.reminder_days) }));
      toast.success("Datos del taller guardados");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  };
  return (
    <SectionCard icon={Store} title="Taller" description="Nombre que aparece en los mensajes y en el calendario.">
      <fieldset disabled={readOnly} className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre del taller" className="sm:col-span-2">
          <Input value={form.workshop_name} onChange={(e) => setForm({ ...form, workshop_name: e.target.value })} />
        </Field>
        <Field label="Teléfono del taller">
          <Input value={form.workshop_phone} onChange={(e) => setForm({ ...form, workshop_phone: e.target.value })} placeholder="809-000-0000" />
        </Field>
        <Field label="Avisar con (días)" hint="Cuántos días antes se marca como «Próximo».">
          <Input type="number" min={0} max={60} value={form.reminder_days} onChange={(e) => setForm({ ...form, reminder_days: e.target.value })} />
        </Field>
      </fieldset>
      {!readOnly && (
        <div className="mt-5 flex justify-end">
          <Button onClick={save} loading={saving}>
            <Save className="size-4" /> Guardar
          </Button>
        </div>
      )}
    </SectionCard>
  );
}

function WhatsAppSection({ settings, onSaved, readOnly }: { settings: Settings; onSaved: (s: Settings) => void; readOnly: boolean }) {
  const [template, setTemplate] = useState(settings.whatsapp_template);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  const insert = (token: string) => {
    const el = ref.current;
    if (!el) return setTemplate((t) => t + token);
    const start = el.selectionStart ?? template.length;
    const end = el.selectionEnd ?? template.length;
    const next = template.slice(0, start) + token + template.slice(end);
    setTemplate(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const preview = renderMessageTemplate(template, {
    cliente: "Juan Pérez",
    vehiculo: "Toyota Corolla 2018",
    placa: "A123456",
    fecha: "lunes 15 de diciembre de 2026",
    aceite: "5W-30 Sintético",
    kilometraje: "95,000 km",
    taller: settings.workshop_name,
  });

  const save = async () => {
    setSaving(true);
    try {
      onSaved(await patchSettings({ whatsapp_template: template }));
      toast.success("Plantilla guardada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard icon={MessageCircle} title="Mensaje de WhatsApp" description="Plantilla del recordatorio. Toca una variable para insertarla.">
      <div className="mb-3 flex flex-wrap gap-1.5">
        {TEMPLATE_VARIABLES.map((v) => (
          <button
            key={v.key}
            type="button"
            disabled={readOnly}
            onClick={() => insert(v.key)}
            title={v.label}
            className="rounded-lg border border-line bg-surface-2 px-2 py-1 font-mono text-xs text-muted hover:text-fg hover:border-brand-500/50 transition cursor-pointer disabled:cursor-default"
          >
            {v.key}
          </button>
        ))}
      </div>
      <Textarea ref={ref} rows={5} value={template} disabled={readOnly} onChange={(e) => setTemplate(e.target.value)} />
      <p className="mt-4 mb-2 text-xs font-medium uppercase tracking-wide text-muted">Vista previa</p>
      <div className="rounded-2xl bg-[#e5ddd5] dark:bg-[#0b141a] p-4">
        <div className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-[#dcf8c6] dark:bg-[#005c4b] px-3.5 py-2.5 text-sm text-stone-900 dark:text-white shadow-sm whitespace-pre-wrap">
          {preview}
        </div>
      </div>
      {!readOnly && (
        <div className="mt-5 flex justify-end">
          <Button onClick={save} loading={saving} disabled={template === settings.whatsapp_template}>
            <Save className="size-4" /> Guardar plantilla
          </Button>
        </div>
      )}
    </SectionCard>
  );
}

function CalendarSection({ settings, onSaved, onReload, readOnly }: { settings: Settings; onSaved: (s: Settings) => void; onReload: () => void; readOnly: boolean }) {
  const [form, setForm] = useState({
    google_client_id: settings.google_client_id ?? "",
    google_client_secret: "",
    google_redirect_uri: settings.google_redirect_uri ?? "",
    google_calendar_id: settings.google_calendar_id ?? "primary",
  });
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [defaultRedirect, setDefaultRedirect] = useState("");

  useEffect(() => {
    setDefaultRedirect(`${process.env.NEXT_PUBLIC_APP_URL || window.location.origin}/api/calendar/callback`);
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      onSaved(await patchSettings(form));
      setForm((f) => ({ ...f, google_client_secret: "" }));
      toast.success("Credenciales de Google guardadas");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  };

  const disconnect = async () => {
    setDisconnecting(true);
    try {
      await api("/api/calendar/disconnect", { method: "POST" });
      toast.success("Google Calendar desconectado");
      onReload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setDisconnecting(false);
    }
  };

  const redirect = form.google_redirect_uri || defaultRedirect;

  return (
    <SectionCard icon={CalendarCheck2} title="Google Calendar" description="Cada agenda crea un evento de día completo con recordatorios." className="xl:col-span-2">
      <div
        className={cn(
          "mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border p-4",
          settings.google_connected ? "border-emerald-500/30 bg-emerald-500/5" : "border-line bg-surface-2/50",
        )}
      >
        <div className="flex items-center gap-3">
          {settings.google_connected ? <CalendarCheck2 className="size-6 text-emerald-600" /> : <CalendarX2 className="size-6 text-muted" />}
          <div>
            <p className="font-medium">{settings.google_connected ? "Conectado" : "No conectado"}</p>
            <p className="text-sm text-muted">
              {settings.google_connected
                ? `${settings.google_connected_email ?? "Cuenta de Google"}${settings.google_connected_at ? ` · desde ${formatDate(settings.google_connected_at.slice(0, 10))}` : ""}`
                : "Guarda las credenciales y pulsa Conectar."}
            </p>
          </div>
        </div>
        {!readOnly && (
          <div className="flex gap-2">
            {settings.google_connected && (
              <Button variant="secondary" onClick={disconnect} loading={disconnecting}>
                Desconectar
              </Button>
            )}
            <a href="/api/calendar/connect">
              <Button type="button" disabled={!settings.google_client_id || !settings.google_client_secret_set}>
                <Plug className="size-4" /> {settings.google_connected ? "Reconectar" : "Conectar"}
              </Button>
            </a>
          </div>
        )}
      </div>

      {!readOnly && (
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Client ID" className="sm:col-span-2">
              <Input value={form.google_client_id} onChange={(e) => setForm({ ...form, google_client_id: e.target.value })} placeholder="xxxx.apps.googleusercontent.com" />
            </Field>
            <Field
              label="Client Secret"
              className="sm:col-span-2"
              hint={settings.google_client_secret_set ? "✓ Guardado. Déjalo vacío para mantenerlo." : "Nunca se muestra después de guardarlo."}
            >
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
                <Input
                  type="password"
                  autoComplete="off"
                  className="pl-9"
                  value={form.google_client_secret}
                  onChange={(e) => setForm({ ...form, google_client_secret: e.target.value })}
                  placeholder={settings.google_client_secret_set ? "••••••••••••" : "GOCSPX-…"}
                />
              </div>
            </Field>
            <Field label="Redirect URI (opcional)" hint="Vacío = se usa la URL de esta app.">
              <Input value={form.google_redirect_uri} onChange={(e) => setForm({ ...form, google_redirect_uri: e.target.value })} placeholder={defaultRedirect} />
            </Field>
            <Field label="ID del calendario">
              <Input value={form.google_calendar_id} onChange={(e) => setForm({ ...form, google_calendar_id: e.target.value })} placeholder="primary" />
            </Field>
            <div className="sm:col-span-2 flex justify-end">
              <Button onClick={save} loading={saving}>
                <Save className="size-4" /> Guardar credenciales
              </Button>
            </div>
          </div>

          <div className="rounded-2xl bg-surface-2/60 p-4 text-sm">
            <p className="font-medium mb-2">Cómo obtener las credenciales</p>
            <ol className="list-decimal pl-4 space-y-1.5 text-muted">
              <li>
                En{" "}
                <a className="text-brand-600 underline" href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">
                  Google Cloud Console
                </a>{" "}
                activa la <b>Google Calendar API</b>.
              </li>
              <li>Crea un «ID de cliente OAuth» tipo <b>Aplicación web</b>.</li>
              <li>En «URI de redireccionamiento autorizados» pega:</li>
            </ol>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(redirect);
                toast.success("Copiado");
              }}
              className="mt-2 flex w-full items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-left font-mono text-xs break-all hover:border-brand-500/50 cursor-pointer"
            >
              <Copy className="size-3.5 shrink-0" />
              {redirect}
            </button>
            <p className="mt-3 text-muted">
              Si la pantalla de consentimiento está en modo <b>Testing</b>, agrega tu correo como usuario de prueba o verás «Acceso bloqueado».
            </p>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

function UsersSection({ meId }: { meId: string }) {
  const [users, setUsers] = useState<AppUser[] | null>(null);
  const load = () => api<{ users: AppUser[] }>("/api/users").then((r) => setUsers(r.users)).catch((e) => toast.error(e.message));
  useEffect(() => {
    load();
  }, []);

  const setRole = async (id: string, role: string) => {
    try {
      await api(`/api/users/${id}`, { method: "PATCH", json: { role } });
      toast.success(role === "pending" ? "Acceso retirado" : "Rol actualizado");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    }
  };
  const remove = async (u: AppUser) => {
    if (!window.confirm(`¿Eliminar la cuenta de ${u.email}?`)) return;
    try {
      await api(`/api/users/${u.id}`, { method: "DELETE" });
      toast.success("Usuario eliminado");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    }
  };

  const pending = users?.filter((u) => u.role === "pending").length ?? 0;
  const [adding, setAdding] = useState(false);
  const [newUser, setNewUser] = useState({ full_name: "", email: "", password: "", role: "staff" });
  const [creating, setCreating] = useState(false);
  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await api("/api/users", { method: "POST", json: newUser });
      toast.success("Cuenta creada", { description: `Comparte el correo y la contraseña con ${newUser.full_name || newUser.email}.` });
      setNewUser({ full_name: "", email: "", password: "", role: "staff" });
      setAdding(false);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setCreating(false);
    }
  };

  return (
    <SectionCard icon={Users} title="Usuarios" description="Crea las cuentas de tu personal. El registro público está cerrado." className="xl:col-span-2">
      <div className="mb-4">
        {adding ? (
          <form onSubmit={createUser} className="grid gap-4 rounded-2xl border border-dashed border-brand-500/40 bg-brand-500/[0.03] p-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Nombre">
              <Input value={newUser.full_name} onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })} placeholder="Nombre" />
            </Field>
            <Field label="Correo *">
              <Input type="email" required value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} placeholder="correo@ejemplo.com" />
            </Field>
            <Field label="Contraseña *" hint="Mínimo 8 caracteres">
              <Input type="text" required minLength={8} autoComplete="off" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} />
            </Field>
            <Field label="Rol">
              <Select value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}>
                <option value="staff">Personal</option>
                <option value="admin">Administrador</option>
              </Select>
            </Field>
            <div className="sm:col-span-2 lg:col-span-4 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setAdding(false)}>
                Cancelar
              </Button>
              <Button type="submit" loading={creating}>
                Crear cuenta
              </Button>
            </div>
          </form>
        ) : (
          <Button variant="secondary" onClick={() => setAdding(true)}>
            <UserPlus className="size-4" /> Agregar usuario
          </Button>
        )}
      </div>
      {pending > 0 && (
        <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-amber-500/10 px-3 py-1 text-sm font-medium text-amber-700 dark:text-amber-400">
          <ShieldCheck className="size-4" /> {pending} {pending === 1 ? "cuenta pendiente" : "cuentas pendientes"} de aprobación
        </p>
      )}
      {!users ? (
        <Skeleton className="h-32" />
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-line">
          {users.map((u) => (
            <li key={u.id} className="flex flex-col sm:flex-row sm:items-center gap-3 p-3.5">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="grid place-items-center size-9 shrink-0 rounded-full bg-surface-2 text-xs font-semibold">{initials(u.full_name || u.email)}</div>
                <div className="min-w-0">
                  <p className="font-medium truncate">
                    {u.full_name || u.email.split("@")[0]} {u.id === meId && <span className="text-xs text-muted">(tú)</span>}
                  </p>
                  <p className="text-sm text-muted truncate">{u.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {u.role === "pending" && (
                  <Button size="sm" variant="success" onClick={() => setRole(u.id, "staff")}>
                    Aprobar
                  </Button>
                )}
                <Select value={u.role} disabled={u.id === meId} onChange={(e) => setRole(u.id, e.target.value)} className="h-8 w-40 text-xs">
                  <option value="admin">Administrador</option>
                  <option value="staff">Personal</option>
                  <option value="pending">Pendiente</option>
                </Select>
                {u.id !== meId && (
                  <Button size="icon" variant="ghost" onClick={() => remove(u)} aria-label="Eliminar" className="hover:text-red-600">
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
