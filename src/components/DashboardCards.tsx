"use client";

import { AlertTriangle, CalendarClock, CheckCircle2, Users } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DashboardStats {
  overdue: number;
  upcoming: number;
  thisMonth: number;
  clients: number;
}

export function DashboardCards({ stats, reminderDays, loading }: { stats: DashboardStats; reminderDays: number; loading?: boolean }) {
  const cards = [
    { label: "Vencidos", value: stats.overdue, hint: "Requieren llamada", icon: AlertTriangle, tone: "from-red-500/15 text-red-600 dark:text-red-400" },
    { label: "Próximos", value: stats.upcoming, hint: `En los próximos ${reminderDays} días`, icon: CalendarClock, tone: "from-amber-500/15 text-amber-600 dark:text-amber-400" },
    { label: "Este mes", value: stats.thisMonth, hint: "Cambios programados", icon: CheckCircle2, tone: "from-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
    { label: "Clientes", value: stats.clients, hint: "Registrados", icon: Users, tone: "from-brand-500/15 text-brand-600 dark:text-brand-400" },
  ];
  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
      {cards.map(({ label, value, hint, icon: Icon, tone }) => (
        <div key={label} className={cn("relative overflow-hidden rounded-2xl border border-line bg-surface p-4 sm:p-5")}>
          <div className={cn("absolute inset-0 bg-gradient-to-br to-transparent opacity-80 pointer-events-none", tone.split(" ")[0])} />
          <div className="relative flex items-start justify-between">
            <p className="text-sm font-medium text-muted">{label}</p>
            <Icon className={cn("size-5", tone.split(" ").slice(1).join(" "))} />
          </div>
          <p className="relative mt-3 text-3xl sm:text-4xl font-semibold tracking-tight tabular-nums">
            {loading ? <span className="inline-block h-9 w-12 animate-pulse rounded-lg bg-surface-2" /> : value}
          </p>
          <p className="relative mt-1 text-xs text-muted">{hint}</p>
        </div>
      ))}
    </div>
  );
}
