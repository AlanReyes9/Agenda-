"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarPlus, Car, Mail, MessageCircle, Pencil, Phone, Plus, Search, Trash2, UserPlus, Users, X } from "lucide-react";
import { api } from "@/lib/fetcher";
import { notifyCalendar } from "@/lib/calendar-toast";
import { useAppointments, useClients } from "@/lib/hooks";
import { effectiveStatus, formatDate } from "@/lib/dates";
import { normalizePhone } from "@/lib/whatsapp";
import type { Client, Vehicle } from "@/lib/types";
import { initials, vehicleLabel } from "@/lib/utils";
import { AppointmentModal, type AppointmentModalMode } from "@/components/AppointmentModal";
import { ClientFields, emptyVehicle, NewClientForm, VehicleFields, type ClientFormValues, type VehicleFormValues } from "@/components/NewClientForm";
import { Button, Card, EmptyState, Input, Modal, PageHeader, Skeleton, StatusBadge } from "@/components/ui";

export default function ClientesPage() {
  const { data: clients, setData: setClients, loading, reload } = useClients();
  const { data: appointments, reload: reloadAppointments } = useAppointments();
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [vehicleFor, setVehicleFor] = useState<{ client: Client; vehicle?: Vehicle } | null>(null);
  const [apptModal, setApptModal] = useState<AppointmentModalMode | null>(null);

  const nextByClient = useMemo(() => {
    const m = new Map<string, (typeof appointments)[number]>();
    for (const a of appointments) {
      if (a.status === "completado" || a.status === "renovado") continue;
      const cur = m.get(a.client_id);
      if (!cur || a.next_due_date < cur.next_due_date) m.set(a.client_id, a);
    }
    return m;
  }, [appointments]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return clients;
    return clients.filter((c) =>
      [c.name, c.phone, c.email, ...(c.vehicles ?? []).map((v) => vehicleLabel(v))].filter(Boolean).some((x) => x!.toLowerCase().includes(t)),
    );
  }, [clients, q]);

  return (
    <>
      <PageHeader
        title="Clientes"
        description={`${clients.length} clientes registrados`}
        actions={
          <Button onClick={() => setCreating(true)}>
            <UserPlus className="size-4" /> Nuevo cliente
          </Button>
        }
      />

      <div className="relative mb-5 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, teléfono o placa…" className="pl-9 h-11" />
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-48 rounded-2xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Users className="size-6" />}
            title={clients.length ? "Sin resultados" : "Aún no hay clientes"}
            description={clients.length ? "Prueba con otra búsqueda." : "Registra tu primer cliente con su vehículo."}
            action={
              !clients.length && (
                <Button onClick={() => setCreating(true)}>
                  <UserPlus className="size-4" /> Nuevo cliente
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((c) => (
            <ClientCard
              key={c.id}
              client={c}
              next={nextByClient.get(c.id)}
              onEdit={() => setEditing(c)}
              onAddVehicle={() => setVehicleFor({ client: c })}
              onEditVehicle={(v) => setVehicleFor({ client: c, vehicle: v })}
              onSchedule={() => setApptModal({ type: "create", clientId: c.id })}
              onDeleted={() => {
                setClients((cs) => cs.filter((x) => x.id !== c.id));
                reloadAppointments();
              }}
              onChanged={reload}
            />
          ))}
        </div>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title="Nuevo cliente" size="lg">
        <NewClientForm
          onCancel={() => setCreating(false)}
          onCreated={(c, v) => {
            setClients((cs) => [...cs, { ...c, vehicles: v ? [v] : [] }].sort((a, b) => a.name.localeCompare(b.name)));
            setCreating(false);
          }}
        />
      </Modal>

      <EditClientModal client={editing} onClose={() => setEditing(null)} onSaved={reload} />
      <VehicleModal target={vehicleFor} onClose={() => setVehicleFor(null)} onSaved={reload} />
      <AppointmentModal
        mode={apptModal}
        onClose={() => setApptModal(null)}
        clients={clients}
        onClientCreated={(c) => setClients((cs) => [...cs, c])}
        onSaved={reloadAppointments}
      />
    </>
  );
}

