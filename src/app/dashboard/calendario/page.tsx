"use client";

import { useMemo, useState } from "react";
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { es } from "date-fns/locale";
import { CalendarPlus, ChevronLeft, ChevronRight, CalendarDays, List } from "lucide-react";
import { useAppointments, useClients, useSettings } from "@/lib/hooks";
import { effectiveStatus, formatLongDate, relativeDays, todayISO } from "@/lib/dates";
import type { Appointment, AppointmentStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AppointmentsTable } from "@/components/AppointmentsTable";
import { AppointmentModal, type AppointmentModalMode } from "@/components/AppointmentModal";
import { Button, Card, EmptyState, ListSkeleton, PageHeader } from "@/components/ui";

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

const chipStyle: Record<AppointmentStatus, string> = {
  vencido: "bg-red-500/12 text-red-700 dark:text-red-300 border-red-500/30",
  proximo: "bg-amber-500/12 text-amber-800 dark:text-amber-300 border-amber-500/30",
  pendiente: "bg-emerald-500/12 text-emerald-800 dark:text-emerald-300 border-emerald-500/30",
  completado: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/25",
  renovado: "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/25",
};
const dotStyle: Record<AppointmentStatus, string> = {
  vencido: "bg-red-500",
  proximo: "bg-amber-500",
  pendiente: "bg-emerald-500",
  completado: "bg-sky-500",
  renovado: "bg-violet-500",
};

const iso = (d: Date) => format(d, "yyyy-MM-dd");

