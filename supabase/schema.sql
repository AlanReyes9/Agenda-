-- =====================================================================
-- Auto Soluciones Daniel — esquema de base de datos (Supabase / Postgres)
-- Se puede ejecutar varias veces (idempotente).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Usuarios del taller (perfil ligado a auth.users)
-- role: admin | staff | pending (pending = espera aprobación)
-- ---------------------------------------------------------------------
create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'pending' check (role in ('admin', 'staff', 'pending')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists users_updated_at on public.users;
create trigger users_updated_at before update on public.users
  for each row execute function public.set_updated_at();

-- Crea el perfil automáticamente. El primer usuario es admin.
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  has_admin boolean;
begin
  select exists (select 1 from public.users where role = 'admin') into has_admin;
  insert into public.users (id, email, full_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    case when has_admin then 'pending' else 'admin' end
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Helpers de rol (security definer => evitan la recursión de RLS en users)
create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.users u
    where u.id = (select auth.uid()) and u.role in ('admin', 'staff')
  );
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.users u
    where u.id = (select auth.uid()) and u.role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------
-- Clientes y vehículos
-- ---------------------------------------------------------------------
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  notes text,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists clients_updated_at on public.clients;
create trigger clients_updated_at before update on public.clients
  for each row execute function public.set_updated_at();

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  brand text not null,
  model text,
  year int,
  plate text,
  color text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vehicles_client_id_idx on public.vehicles (client_id);

drop trigger if exists vehicles_updated_at on public.vehicles;
create trigger vehicles_updated_at before update on public.vehicles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Agendas de cambio de aceite
-- status: pendiente | proximo | vencido | completado | renovado
-- period_months = 0 es válido (evento externo: la fecha es el próximo cambio)
-- ---------------------------------------------------------------------
create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  vehicle_id uuid references public.vehicles (id) on delete set null,
  service_date date not null,
  period_months int not null default 3 check (period_months >= 0 and period_months <= 60),
  next_due_date date,
  oil_type text,
  mileage int,
  next_mileage int,
  notes text,
  status text not null default 'pendiente'
    check (status in ('pendiente', 'proximo', 'vencido', 'completado', 'renovado')),
  google_event_id text,
  renewed_from uuid references public.appointments (id) on delete set null,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists appointments_client_id_idx on public.appointments (client_id);
create index if not exists appointments_vehicle_id_idx on public.appointments (vehicle_id);
create index if not exists appointments_next_due_idx on public.appointments (next_due_date);
create index if not exists appointments_status_idx on public.appointments (status);
create index if not exists appointments_renewed_from_idx on public.appointments (renewed_from);
create index if not exists appointments_created_by_idx on public.appointments (created_by);
create index if not exists clients_created_by_idx on public.clients (created_by);

drop trigger if exists appointments_updated_at on public.appointments;
create trigger appointments_updated_at before update on public.appointments
  for each row execute function public.set_updated_at();

-- Calcula next_due_date y status
create or replace function public.compute_appointment_fields()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT'
     or new.service_date is distinct from old.service_date
     or new.period_months is distinct from old.period_months
     or new.next_due_date is null then
    new.next_due_date := (new.service_date + make_interval(months => new.period_months))::date;
  end if;

  if new.status not in ('completado', 'renovado') then
    if new.next_due_date < current_date then
      new.status := 'vencido';
    elsif new.next_due_date <= current_date + 7 then
      new.status := 'proximo';
    else
      new.status := 'pendiente';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists appointments_compute_fields on public.appointments;
create trigger appointments_compute_fields before insert or update on public.appointments
  for each row execute function public.compute_appointment_fields();

-- ---------------------------------------------------------------------
-- Configuración (fila única id = 1). Sin secretos: los secretos van en app_secrets.
-- ---------------------------------------------------------------------
create table if not exists public.settings (
  id int primary key default 1 check (id = 1),
  workshop_name text not null default 'Auto Soluciones Daniel',
  workshop_phone text,
  whatsapp_template text not null default
    'Hola {cliente} 👋, le saluda {taller}. Le recordamos que su {vehiculo} ({placa}) tiene su próximo cambio de aceite para el {fecha}. ¡Le esperamos! 🚗🔧',
  reminder_days int not null default 7 check (reminder_days between 0 and 60),
  google_client_id text,
  google_redirect_uri text,
  google_calendar_id text not null default 'primary',
  google_connected_email text,
  google_connected_at timestamptz,
  updated_at timestamptz not null default now()
);

insert into public.settings (id) values (1) on conflict (id) do nothing;

drop trigger if exists settings_updated_at on public.settings;
create trigger settings_updated_at before update on public.settings
  for each row execute function public.set_updated_at();

-- Secretos: solo accesibles con la service role key (RLS sin políticas)
create table if not exists public.app_secrets (
  id int primary key default 1 check (id = 1),
  google_client_secret text,
  google_refresh_token text,
  updated_at timestamptz not null default now()
);

insert into public.app_secrets (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.users enable row level security;
alter table public.clients enable row level security;
alter table public.vehicles enable row level security;
alter table public.appointments enable row level security;
alter table public.settings enable row level security;
alter table public.app_secrets enable row level security;

-- users
drop policy if exists staff_read_users on public.users;
create policy staff_read_users on public.users for select to authenticated
  using (id = (select auth.uid()) or (select public.is_staff()));

drop policy if exists staff_update_own_user on public.users;
drop policy if exists admin_update_users on public.users;
create policy admin_update_users on public.users for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists admin_delete_users on public.users;
create policy admin_delete_users on public.users for delete to authenticated
  using ((select public.is_admin()) and id <> (select auth.uid()));

-- clients / vehicles / appointments: todo el personal aprobado
drop policy if exists staff_all_clients on public.clients;
create policy staff_all_clients on public.clients for all to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));

drop policy if exists staff_all_vehicles on public.vehicles;
create policy staff_all_vehicles on public.vehicles for all to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));

drop policy if exists staff_all_appointments on public.appointments;
create policy staff_all_appointments on public.appointments for all to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));

-- settings: lectura personal, escritura admin
drop policy if exists staff_read_settings on public.settings;
create policy staff_read_settings on public.settings for select to authenticated
  using ((select public.is_staff()));

drop policy if exists admin_update_settings on public.settings;
create policy admin_update_settings on public.settings for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Revocar acceso a anon (no se usa)
revoke all on public.app_secrets from anon, authenticated;
revoke execute on function public.handle_new_auth_user() from anon, authenticated, public;
