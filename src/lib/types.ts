export type Role = "admin" | "staff" | "pending";

export type AppointmentStatus =
  | "pendiente"
  | "proximo"
  | "vencido"
  | "completado"
  | "renovado";

export interface AppUser {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
  created_at: string;
}

export interface Vehicle {
  id: string;
  client_id: string;
  brand: string;
  model: string | null;
  year: number | null;
  plate: string | null;
  color: string | null;
  notes: string | null;
  created_at: string;
}

export interface Client {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  created_at: string;
  vehicles?: Vehicle[];
}

export interface Appointment {
  id: string;
  client_id: string;
  vehicle_id: string | null;
  service_date: string;
  period_months: number;
  next_due_date: string;
  oil_type: string | null;
  mileage: number | null;
  next_mileage: number | null;
  notes: string | null;
  status: AppointmentStatus;
  google_event_id: string | null;
  renewed_from: string | null;
  created_at: string;
  updated_at: string;
  client?: Pick<Client, "id" | "name" | "phone" | "email"> | null;
  vehicle?: Pick<Vehicle, "id" | "brand" | "model" | "year" | "plate"> | null;
}

export interface Settings {
  workshop_name: string;
  workshop_phone: string | null;
  workshop_address: string | null;
  label_design: import("./label-design").LabelDesign | null;
  whatsapp_template: string;
  reminder_days: number;
  google_client_id: string | null;
  google_redirect_uri: string | null;
  google_calendar_id: string;
  google_connected_email: string | null;
  google_connected_at: string | null;
  /** Nunca se devuelve el secreto, solo si existe. */
  google_client_secret_set: boolean;
  google_connected: boolean;
}

export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  date: string; // yyyy-MM-dd
  htmlLink?: string;
  registered: boolean;
}