export default function CalendarioPage() {
  const { data: appointments, loading, reload } = useAppointments();
  const { data: clients, setData: setClients } = useClients();
  const { data: settings } = useSettings();
  const today = todayISO();
  const [month, setMonth] = useState(() => startOfMonth(parseISO(today)));
  const [selected, setSelected] = useState(today);
  const [showClosed, setShowClosed] = useState(false);
  const [view, setView] = useState<"mes" | "lista">("mes");
  const [modal, setModal] = useState<AppointmentModalMode | null>(null);
  const reminderDays = settings?.reminder_days ?? 7;

  const byDay = useMemo(() => {
    const m = new Map<string, { a: Appointment; s: AppointmentStatus }[]>();
    for (const a of appointments) {
      const s = effectiveStatus(a, reminderDays);
      if (!showClosed && (s === "completado" || s === "renovado")) continue;
      const list = m.get(a.next_due_date) ?? [];
      list.push({ a, s });
      m.set(a.next_due_date, list);
    }
    for (const list of m.values()) list.sort((x, y) => (x.a.client?.name ?? "").localeCompare(y.a.client?.name ?? ""));
    return m;
  }, [appointments, reminderDays, showClosed]);

  const days = useMemo(
    () =>
      eachDayOfInterval({
        start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }),
        end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }),
      }),
    [month],
  );

  const monthTotal = days.filter((d) => isSameMonth(d, month)).reduce((n, d) => n + (byDay.get(iso(d))?.length ?? 0), 0);
  const selectedItems = (byDay.get(selected) ?? []).map((x) => x.a);

  // Vista lista: próximos 60 días a partir del día seleccionado del mes
  const listDays = useMemo(() => {
    const start = isSameMonth(parseISO(today), month) ? parseISO(today) : month;
    const out: { day: string; items: Appointment[] }[] = [];
    for (let i = 0; i < 62; i++) {
      const d = iso(addDays(start, i));
      const items = byDay.get(d);
      if (items?.length) out.push({ day: d, items: items.map((x) => x.a) });
    }
    return out;
  }, [byDay, month, today]);

  const listProps = {
    settings,
    onEdit: (a: Appointment) => setModal({ type: "edit", appointment: a }),
    onRenew: (a: Appointment) => setModal({ type: "renew", appointment: a }),
    onChanged: reload,
  };

  const goto = (m: Date) => {
    setMonth(m);
    setSelected(isSameMonth(parseISO(today), m) ? today : iso(m));
  };

  return (
    <>
      <PageHeader
        title="Calendario"
        description="Todos los cambios de aceite programados por fecha."
        actions={
          <Button onClick={() => setModal({ type: "create" })}>
            <CalendarPlus className="size-4" /> Nueva agenda
          </Button>
        }
      />

      {/* Barra de navegación */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-xl border border-line bg-surface p-1">
          <Button variant="ghost" size="icon" onClick={() => goto(addMonths(month, -1))} aria-label="Mes anterior">
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => goto(startOfMonth(parseISO(today)))}>
            Hoy
          </Button>
          <Button variant="ghost" size="icon" onClick={() => goto(addMonths(month, 1))} aria-label="Mes siguiente">
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <h2 className="text-xl font-semibold capitalize tracking-tight">{format(month, "MMMM yyyy", { locale: es })}</h2>
        <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-muted tabular-nums">
          {monthTotal} {monthTotal === 1 ? "cambio" : "cambios"}
        </span>
        <div className="ml-auto flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-muted cursor-pointer">
            <input type="checkbox" className="accent-brand-500" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />
            Ver completadas
          </label>
          <div className="inline-flex rounded-xl bg-surface-2 p-1 text-sm">
            {(
              [
                ["mes", "Mes", CalendarDays],
                ["lista", "Lista", List],
              ] as const
            ).map(([v, label, Icon]) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium transition cursor-pointer",
                  view === v ? "bg-surface shadow-sm" : "text-muted hover:text-fg",
                )}
              >
                <Icon className="size-4" /> {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {view === "mes" ? (
        <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
          <Card className="overflow-hidden">
            <div className="grid grid-cols-7 border-b border-line bg-surface-2/50">
              {WEEKDAYS.map((d) => (
                <div key={d} className="py-2.5 text-center text-xs font-medium uppercase tracking-wide text-muted">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {days.map((d, i) => {
                const key = iso(d);
                const items = byDay.get(key) ?? [];
                const inMonth = isSameMonth(d, month);
                const isToday = key === today;
                const isSelected = key === selected;
                const weekend = i % 7 >= 5;
                return (
                  <button
                    key={key}
                    onClick={() => setSelected(key)}
                    className={cn(
                      "group relative flex min-h-16 sm:min-h-28 flex-col items-stretch gap-1 border-b border-r border-line p-1.5 sm:p-2 text-left transition cursor-pointer",
                      (i + 1) % 7 === 0 && "border-r-0",
                      !inMonth && "bg-surface-2/40",
                      weekend && inMonth && "bg-surface-2/20",
                      isSelected ? "bg-brand-500/[0.07] ring-2 ring-inset ring-brand-500/60" : "hover:bg-surface-2/60",
                    )}
                  >
                    <span
                      className={cn(
                        "grid place-items-center size-7 rounded-full text-sm tabular-nums self-center sm:self-start",
                        !inMonth && "text-muted/60",
                        isToday && "bg-brand-500 font-semibold text-white shadow-sm shadow-brand-500/40",
                      )}
                    >
                      {format(d, "d")}
                    </span>

                    {/* Móvil: puntos */}
                    {items.length > 0 && (
                      <div className="flex flex-wrap justify-center gap-0.5 sm:hidden">
                        {items.slice(0, 4).map(({ a, s }) => (
                          <span key={a.id} className={cn("size-1.5 rounded-full", dotStyle[s])} />
                        ))}
                      </div>
                    )}

                    {/* Escritorio: etiquetas con el cliente */}
                    <div className="hidden sm:flex flex-col gap-1">
                      {items.slice(0, 3).map(({ a, s }) => (
                        <span key={a.id} className={cn("truncate rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-tight", chipStyle[s])}>
                          {a.client?.name ?? "Cliente"}
                        </span>
                      ))}
                      {items.length > 3 && <span className="px-1 text-[11px] font-medium text-muted">+{items.length - 3} más</span>}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line px-4 py-3 text-xs text-muted">
              {(["vencido", "proximo", "pendiente", ...(showClosed ? (["completado", "renovado"] as const) : [])] as AppointmentStatus[]).map((s) => (
                <span key={s} className="inline-flex items-center gap-1.5">
                  <span className={cn("size-2 rounded-full", dotStyle[s])} />
                  {{ vencido: "Vencido", proximo: "Próximo", pendiente: "Al día", completado: "Completado", renovado: "Renovado" }[s]}
                </span>
              ))}
            </div>
          </Card>

          {/* Panel del día seleccionado */}
          <Card className="h-fit xl:sticky xl:top-6">
            <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted">{relativeDays(selected)}</p>
                <h3 className="font-semibold first-letter:uppercase">{formatLongDate(selected)}</h3>
              </div>
              <Button size="sm" variant="secondary" onClick={() => setModal({ type: "create" })} title="Nueva agenda">
                <CalendarPlus className="size-3.5" />
              </Button>
            </div>
            {loading ? (
              <ListSkeleton />
            ) : selectedItems.length ? (
              <AppointmentsTable appointments={selectedItems} {...listProps} compact />
            ) : (
              <EmptyState icon={<CalendarDays className="size-6" />} title="Día libre" description="No hay cambios de aceite programados para este día." />
            )}
          </Card>
        </div>
      ) : (
        <div className="space-y-4">
          {loading ? (
            <Card>
              <ListSkeleton />
            </Card>
          ) : listDays.length === 0 ? (
            <Card>
              <EmptyState icon={<CalendarDays className="size-6" />} title="Sin cambios" description="No hay cambios programados en los próximos dos meses." />
            </Card>
          ) : (
            listDays.map(({ day, items }) => (
              <Card key={day}>
                <div className="flex items-center gap-3 border-b border-line px-5 py-3">
                  <div className={cn("grid w-12 place-items-center rounded-xl py-1 text-center", day === today ? "bg-brand-500 text-white" : "bg-surface-2")}>
                    <span className="text-[10px] uppercase leading-none opacity-80">{format(parseISO(day), "MMM", { locale: es })}</span>
                    <span className="text-lg font-semibold leading-tight">{format(parseISO(day), "d")}</span>
                  </div>
                  <div>
                    <p className="font-semibold capitalize">{format(parseISO(day), "EEEE", { locale: es })}</p>
                    <p className="text-xs text-muted">
                      {relativeDays(day)} · {items.length} {items.length === 1 ? "cambio" : "cambios"}
                    </p>
                  </div>
                </div>
                <AppointmentsTable appointments={items} {...listProps} />
              </Card>
            ))
          )}
        </div>
      )}

      <AppointmentModal
        mode={modal}
        onClose={() => setModal(null)}
        clients={clients}
        onClientCreated={(c) => setClients((cs) => [...cs, c].sort((a, b) => a.name.localeCompare(b.name)))}
        onSaved={reload}
      />
    </>
  );
}
