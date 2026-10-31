"use client";

import { useMemo, useState } from "react";
import { UserPlus } from "lucide-react";
import type { Client, Vehicle } from "@/lib/types";
import { vehicleLabel } from "@/lib/utils";
import { Button, Field, Select } from "./ui";
import { NewClientForm } from "./NewClientForm";

export function ClientVehicleSelect({
  clients,
  clientId,
  vehicleId,
  onChange,
  onClientCreated,
  disabled,
}: {
  clients: Client[];
  clientId: string;
  vehicleId: string;
  onChange: (clientId: string, vehicleId: string) => void;
  onClientCreated: (c: Client) => void;
  disabled?: boolean;
}) {
  const [creating, setCreating] = useState(false);
  const vehicles: Vehicle[] = useMemo(() => clients.find((c) => c.id === clientId)?.vehicles ?? [], [clients, clientId]);

  if (creating) {
    return (
      <NewClientForm
        onCancel={() => setCreating(false)}
        onCreated={(c, v) => {
          onClientCreated({ ...c, vehicles: v ? [v] : [] });
          onChange(c.id, v?.id ?? "");
          setCreating(false);
        }}
      />
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Cliente *">
        <div className="flex gap-2">
          <Select
            required
            disabled={disabled}
            value={clientId}
            onChange={(e) => {
              const c = clients.find((x) => x.id === e.target.value);
              onChange(e.target.value, c?.vehicles?.[0]?.id ?? "");
            }}
          >
            <option value="">Selecciona…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.phone ? ` · ${c.phone}` : ""}
              </option>
            ))}
          </Select>
          {!disabled && (
            <Button type="button" variant="secondary" size="icon" className="h-10 w-10 shrink-0" onClick={() => setCreating(true)} title="Nuevo cliente">
              <UserPlus className="size-4" />
            </Button>
          )}
        </div>
      </Field>
      <Field label="Vehículo">
        <Select value={vehicleId} onChange={(e) => onChange(clientId, e.target.value)} disabled={!clientId}>
          <option value="">{vehicles.length ? "Sin vehículo" : "El cliente no tiene vehículos"}</option>
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {vehicleLabel(v)}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  );
}
