import { formatLongDate } from "./dates";
import type { Appointment } from "./types";

export const TEMPLATE_VARIABLES = [
  { key: "{cliente}", label: "Nombre del cliente" },
  { key: "{vehiculo}", label: "Marca y modelo" },
  { key: "{placa}", label: "Placa" },
  { key: "{fecha}", label: "Fecha del próximo cambio" },
  { key: "{aceite}", label: "Tipo de aceite" },
  { key: "{millaje}", label: "Próximo millaje" },
  { key: "{taller}", label: "Nombre del taller" },
] as const;

export function renderMessageTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? vars[key] : match,
  );
}

export function buildAppointmentMessage(
  template: string,
  appointment: Appointment,
  workshopName: string,
): string {
  const v = appointment.vehicle;
  const vehiculo = v ? [v.brand, v.model, v.year].filter(Boolean).join(" ") : "vehículo";
  return renderMessageTemplate(template, {
    cliente: appointment.client?.name ?? "cliente",
    vehiculo,
    placa: v?.plate || "sin placa",
    fecha: formatLongDate(appointment.next_due_date),
    aceite: appointment.oil_type || "su aceite habitual",
    millaje: appointment.next_mileage ? `${appointment.next_mileage.toLocaleString("es-DO")} mi` : "—",
    // compatibilidad con plantillas que usaban {kilometraje}
    kilometraje: appointment.next_mileage ? `${appointment.next_mileage.toLocaleString("es-DO")} mi` : "—",
    taller: workshopName,
  });
}

/** 8095364657 → 809-536-4657 (para mostrar e imprimir). */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const d = phone.replace(/\D/g, "");
  const local = d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
  return local.length === 10 ? `${local.slice(0, 3)}-${local.slice(3, 6)}-${local.slice(6)}` : phone.trim();
}

/** Normaliza teléfonos de RD (809/829/849) al formato internacional que pide wa.me. */
export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 10 && /^(809|829|849)/.test(digits)) digits = `1${digits}`;
  return digits.length >= 10 ? digits : null;
}

export function buildWhatsAppLink(phone: string | null | undefined, message: string): string | null {
  const n = normalizePhone(phone);
  if (!n) return null;
  return `https://wa.me/${n}?text=${encodeURIComponent(message)}`;
}
