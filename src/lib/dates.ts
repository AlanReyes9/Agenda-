import { addMonths, differenceInCalendarDays, format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import type { Appointment, AppointmentStatus } from "./types";

/** Fecha local de hoy en formato yyyy-MM-dd (zona horaria de RD). */
export function todayISO(timeZone = "America/Santo_Domingo"): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function computeNextDueDate(serviceDate: string, periodMonths: number): string {
  return format(addMonths(parseISO(serviceDate), periodMonths), "yyyy-MM-dd");
}

export function daysUntil(date: string, today = todayISO()): number {
  return differenceInCalendarDays(parseISO(date), parseISO(today));
}

/** Estado real calculado al momento (el de la BD puede estar desfasado). */
export function effectiveStatus(
  a: Pick<Appointment, "status" | "next_due_date">,
  reminderDays = 7,
): AppointmentStatus {
  if (a.status === "completado" || a.status === "renovado") return a.status;
  const d = daysUntil(a.next_due_date);
  if (d < 0) return "vencido";
  if (d <= reminderDays) return "proximo";
  return "pendiente";
}

export function formatDate(date: string | null | undefined, pattern = "d MMM yyyy"): string {
  if (!date) return "—";
  return format(parseISO(date), pattern, { locale: es });
}

export function formatLongDate(date: string): string {
  return format(parseISO(date), "EEEE d 'de' MMMM 'de' yyyy", { locale: es });
}

export function relativeDays(date: string): string {
  const d = daysUntil(date);
  if (d === 0) return "Hoy";
  if (d === 1) return "Mañana";
  if (d === -1) return "Ayer";
  if (d < 0) return `Hace ${Math.abs(d)} días`;
  return `En ${d} días`;
}

export const STATUS_LABEL: Record<AppointmentStatus, string> = {
  pendiente: "Al día",
  proximo: "Próximo",
  vencido: "Vencido",
  completado: "Completado",
  renovado: "Renovado",
};
