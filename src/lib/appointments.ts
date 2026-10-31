export interface AppointmentInput {
  client_id?: string;
  vehicle_id?: string | null;
  service_date?: string;
  period_months?: number | string | null;
  oil_type?: string | null;
  mileage?: number | string | null;
  next_mileage?: number | string | null;
  notes?: string | null;
  google_event_id?: string | null;
}

const toInt = (v: unknown) => (v === undefined || v === null || v === "" ? null : Number.isFinite(Number(v)) ? Math.round(Number(v)) : null);

export function validateAppointment(b: AppointmentInput, partial = false): string | null {
  if (!partial && !b.client_id) return "Selecciona un cliente";
  if (!partial && !b.service_date) return "La fecha del servicio es obligatoria";
  if (b.service_date && !/^\d{4}-\d{2}-\d{2}$/.test(b.service_date)) return "Fecha no válida";
  // period_months = 0 es válido: no usar !period_months
  if (!partial && (b.period_months === undefined || b.period_months === null || b.period_months === "")) {
    return "Indica la periodicidad en meses";
  }
  if (b.period_months !== undefined && b.period_months !== null && b.period_months !== "") {
    const n = Number(b.period_months);
    if (!Number.isInteger(n) || n < 0 || n > 60) return "La periodicidad debe ser un número de meses entre 0 y 60";
  }
  return null;
}

export function appointmentRow(b: AppointmentInput) {
  const row: Record<string, unknown> = {};
  if (b.client_id !== undefined) row.client_id = b.client_id;
  if (b.vehicle_id !== undefined) row.vehicle_id = b.vehicle_id || null;
  if (b.service_date !== undefined) row.service_date = b.service_date;
  if (b.period_months !== undefined && b.period_months !== null && b.period_months !== "") {
    row.period_months = Number(b.period_months);
  }
  if (b.oil_type !== undefined) row.oil_type = b.oil_type?.toString().trim() || null;
  if (b.mileage !== undefined) row.mileage = toInt(b.mileage);
  if (b.next_mileage !== undefined) row.next_mileage = toInt(b.next_mileage);
  if (b.notes !== undefined) row.notes = b.notes?.toString().trim() || null;
  if (b.google_event_id !== undefined) row.google_event_id = b.google_event_id || null;
  return row;
}

