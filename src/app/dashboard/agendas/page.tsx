"use client";

import { useMemo, useState } from "react";
import { CalendarPlus, CalendarSearch, Search } from "lucide-react";
import { useAppointments, useClients, useSettings } from "@/lib/hooks";
import { effectiveStatus } from "@/lib/dates";
import type { AppointmentStatus } from "@/lib/types";
import { cn, vehicleLabel } from "@/lib/utils";
import { AppointmentsTable } from "@/components/AppointmentsTable";
import { AppointmentModal, type AppointmentModalMode } from "@/components/AppointmentModal";
import { ExternalCalendarEvents } from "@/components/ExternalCalendarEvents";
import { Button, Card, EmptyState, Input, ListSkeleton, PageHeader } from "@/components/ui";

type Filter = "activas" | "vencido" | "proximo" | "pendiente" | "cerradas" | "todas";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "activas", label: "Activas" },
  { key: "vencido", label: "Vencidas" },
  { key: "proximo", label: "Próximas" },
  { key: "pendiente", label: "Al día" },
  { key: "cerradas", label: "Historial" },
  { key: "todas", label: "Todas" },
];

export default function AgendasPage() {
  const { data: appointments, loading, reload } = useAppointments();
  const { data: clients, setData: setClients } = useClients();
  const { data: settings } = useSettings();
  const [modal, setModal] = useState<AppointmentModalMode | null>(null);
  const [filter, setFilter] = useState<Filter>("activas");
  const [q, setQ] = useState("");
  const [view, setView] = useState<"agendas" | "calendario">("agendas");
  const reminderDays = settings?.reminder_days ?? 7;

  const withStatus = useMemo(
    () => appointments.map((a) => ({ a, s: effectiveStatus(a, reminderDays) as AppointmentStatus })),
    [appointments, reminderDays],
  );

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { activas: 0, vencido: 0, proximo: 0, pendiente: 0, cerradas: 0, todas: withStatus.length };
    for (const { s } of withStatus) {
      if (s === "completado" || s === "renovado") c.cerradas++;
      else {
        c.activas++;
        c[s]++;
      }
    }
    return c;
  }, [withStatus]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return withStatus
      .filter(({ s }) => {
        if (filter === "todas") return true;
        if (filter === "cerradas") return s === "completado" || s === "renovado";
        if (filter === "activas") return s !== "completado" && s !== "renovado";
        return s === filter;
      })
      .filter(({ a }) => {
        if (!term) return true;
        return [a.client?.name, a.client?.phone, vehicleLabel(a.vehicle), a.oil_type, a.notes]
          .filter(Boolean)
          .some((t) => t!.toLowerCase().includes(term));
      })
      .map(({ a }) => a)
      .sort((x, y) =>
        filter === "cerradas" ? y.next_due_date.localeCompare(x.next_due_date) : x.next_due_date.localeCompare(y.next_due_date),
      );
  }, [withStatus, filter, q]);

  return (
    <>
      <PageHeader
        title="Agendas"
        description="Cambios de aceite programados de todos los clientes."
        actions={
          <Button onClick={() => setModal({ type: "create" })}>
            <CalendarPlus className="size-4" /> Nueva agenda
          </Button>
        }
      />

      <div className="mb-5 inline-flex rounded-xl bg-surface-2 p-1 text-sm">
        {(["agendas", "calendario"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={cn("rounded-lg px-4 py-1.5 font-medium transition cursor-pointer", view === v ? "bg-surface shadow-sm" : "text-muted hover:text-fg")}
          >
            {v === "agendas" ? "Agendas" : "Google Calendar"}
          </button>
        ))}
      </div>

      {view === "calendario" ? (
        <ExternalCalendarEvents
          clients={clients}
          onClientCreated={(c) => setClients((cs) => [...cs, c])}
          onRegistered={reload}
        />
      ) : (
        <Card>
          <div className="flex flex-col gap-3 border-b border-line p-4 md:flex-row md:items-center md:justify-between">
            <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-1 md:pb-0">
              {FILTERS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className={cn(
                    "shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition cursor-pointer",
                    filter === key ? "bg-fg text-bg" : "text-muted hover:bg-surface-2 hover:text-fg",
                  )}
                >
                  {label}
                  <span className={cn("text-xs tabular-nums", filter === key ? "opacity-70" : "opacity-60")}>{counts[key]}</span>
                </button>
              ))}
            </div>
            <div className="relative md:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar cliente, placa, aceite…" className="pl-9" />
            </div>
          </div>

          {loading ? (
            <ListSkeleton />
          ) : filtered.length ? (
            <AppointmentsTable
              appointments={filtered}
              settings={settings}
              onEdit={(a) => setModal({ type: "edit", appointment: a })}
              onRenew={(a) => setModal({ type: "renew", appointment: a })}
              onChanged={reload}
            />
          ) : (
            <EmptyState
              icon={<CalendarSearch className="size-6" />}
              title={appointments.length ? "Sin resultados" : "Aún no hay agendas"}
              description={appointments.length ? "Prueba con otro filtro o búsqueda." : "Crea la primera agenda de cambio de aceite."}
              action={
                !appointments.length && (
                  <Button onClick={() => setModal({ type: "create" })}>
                    <CalendarPlus className="size-4" /> Nueva agenda
                  </Button>
                )
              }
            />
          )}
        </Card>
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
