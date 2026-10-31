"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BellRing, CalendarCheck2, MessageCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { api } from "@/lib/fetcher";
import { Button, Field, Input } from "@/components/ui";
import { Logo, ThemeToggle } from "@/components/Shell";
import { cn } from "@/lib/utils";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [loading, setLoading] = useState(false);
  const [registrationOpen, setRegistrationOpen] = useState(false);

  useEffect(() => {
    api<{ open: boolean }>("/api/auth/register")
      .then((r) => {
        setRegistrationOpen(r.open);
        if (r.open) setMode("register");
      })
      .catch(() => setRegistrationOpen(false));
  }, []);
  const [form, setForm] = useState({ email: "", password: "", full_name: "" });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const supabase = createClient();
      if (mode === "register") {
        const res = await api<{ role: string }>("/api/auth/register", { method: "POST", json: form });
        toast.success(
          res.role === "admin" ? "Cuenta de administrador creada" : "Cuenta creada. Un administrador debe aprobarla.",
        );
      }
      const { error } = await supabase.auth.signInWithPassword({ email: form.email.trim(), password: form.password });
      if (error) {
        throw new Error(error.message.includes("Invalid login") ? "Correo o contraseña incorrectos" : error.message);
      }
      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error inesperado");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh grid lg:grid-cols-2">
      {/* Panel de marca */}
      <div className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-stone-950 p-12 text-white">
        <div className="absolute -top-40 -right-40 size-[520px] rounded-full bg-brand-500/30 blur-3xl" />
        <div className="absolute -bottom-48 -left-24 size-[420px] rounded-full bg-brand-700/25 blur-3xl" />
        <div className="relative [&_p]:text-white [&_p+p]:text-white/60">
          <Logo />
        </div>
        <div className="relative space-y-8">
          <h1 className="text-5xl font-semibold leading-[1.05] tracking-tight">
            Ningún cliente
            <br />
            <span className="bg-gradient-to-r from-brand-300 to-brand-500 bg-clip-text text-transparent">
              se queda sin su cambio.
            </span>
          </h1>
          <ul className="space-y-4 text-white/75">
            {[
              { icon: BellRing, text: "Alertas de cambios próximos y vencidos" },
              { icon: MessageCircle, text: "Recordatorios por WhatsApp en un clic" },
              { icon: CalendarCheck2, text: "Sincronizado con Google Calendar" },
            ].map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3">
                <span className="grid place-items-center size-9 rounded-xl bg-white/10 ring-1 ring-white/10">
                  <Icon className="size-4 text-brand-300" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-white/40">© {new Date().getFullYear()} Auto Soluciones Daniel · JAAJ Producciones</p>
      </div>

      {/* Formulario */}
      <div className="relative flex items-center justify-center p-6">
        <ThemeToggle className="absolute right-4 top-4" />
        <div className="w-full max-w-sm">
          <div className="lg:hidden mb-10">
            <Logo />
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">
            {mode === "login" ? "Bienvenido de nuevo" : "Crear cuenta"}
          </h2>
          <p className="text-muted mt-1 text-sm">
            {mode === "login"
              ? "Inicia sesión para ver las agendas del taller."
              : "Esta será la cuenta del administrador. Después, el registro se cierra."}
          </p>

          {registrationOpen && (
          <div className="mt-6 grid grid-cols-2 rounded-xl bg-surface-2 p-1 text-sm">
            {(["login", "register"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cn(
                  "rounded-lg py-2 font-medium transition cursor-pointer",
                  mode === m ? "bg-surface shadow-sm" : "text-muted hover:text-fg",
                )}
              >
                {m === "login" ? "Iniciar sesión" : "Registrarse"}
              </button>
            ))}
          </div>
          )}

          <form onSubmit={submit} className="mt-6 space-y-4">
            {mode === "register" && (
              <Field label="Nombre">
                <Input value={form.full_name} onChange={set("full_name")} placeholder="Daniel Pérez" autoComplete="name" />
              </Field>
            )}
            <Field label="Correo">
              <Input type="email" required value={form.email} onChange={set("email")} placeholder="tu@correo.com" autoComplete="email" />
            </Field>
            <Field label="Contraseña" hint={mode === "register" ? "Mínimo 8 caracteres" : undefined}>
              <Input
                type="password"
                required
                minLength={mode === "register" ? 8 : undefined}
                value={form.password}
                onChange={set("password")}
                placeholder="••••••••"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
              />
            </Field>
            <Button type="submit" size="lg" className="w-full" loading={loading}>
              {mode === "login" ? "Entrar" : "Crear cuenta"}
            </Button>
          </form>
          {!registrationOpen && (
            <p className="mt-6 text-center text-xs text-muted">¿No tienes cuenta? Pídesela al administrador del taller.</p>
          )}
        </div>
      </div>
    </div>
  );
}
