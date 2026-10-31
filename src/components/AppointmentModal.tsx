"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CalendarDays } from "lucide-react";
import { api } from "@/lib/fetcher";
import { notifyCalendar } from "@/lib/calendar-toast";
import { computeNextDueDate, formatLongDate, todayISO } from "@/lib/dates";
import type { Appointment, Client } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button, Field, Input, Modal, Textarea } from "./ui";
import { ClientVehicleSelect } from "./ClientVehicleSelect";

export type AppointmentModalMode = { type: "create"; clientId?: string } | { type: "edit"; appointment: Appointment } | { type: "renew"; appointment: Appointment };

const OIL_SUGGESTIONS = ["5W-30 Sintético", "5W-20 Sintético", "10W-30 Semisintético", "10W-40 Mineral", "15W-40 Diésel", "0W-20 Sintético"];
const PERIODS = [1, 2, 3, 4, 6, 12];

export function AppointmentModal({
  mode,
  onClose,
  clients,
  onClientCreated,
  onSaved,
}: {
  mode: AppointmentModalMode | null;
  onClose: () => void;
  clients: Client[];
  onClientCreated: (c: Client) => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    client_id: "",
    vehicle_id: "",
    service_date: todayISO(),
    period_months: "3",
    oil_type: "",
    mileage: "",
    next_mileage: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!mode) return;
    if (mode.type === "create") {
      const c = clients.find((x) => x.id === mode.clientId);
      setForm({
        client_id: c?.id ?? "",
        vehicle_id: c?.vehicles?.[0]?.id ?? "",
        service_date: todayISO(),
        period_months: "3",
        oil_type: "",
        mileage: "",
        next_mileage: "",
        notes: "",
      });
    } else {
      const a = mode.appointment;
      const renew = mode.type === "renew";
      setForm({
        client_id: a.client_id,
        vehicle_id: a.vehicle_id ?? "",
        service_date: renew ? todayISO() : a.service_date,
        period_months: String(renew && a.period_months === 0 ? 3 : a.period_months),
        oil_type: a.oil_type ?? "",
        mileage: renew ? (a.next_mileage ? String(a.next_mileage) : "") : a.mileage ? String(a.mileage) : "",
        next_mileage: renew ? "" : a.next_mileage ? String(a.next_mileage) : "",
        notes: renew ? "" : a.notes ?? "",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const months = form.period_months === "" ? NaN : Number(form.period_months);
  const validMonths = Number.isInteger(months) && months >= 0 && months <= 60;
  const nextDue = form.service_date && validMonths ? computeNextDueDate(form.service_date, months) : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mode) return;
    if (!form.client_id) return toast.error("Selecciona un cliente");
    if (!validMonths) return toast.error("La periodicidad debe ser entre 0 y 60 meses");
    setSaving(true);
    try {
      const payload = { ...form, period_months: months, vehicle_id: form.vehicle_id || null };
      let res: { calendarSynced?: boolean; calendarError?: string };
      if (mode.type === "create") {
        res = await api("/api/appointments", { method: "POST", json: payload });
        toast.success("Agenda creada", { description: nextDue ? `Próximo cambio: ${formatLongDate(nextDue)}` : undefined });
      } else if (mode.type === "edit") {
        res = await api(`/api/appointments/${mode.appointment.id}`, { method: "PATCH", json: payload });
        toast.success("Agenda actualizada");
      } else {
        res = await api(`/api/appointments/${mode.appointment.id}/renew`, { method: "POST", json: payload });
        toast.success("Agenda renovada", { description: nextDue ? `Próximo cambio: ${formatLongDate(nextDue)}` : undefined });
      }
      notifyCalendar(res);
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const title = mode?.type === "edit" ? "Editar agenda" : mode?.type === "renew" ? "Renovar cambio de aceite" : "Nueva agenda";
  const description =
    mode?.type === "renew"
      ? "Se crea una nueva agenda y la anterior queda como renovada."
      : "La fecha del próximo cambio se calcula automáticamente.";

  return (
    <Modal
      open={Boolean(mode)}
      onClose={onClose}
      title={title}
      description={description}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} type="button">
            Cancelar
          </Button>
          <Button type="submit" form="appointment-form" loading={saving}>
            {mode?.type === "renew" ? "Renovar" : "Guardar"}
          </Button>
        </>
      }
    >
      <form id="appointment-form" onSubmit={submit} className="space-y-5">
        <ClientVehicleSelect
          clients={clients}
          clientId={form.client_id}
          vehicleId={form.vehicle_id}
          disabled={mode?.type !== "create"}
          onChange={(client_id, vehicle_id) => setForm((f) => ({ ...f, client_id, vehicle_id }))}
          onClientCreated={onClientCreated}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Fecha del servicio *">
            <Input type="date" required value={form.service_date} onChange={set("service_date")} />
          </Field>
          <Field label="Periodicidad (meses) *" hint={months === 0 ? "0 = la fecha del servicio es el próximo cambio" : undefined}>
            <Input type="number" inputMode="numeric" min={0} max={60} required value={form.period_months} onChange={set("period_months")} />
          </Field>
        </div>
        <div className="flex flex-wrap gap-2 -mt-2">
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setForm((f) => ({ ...f, period_months: String(p) }))}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition cursor-pointer",
                months === p ? "border-brand-500 bg-brand-500 text-white" : "border-line text-muted hover:text-fg hover:border-brand-500/50",
              )}
            >
              {p} {p === 1 ? "mes" : "meses"}
            </button>
          ))}
        </div>

        {nextDue && (
          <div className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-brand-500/10 to-transparent border border-brand-500/20 p-4">
            <div className="grid place-items-center size-10 rounded-xl bg-brand-500 text-white">
              <CalendarDays className="size-5" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted">Próximo cambio</p>
              <p className="font-semibold capitalize">{formatLongDate(nextDue)}</p>
            </div>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Aceite" className="sm:col-span-3">
            <Input list="oil-types" value={form.oil_type} onChange={set("oil_type")} placeholder="Ej: 5W-30 Sintético" />
            <datalist id="oil-types">
              {OIL_SUGGESTIONS.map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
          </Field>
          <Field label="Kilometraje actual">
            <Input type="number" inputMode="numeric" min={0} value={form.mileage} onChange={set("mileage")} placeholder="85000" />
          </Field>
          <Field label="Próximo km">
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              value={form.next_mileage}
              onChange={set("next_mileage")}
              placeholder={form.mileage ? String(Number(form.mileage) + 5000) : "90000"}
            />
          </Field>
          <div className="flex items-end">
            {form.mileage && !form.next_mileage && (
              <Button type="button" variant="secondary" className="w-full" onClick={() => setForm((f) => ({ ...f, next_mileage: String(Number(f.mileage) + 5000) }))}>
                +5,000 km
              </Button>
            )}
          </div>
        </div>
        <Field label="Notas">
          <Textarea value={form.notes} onChange={set("notes")} rows={2} placeholder="Filtro cambiado, observaciones…" />
        </Field>
      </form>
    </Modal>
  );
}
