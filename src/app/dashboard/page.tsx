"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarPlus, PartyPopper } from "lucide-react";
import { useAppointments, useClients, useSettings } from "@/lib/hooks";
import { daysUntil, effectiveStatus, todayISO } from "@/lib/dates";
import type { Appointment } from "@/lib/types";
import { AppointmentsTable } from "@/components/AppointmentsTable";
import { AppointmentModal, type AppointmentModalMode } from "@/components/AppointmentModal";
import { DashboardCards } from "@/components/DashboardCards";
import { Button, Card, EmptyState, ListSkeleton, PageHeader } from "@/components/ui";

function greeting() {
  const h = Number(new Intl.DateTimeFormat("es-DO", { hour: "numeric", hour12: false, timeZone: "America/Santo_Domingo" }).format(new Date()));
  return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
}

export default function DashboardPage() {
  const { data: appointments, loading, reload } = useAppointments();
  const { data: clients, setData: setClients } = useClients();
  const { data: settings } = useSettings();
  const [modal, setModal] = useState<AppointmentModalMode | null>(null);
  const reminderDays = settings?.reminder_days ?? 7;

  const { overdue, upcoming, stats } = useMemo(() => {
    const active = appointments.filter((a) => !["completado", "renovado"].includes(a.status));
    const withStatus = active.map((a) => ({ a, s: effectiveStatus(a, reminderDays) }));
    const overdue = withStatus.filter((x) => x.s === "vencido").map((x) => x.a);
    const upcoming = withStatus.filter((x) => x.s === "proximo").map((x) => x.a);
    const month = todayISO().slice(0, 7);
    return {
      overdue: overdue.sort((x, y) => daysUntil(x.next_due_date) - daysUntil(y.next_due_date)),
      upcoming,
      stats: {
        overdue: overdue.length,
        upcoming: upcoming.length,
        thisMonth: active.filter((a) => a.next_due_date.startsWith(month)).length,
        clients: clients.length,
      },
    };
  }, [appointments, clients, reminderDays]);

  const listProps = {
    settings,
    onEdit: (a: Appointment) => setModal({ type: "edit", appointment: a }),
    onRenew: (a: Appointment) => setModal({ type: "renew", appointment: a }),
    onChanged: reload,
  };

  return (
    <>
      <PageHeader
        title={`${greeting()} 👋`}
        description={settings?.workshop_name ? `Resumen de ${settings.workshop_name}` : "Resumen del taller"}
        actions={
          <Button onClick={() => setModal({ type: "create" })}>
            <CalendarPlus className="size-4" /> Nueva agenda
          </Button>
        }
      />

      <DashboardCards stats={stats} reminderDays={reminderDays} loading={loading} />

      <div className="mt-8 grid gap-6">
        <Section title="Vencidos" count={overdue.length} tone="red" description="Clientes que ya pasaron su fecha de cambio.">
          {loading ? (
            <ListSkeleton />
          ) : overdue.length ? (
            <AppointmentsTable appointments={overdue} {...listProps} />
          ) : (
            <EmptyState icon={<PartyPopper className="size-6" />} title="¡Nada vencido!" description="Todos los clientes están al día." />
          )}
        </Section>

        <Section title="Próximos" count={upcoming.length} tone="amber" description={`Cambios en los próximos ${reminderDays} días. Envíales un recordatorio.`}>
          {loading ? (
            <ListSkeleton />
          ) : upcoming.length ? (
            <AppointmentsTable appointments={upcoming} {...listProps} />
          ) : (
            <EmptyState icon={<CalendarPlus className="size-6" />} title="Sin cambios próximos" description="No hay cambios programados para estos días." />
          )}
        </Section>

        <div className="flex justify-end">
          <Link href="/dashboard/agendas" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 dark:text-brand-400 hover:gap-2.5 transition-all">
            Ver todas las agendas <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>

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

function Section({ title, count, tone, description, children }: { title: string; count: number; tone: "red" | "amber"; description: string; children: React.ReactNode }) {
  return (
    <Card>
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <h2 className="font-semibold flex items-center gap-2">
            <span className={tone === "red" ? "size-2 rounded-full bg-red-500" : "size-2 rounded-full bg-amber-500"} />
            {title}
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-muted tabular-nums">{count}</span>
          </h2>
          <p className="text-sm text-muted mt-0.5">{description}</p>
        </div>
      </div>
      {children}
    </Card>
  );
}
