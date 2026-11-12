"use client";

import { toast } from "sonner";

/** Avisa del resultado en Google Calendar (la operación principal ya se guardó). */
export function notifyCalendar(res: { calendarSynced?: boolean; calendarError?: string }, successMessage?: string) {
  if (res.calendarError) {
    toast.warning("Guardado en la app, pero NO en Google Calendar", { description: res.calendarError, duration: 15000 });
  } else if (res.calendarSynced && successMessage) {
    toast.success(successMessage);
  }
}
