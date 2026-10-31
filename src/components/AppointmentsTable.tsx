"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Car, Check, CheckCircle2, Droplet, Gauge, MoreHorizontal, Pencil, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import { api } from "@/lib/fetcher";
import { notifyCalendar } from "@/lib/calendar-toast";
import { effectiveStatus, formatDate, relativeDays } from "@/lib/dates";
import type { Appointment, Settings } from "@/lib/types";
import { cn, initials, vehicleLabel } from "@/lib/utils";
import { Button, StatusBadge } from "./ui";
import { WhatsAppButton } from "./WhatsAppButton";

export function AppointmentsTable({
  appointments,
  settings,
  onEdit,
  onRenew,
  onChanged,
}: {
  appointments: Appointment[];
  settings: Settings | null;
  onEdit: (a: Appointment) => void;
  onRenew: (a: Appointment) => void;
  onChanged: () => void;
}) {
  return (
    <div className="divide-y divide-line">
      {appointments.map((a) => (
        <AppointmentRow
          key={a.id}
          a={a}
          settings={settings}
          onEdit={() => onEdit(a)}
          onRenew={() => onRenew(a)}
          onChanged={onChanged}
        />
      ))}
    </div>
  );
}

function AppointmentRow({
  a,
  settings,
  onEdit,
  onRenew,
  onChanged,
}: {
  a: Appointment;
  settings: Settings | null;
  onEdit: () => void;
  onRenew: () => void;
  onChanged: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const status = effectiveStatus(a, settings?.reminder_days ?? 7);
  const closed = status === "completado" || status === "renovado";

  const run = async (key: string, fn: () => Promise<{ calendarSynced?: boolean; calendarError?: string }>, ok: string) => {
    setBusy(key);
    try {
      const res = await fn();
      toast.success(ok);
      notifyCalendar(res);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(null);
      setConfirmDelete(false);
      setMenu(false);
    }
  };

  const setStatus = (s: string, msg: string) =>
    run(s, () => api(`/api/appointments/${a.id}`, { method: "PATCH", json: { status: s } }), msg);
  const remove = () => run("delete", () => api(`/api/appointments/${a.id}`, { method: "DELETE" }), "Agenda eliminada");

  const accent = {
    vencido: "bg-red-500",
    proximo: "bg-amber-500",
    pendiente: "bg-emerald-500",
    completado: "bg-sky-500",
    renovado: "bg-violet-500",
  }[status];

  return (
    <div className={cn("relative flex flex-col lg:flex-row lg:items-center gap-4 p-4 sm:px-5 hover:bg-surface-2/50 transition", closed && "opacity-70")}>
      <span className={cn("absolute left-0 top-4 bottom-4 w-1 rounded-r-full", accent)} />

      <div className="flex items-center gap-3 min-w-0 lg:w-[30%]">
        <div className="grid place-items-center size-10 shrink-0 rounded-full bg-surface-2 text-sm font-semibold">
          {initials(a.client?.name ?? "?")}
        </div>
        <div className="min-w-0">
          <p className="font-medium truncate">{a.client?.name ?? "Cliente eliminado"}</p>
          <p className="text-sm text-muted truncate flex items-center gap-1.5">
            <Car className="size-3.5 shrink-0" />
            {vehicleLabel(a.vehicle)}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm lg:flex-1">
        <div>
          <p className="text-xs text-muted">Próximo cambio</p>
          <p className="font-medium">
            {formatDate(a.next_due_date)}
            {!closed && (
              <span
                className={cn(
                  "ml-2 text-xs",
                  status === "vencido" ? "text-red-600 dark:text-red-400" : status === "proximo" ? "text-amber-600 dark:text-amber-400" : "text-muted",
                )}
              >
                {relativeDays(a.next_due_date)}
              </span>
            )}
          </p>
        </div>
        <div className="hidden sm:block">
          <p className="text-xs text-muted">Último servicio</p>
          <p>{formatDate(a.service_date)}</p>
        </div>
        {a.oil_type && (
          <div className="flex items-center gap-1.5 text-muted">
            <Droplet className="size-3.5 text-brand-500" />
            <span className="truncate max-w-40">{a.oil_type}</span>
          </div>
        )}
        {a.next_mileage ? (
          <div className="flex items-center gap-1.5 text-muted">
            <Gauge className="size-3.5" />
            {a.next_mileage.toLocaleString("es-DO")} km
          </div>
        ) : null}
        <StatusBadge status={status} />
      </div>

      <div className="flex items-center gap-2 lg:justify-end">
        {confirmDelete ? (
          <div className="flex items-center gap-2 rounded-xl bg-red-500/10 px-3 py-1.5 animate-fade-in">
            <span className="text-sm font-medium text-red-700 dark:text-red-400">¿Eliminar?</span>
            <Button size="sm" variant="danger" loading={busy === "delete"} onClick={remove}>
              Sí
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setConfirmDelete(false)}>
              No
            </Button>
          </div>
        ) : (
          <>
            {!closed && <WhatsAppButton appointment={a} settings={settings} />}
            {!closed ? (
              <>
                <Button size="sm" variant="secondary" onClick={onRenew} title="Renovar">
                  <RefreshCw className="size-3.5" /> Renovar
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  loading={busy === "completado"}
                  onClick={() => setStatus("completado", "Marcada como completada")}
                  title="Completar"
                  className="hidden sm:inline-flex"
                >
                  <Check className="size-3.5" />
                </Button>
              </>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs text-muted">
                <CheckCircle2 className="size-3.5" />
                {status === "renovado" ? "Renovada" : "Completada"}
              </span>
            )}
            <div className="relative">
              <Button size="icon" variant="ghost" onClick={() => setMenu((m) => !m)} aria-label="Más acciones">
                <MoreHorizontal className="size-4" />
              </Button>
              {menu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
                  <div className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-xl border border-line bg-surface p-1 shadow-xl animate-fade-in">
                    <MenuItem icon={Pencil} onClick={() => (setMenu(false), onEdit())}>
                      Editar
                    </MenuItem>
                    {!closed && (
                      <MenuItem icon={Check} onClick={() => setStatus("completado", "Marcada como completada")}>
                        Marcar completada
                      </MenuItem>
                    )}
                    {closed && (
                      <MenuItem icon={RotateCcw} onClick={() => setStatus("pendiente", "Agenda reabierta")}>
                        Reabrir
                      </MenuItem>
                    )}
                    <MenuItem icon={Trash2} danger onClick={() => (setMenu(false), setConfirmDelete(true))}>
                      Eliminar
                    </MenuItem>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function MenuItem({
  icon: Icon,
  children,
  onClick,
  danger,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-left transition cursor-pointer",
        danger ? "text-red-600 hover:bg-red-500/10" : "hover:bg-surface-2",
      )}
    >
      <Icon className="size-4" />
      {children}
    </button>
  );
}
