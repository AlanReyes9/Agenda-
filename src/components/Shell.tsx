"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { CalendarClock, CalendarDays, Droplet, LayoutDashboard, LogOut, Menu, Moon, Printer, Settings, Sun, Users, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn, initials } from "@/lib/utils";
import type { AppUser } from "@/lib/types";

const NAV = [
  { href: "/dashboard", label: "Inicio", icon: LayoutDashboard },
  { href: "/dashboard/calendario", label: "Calendario", icon: CalendarDays },
  { href: "/dashboard/agendas", label: "Agendas", icon: CalendarClock },
  { href: "/dashboard/clientes", label: "Clientes", icon: Users },
  { href: "/dashboard/etiquetas", label: "Etiquetas", icon: Printer },
  { href: "/dashboard/configuracion", label: "Configuración", icon: Settings },
];

export function ThemeToggle({ className }: { className?: string }) {
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);
  return (
    <button
      type="button"
      onClick={() => {
        const next = !dark;
        setDark(next);
        document.documentElement.classList.toggle("dark", next);
        try {
          localStorage.setItem("theme", next ? "dark" : "light");
        } catch {}
      }}
      className={cn("grid place-items-center size-9 rounded-lg text-muted hover:text-fg hover:bg-surface-2 transition cursor-pointer", className)}
      aria-label="Cambiar tema"
    >
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}

export function Logo({ name = "Auto Soluciones Daniel" }: { name?: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="grid place-items-center size-10 rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 text-white shadow-lg shadow-brand-500/30">
        <Droplet className="size-5" fill="currentColor" />
      </div>
      <div className="leading-tight">
        <p className="font-semibold text-sm">{name}</p>
        <p className="text-xs text-muted">Gestión de taller</p>
      </div>
    </div>
  );
}

function Sidebar({ user, onNavigate }: { user: AppUser; onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const logout = async () => {
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  };
  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <div className="px-2 pt-2">
        <Logo />
      </div>
      <nav className="flex-1 space-y-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = href === "/dashboard" ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              className={cn(
                "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                active
                  ? "bg-brand-500/10 text-brand-700 dark:text-brand-300"
                  : "text-muted hover:bg-surface-2 hover:text-fg",
              )}
            >
              <Icon className={cn("size-[18px]", active && "text-brand-600 dark:text-brand-400")} />
              {label}
              {active && <span className="ml-auto size-1.5 rounded-full bg-brand-500" />}
            </Link>
          );
        })}
      </nav>
      <div className="rounded-2xl border border-line bg-surface-2/60 p-3">
        <div className="flex items-center gap-3">
          <div className="grid place-items-center size-9 rounded-full bg-gradient-to-br from-stone-600 to-stone-800 text-white text-xs font-semibold">
            {initials(user.full_name || user.email)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{user.full_name || user.email.split("@")[0]}</p>
            <p className="text-xs text-muted truncate">{user.role === "admin" ? "Administrador" : "Personal"}</p>
          </div>
          <ThemeToggle />
        </div>
        <button
          onClick={logout}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg py-2 text-xs font-medium text-muted hover:bg-surface hover:text-fg transition cursor-pointer"
        >
          <LogOut className="size-3.5" /> Cerrar sesión
        </button>
      </div>
    </div>
  );
}

export function Shell({ user, children }: { user: AppUser; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);

  return (
    <div className="min-h-dvh lg:pl-72">
      {/* Escritorio */}
      <aside className="hidden lg:block fixed inset-y-0 left-0 w-72 border-r border-line bg-surface">
        <Sidebar user={user} />
      </aside>

      {/* Móvil: barra superior + drawer */}
      <header className="lg:hidden sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-bg/80 backdrop-blur-xl px-4 h-16">
        <Logo />
        <button
          onClick={() => setOpen(true)}
          className="grid place-items-center size-10 rounded-xl border border-line bg-surface cursor-pointer"
          aria-label="Abrir menú"
        >
          <Menu className="size-5" />
        </button>
      </header>
      {open && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[85%] max-w-xs bg-surface border-r border-line animate-slide-in">
            <button
              onClick={() => setOpen(false)}
              className="absolute right-3 top-4 grid place-items-center size-9 rounded-lg text-muted hover:bg-surface-2 cursor-pointer"
              aria-label="Cerrar menú"
            >
              <X className="size-4" />
            </button>
            <Sidebar user={user} onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10 py-6 lg:py-10">{children}</main>
    </div>
  );
}
