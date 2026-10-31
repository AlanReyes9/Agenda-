"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "./fetcher";
import type { Appointment, Client, Settings } from "./types";

function useResource<T>(path: string, pick: (d: any) => T, initial: T) {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try {
      const d = await api(path);
      setData(pick(d));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);
  useEffect(() => {
    reload();
  }, [reload]);
  return { data, setData, loading, error, reload };
}

export function useAppointments() {
  return useResource<Appointment[]>("/api/appointments", (d) => d.appointments ?? [], []);
}

export function useClients() {
  return useResource<Client[]>("/api/clients", (d) => d.clients ?? [], []);
}

export function useSettings() {
  return useResource<Settings | null>("/api/settings", (d) => d.settings ?? null, null);
}
