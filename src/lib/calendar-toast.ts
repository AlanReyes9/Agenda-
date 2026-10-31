"use client";

import { toast } from "sonner";

/** Avisa si Google Calendar falló (la operación principal ya se guardó). */
export function notifyCalendar(res: { calendarSynced?: boolean; calendarError?: string }) {
  if (res.calendarError) {
    toast.warning("Guardado, pero Google Calendar no se pudo sincronizar", { description: res.calendarError });
  }
}
