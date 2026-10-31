"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/fetcher";
import type { Client, Vehicle } from "@/lib/types";
import { Button, Field, Input, Textarea } from "./ui";

export interface ClientFormValues {
  name: string;
  phone: string;
  email: string;
  notes: string;
}

export function ClientFields({
  value,
  onChange,
}: {
  value: ClientFormValues;
  onChange: (v: ClientFormValues) => void;
}) {
  const set = (k: keyof ClientFormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    onChange({ ...value, [k]: e.target.value });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Nombre *" className="sm:col-span-2">
        <Input required value={value.name} onChange={set("name")} placeholder="Juan Pérez" autoFocus />
      </Field>
      <Field label="Teléfono / WhatsApp" hint="Ej: 809-555-1234">
        <Input type="tel" value={value.phone} onChange={set("phone")} placeholder="809-555-1234" />
      </Field>
      <Field label="Correo">
        <Input type="email" value={value.email} onChange={set("email")} placeholder="opcional" />
      </Field>
      <Field label="Notas" className="sm:col-span-2">
        <Textarea value={value.notes} onChange={set("notes")} rows={2} placeholder="Opcional" />
      </Field>
    </div>
  );
}

export interface VehicleFormValues {
  brand: string;
  model: string;
  year: string;
  plate: string;
  color: string;
}

export const emptyVehicle: VehicleFormValues = { brand: "", model: "", year: "", plate: "", color: "" };

export function VehicleFields({ value, onChange, required }: { value: VehicleFormValues; onChange: (v: VehicleFormValues) => void; required?: boolean }) {
  const set = (k: keyof VehicleFormValues) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, [k]: e.target.value });
  return (
    <div className="grid gap-4 grid-cols-2 sm:grid-cols-3">
      <Field label={required ? "Marca *" : "Marca"}>
        <Input required={required} value={value.brand} onChange={set("brand")} placeholder="Toyota" />
      </Field>
      <Field label="Modelo">
        <Input value={value.model} onChange={set("model")} placeholder="Corolla" />
      </Field>
      <Field label="Año">
        <Input type="number" inputMode="numeric" min={1950} max={2100} value={value.year} onChange={set("year")} placeholder="2018" />
      </Field>
      <Field label="Placa">
        <Input value={value.plate} onChange={set("plate")} placeholder="A123456" className="uppercase" />
      </Field>
      <Field label="Color">
        <Input value={value.color} onChange={set("color")} placeholder="Gris" />
      </Field>
    </div>
  );
}

/** Formulario rápido: cliente + vehículo en un solo paso. */
export function NewClientForm({ onCreated, onCancel }: { onCreated: (c: Client, v: Vehicle | null) => void; onCancel?: () => void }) {
  const [client, setClient] = useState<ClientFormValues>({ name: "", phone: "", email: "", notes: "" });
  const [vehicle, setVehicle] = useState<VehicleFormValues>(emptyVehicle);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!client.name.trim()) return toast.error("El nombre es obligatorio");
    setSaving(true);
    try {
      const res = await api<{ client: Client; vehicle: Vehicle | null }>("/api/clients", {
        method: "POST",
        json: { ...client, vehicle: vehicle.brand.trim() ? vehicle : undefined },
      });
      toast.success("Cliente creado");
      onCreated(res.client, res.vehicle);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al crear el cliente");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5 rounded-2xl border border-dashed border-brand-500/40 bg-brand-500/[0.03] p-4">
      <ClientFields value={client} onChange={setClient} />
      <div>
        <p className="text-sm font-medium mb-3">Vehículo</p>
        <VehicleFields value={vehicle} onChange={setVehicle} />
      </div>
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
        )}
        <Button type="button" onClick={submit} loading={saving}>
          Guardar cliente
        </Button>
      </div>
    </div>
  );
}