function ClientCard({
  client: c,
  next,
  onEdit,
  onAddVehicle,
  onEditVehicle,
  onSchedule,
  onDeleted,
  onChanged,
}: {
  client: Client;
  next?: ReturnType<typeof useAppointments>["data"][number];
  onEdit: () => void;
  onAddVehicle: () => void;
  onEditVehicle: (v: Vehicle) => void;
  onSchedule: () => void;
  onDeleted: () => void;
  onChanged: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const phone = normalizePhone(c.phone);

  const remove = async () => {
    setDeleting(true);
    try {
      const res = await api<{ calendarError?: string }>(`/api/clients/${c.id}`, { method: "DELETE" });
      toast.success("Cliente eliminado");
      notifyCalendar(res);
      onDeleted();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
      setDeleting(false);
    }
  };

  const removeVehicle = async (v: Vehicle) => {
    if (!window.confirm(`¿Eliminar el vehículo ${vehicleLabel(v)}?`)) return;
    try {
      await api(`/api/vehicles/${v.id}`, { method: "DELETE" });
      toast.success("Vehículo eliminado");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    }
  };

  return (
    <Card className="flex flex-col p-5 transition hover:shadow-md hover:border-brand-500/30">
      <div className="flex items-start gap-3">
        <div className="grid place-items-center size-11 shrink-0 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-white font-semibold">
          {initials(c.name)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold truncate">{c.name}</p>
          <div className="mt-0.5 space-y-0.5 text-sm text-muted">
            {c.phone && (
              <p className="flex items-center gap-1.5 truncate">
                <Phone className="size-3.5" /> {c.phone}
              </p>
            )}
            {c.email && (
              <p className="flex items-center gap-1.5 truncate">
                <Mail className="size-3.5" /> {c.email}
              </p>
            )}
          </div>
        </div>
        <div className="flex -mr-2 -mt-1">
          <Button variant="ghost" size="icon" onClick={onEdit} aria-label="Editar cliente">
            <Pencil className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setConfirm(true)} aria-label="Eliminar cliente" className="hover:text-red-600">
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      <div className="mt-4 space-y-1.5">
        {(c.vehicles ?? []).map((v) => (
          <div key={v.id} className="group flex items-center gap-2 rounded-xl bg-surface-2/70 px-3 py-2 text-sm">
            <Car className="size-4 text-muted shrink-0" />
            <button onClick={() => onEditVehicle(v)} className="truncate text-left flex-1 hover:underline cursor-pointer">
              {vehicleLabel(v)}
            </button>
            <button onClick={() => removeVehicle(v)} className="opacity-0 group-hover:opacity-100 text-muted hover:text-red-600 transition cursor-pointer" aria-label="Eliminar vehículo">
              <X className="size-3.5" />
            </button>
          </div>
        ))}
        <button onClick={onAddVehicle} className="flex w-full items-center gap-2 rounded-xl border border-dashed border-line px-3 py-2 text-sm text-muted hover:text-fg hover:border-brand-500/50 transition cursor-pointer">
          <Plus className="size-4" /> Agregar vehículo
        </button>
      </div>

      <div className="mt-4 flex-1" />
      {next && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-line px-3 py-2 text-sm">
          <span className="text-muted">Próximo cambio</span>
          <span className="flex items-center gap-2 font-medium">
            {formatDate(next.next_due_date)}
            <StatusBadge status={effectiveStatus(next)} />
          </span>
        </div>
      )}

      {confirm ? (
        <div className="flex items-center justify-between gap-2 rounded-xl bg-red-500/10 px-3 py-2 animate-fade-in">
          <span className="text-sm font-medium text-red-700 dark:text-red-400">¿Eliminar cliente y sus agendas?</span>
          <div className="flex gap-1.5">
            <Button size="sm" variant="danger" loading={deleting} onClick={remove}>
              Sí
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setConfirm(false)}>
              No
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button size="sm" className="flex-1" onClick={onSchedule}>
            <CalendarPlus className="size-3.5" /> Agendar
          </Button>
          {phone && (
            <a href={`https://wa.me/${phone}`} target="_blank" rel="noreferrer">
              <Button size="sm" variant="whatsapp" type="button">
                <MessageCircle className="size-3.5" /> Chat
              </Button>
            </a>
          )}
        </div>
      )}
    </Card>
  );
}

function EditClientModal({ client, onClose, onSaved }: { client: Client | null; onClose: () => void; onSaved: () => void }) {
  const [value, setValue] = useState<ClientFormValues>({ name: "", phone: "", email: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  if (client && client.id !== loadedId) {
    setLoadedId(client.id);
    setValue({ name: client.name, phone: client.phone ?? "", email: client.email ?? "", notes: client.notes ?? "" });
  }
  const close = () => {
    setLoadedId(null);
    onClose();
  };
  const save = async () => {
    if (!client) return;
    setSaving(true);
    try {
      await api(`/api/clients/${client.id}`, { method: "PATCH", json: value });
      toast.success("Cliente actualizado");
      onSaved();
      close();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      open={Boolean(client)}
      onClose={close}
      title="Editar cliente"
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancelar
          </Button>
          <Button onClick={save} loading={saving}>
            Guardar
          </Button>
        </>
      }
    >
      <ClientFields value={value} onChange={setValue} />
    </Modal>
  );
}

function VehicleModal({
  target,
  onClose,
  onSaved,
}: {
  target: { client: Client; vehicle?: Vehicle } | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [value, setValue] = useState<VehicleFormValues>(emptyVehicle);
  const [saving, setSaving] = useState(false);
  const [key, setKey] = useState<string | null>(null);
  const k = target ? `${target.client.id}:${target.vehicle?.id ?? "new"}` : null;
  if (k && k !== key) {
    setKey(k);
    const v = target?.vehicle;
    setValue(
      v
        ? { brand: v.brand, model: v.model ?? "", year: v.year ? String(v.year) : "", plate: v.plate ?? "", color: v.color ?? "" }
        : emptyVehicle,
    );
  }
  const close = () => {
    setKey(null);
    onClose();
  };
  const save = async () => {
    if (!target) return;
    if (!value.brand.trim()) return toast.error("La marca es obligatoria");
    setSaving(true);
    try {
      if (target.vehicle) await api(`/api/vehicles/${target.vehicle.id}`, { method: "PATCH", json: value });
      else await api("/api/vehicles", { method: "POST", json: { ...value, client_id: target.client.id } });
      toast.success(target.vehicle ? "Vehículo actualizado" : "Vehículo agregado");
      onSaved();
      close();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      open={Boolean(target)}
      onClose={close}
      title={target?.vehicle ? "Editar vehículo" : "Agregar vehículo"}
      description={target?.client.name}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancelar
          </Button>
          <Button onClick={save} loading={saving}>
            Guardar
          </Button>
        </>
      }
    >
      <VehicleFields value={value} onChange={setValue} required />
    </Modal>
  );
}
