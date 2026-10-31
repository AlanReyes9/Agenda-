"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CalendarCheck2, CalendarX2, ExternalLink, Link2, RefreshCw } from "lucide-react";
import { api, ApiError } from "@/lib/fetcher";
import { formatDate, relativeDays } from "@/lib/dates";
import type { CalendarEvent, Client } from "@/lib/types";
import { Button, Card, EmptyState, Field, Input, ListSkeleton, Modal } from "./ui";
import { ClientVehicleSelect } from "./ClientVehicleSelect";

export function ExternalCalendarEvents({
  clients,
  onClientCreated,
  onRegistered,
}: {
  clients: Client[];
  onClientCreated: (c: Client) => void;
  onRegistered: () => void;
}) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<"ok" | "disconnected" | "error">("ok");
  const [errorMsg, setErrorMsg] = useState("");
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  const [form, setForm] = useState({ client_id: "", vehicle_id: "", oil_type: "" });
  const [saving, setSaving] = useState(false);
  const [showRegistered, setShowRegistered] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ events: CalendarEvent[] }>("/api/calendar/events");
      setEvents(res.events);
      setState("ok");
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setState("disconnected");
      else {
        setState("error");
        setErrorMsg(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const register = async () => {
    if (!selected) return;
    if (!form.client_id) return toast.error("Selecciona un cliente");
    setSaving(true);
    try {
      await api("/api/calendar/events/register", {
        method: "POST",
        json: { event_id: selected.id, date: selected.date, ...form, vehicle_id: form.vehicle_id || null, notes: selected.summary },
      });
      toast.success("Evento registrado como agenda", { description: `Próximo cambio: ${formatDate(selected.date)}` });
      setSelected(null);
      onRegistered();
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  };

  const visible = events.filter((e) => showRegistered || !e.registered);

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <h2 className="font-semibold">Eventos de Google Calendar</h2>
          <p className="text-sm text-muted">Registra como agenda los eventos que ya tienes en tu calendario.</p>
        </div>
        <div className="flex items-center gap-2">
          {state === "ok" && (
            <label className="flex items-center gap-2 text-sm text-muted cursor-pointer">
              <input type="checkbox" className="accent-brand-500" checked={showRegistered} onChange={(e) => setShowRegistered(e.target.checked)} />
              Ver registrados
            </label>
          )}
          <Button variant="secondary" size="sm" onClick={load} loading={loading}>
            <RefreshCw className="size-3.5" /> Actualizar
          </Button>
        </div>
      </div>

      {loading ? (
        <ListSkeleton />
      ) : state === "disconnected" ? (
        <EmptyState
          icon={<CalendarX2 className="size-6" />}
          title="Google Calendar no está conectado"
          description="Conéctalo para sincronizar agendas y registrar eventos existentes."
          action={
            <Link href="/dashboard/configuracion">
              <Button>Ir a Configuración</Button>
            </Link>
          }
        />
      ) : state === "error" ? (
        <EmptyState icon={<CalendarX2 className="size-6" />} title="No se pudieron leer los eventos" description={errorMsg} />
      ) : visible.length === 0 ? (
        <EmptyState icon={<CalendarCheck2 className="size-6" />} title="Todo registrado" description="No hay eventos nuevos en los próximos 4 meses." />
      ) : (
        <ul className="divide-y divide-line">
          {visible.map((e) => (
            <li key={e.id} className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-3.5">
              <div className="grid place-items-center w-14 shrink-0 rounded-xl border border-line bg-surface-2 py-1.5 text-center">
                <span className="text-[10px] uppercase text-muted leading-none">{formatDate(e.date, "MMM")}</span>
                <span className="text-lg font-semibold leading-tight">{formatDate(e.date, "d")}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate">{e.summary}</p>
                <p className="text-sm text-muted">
                  {formatDate(e.date, "EEEE d 'de' MMMM")} · {relativeDays(e.date)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {e.htmlLink && (
                  <a href={e.htmlLink} target="_blank" rel="noreferrer" className="grid place-items-center size-9 rounded-lg text-muted hover:bg-surface-2 hover:text-fg" title="Abrir en Google Calendar">
                    <ExternalLink className="size-4" />
                  </a>
                )}
                {e.registered ? (
                  <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 px-2">Registrado</span>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => {
                      setForm({ client_id: "", vehicle_id: "", oil_type: "" });
                      setSelected(e);
                    }}
                  >
                    <Link2 className="size-3.5" /> Registrar
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title="Registrar evento como agenda"
        description={selected ? `«${selected.summary}» · ${formatDate(selected.date, "EEEE d 'de' MMMM yyyy")}` : undefined}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setSelected(null)}>
              Cancelar
            </Button>
            <Button onClick={register} loading={saving}>
              Registrar
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="rounded-xl bg-surface-2 p-3 text-sm text-muted">
            La fecha del evento (<b className="text-fg">{selected && formatDate(selected.date)}</b>) se usará exactamente como la fecha del próximo cambio.
          </p>
          <ClientVehicleSelect
            clients={clients}
            clientId={form.client_id}
            vehicleId={form.vehicle_id}
            onChange={(client_id, vehicle_id) => setForm((f) => ({ ...f, client_id, vehicle_id }))}
            onClientCreated={onClientCreated}
          />
          <Field label="Aceite">
            <Input value={form.oil_type} onChange={(e) => setForm((f) => ({ ...f, oil_type: e.target.value }))} placeholder="Opcional" />
          </Field>
        </div>
      </Modal>
    </Card>
  );
}
