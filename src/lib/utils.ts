import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function vehicleLabel(
  v: { brand: string; model?: string | null; year?: number | null; plate?: string | null } | null | undefined,
): string {
  if (!v) return "Sin vehículo";
  const name = [v.brand, v.model, v.year].filter(Boolean).join(" ");
  return v.plate ? `${name} · ${v.plate}` : name;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}
