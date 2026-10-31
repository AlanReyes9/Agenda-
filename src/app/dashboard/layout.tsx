import { redirect } from "next/navigation";
import { Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Shell } from "@/components/Shell";
import { PendingSignOut } from "@/components/PendingSignOut";
import type { AppUser } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile, error } = await supabase
    .from("users")
    .select("id, email, full_name, role, created_at")
    .eq("id", user.id)
    .maybeSingle();

  if (error?.message?.includes("does not exist")) {
    return (
      <Centered title="Falta crear la base de datos" icon={<Clock className="size-6" />}>
        Ejecuta <code className="font-mono">supabase/schema.sql</code> en el SQL Editor de Supabase.
      </Centered>
    );
  }

  const me = (profile as AppUser | null) ?? { id: user.id, email: user.email ?? "", full_name: null, role: "pending", created_at: "" };

  if (me.role === "pending") {
    return (
      <Centered title="Cuenta pendiente de aprobación" icon={<Clock className="size-6" />}>
        Un administrador del taller debe aprobar tu cuenta (<b>{me.email}</b>) en Configuración → Usuarios.
        <div className="mt-6">
          <PendingSignOut />
        </div>
      </Centered>
    );
  }

  return <Shell user={me}>{children}</Shell>;
}

function Centered({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh grid place-items-center p-6">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-5 grid place-items-center size-14 rounded-2xl bg-brand-500/10 text-brand-600">{icon}</div>
        <h1 className="text-xl font-semibold">{title}</h1>
        <div className="mt-2 text-muted">{children}</div>
      </div>
    </div>
  );
}
