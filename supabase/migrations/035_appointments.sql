-- 035_appointments.sql
-- Simple appointment booking: services → slots → appointments.

create table if not exists booking_services (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  name text not null,
  duration_minutes int not null default 30,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table booking_services enable row level security;
drop policy if exists "members read booking_services" on booking_services;
create policy "members read booking_services" on booking_services for select
  using (is_account_member(account_id, 'viewer'));
drop policy if exists "admins manage booking_services" on booking_services;
create policy "admins manage booking_services" on booking_services for all
  using (is_account_member(account_id, 'admin'));

-- ----

create table if not exists booking_slots (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  service_id uuid not null references booking_services(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  max_bookings int not null default 1,
  booked_count int not null default 0
);

create index if not exists idx_booking_slots_account_start on booking_slots(account_id, start_at);

alter table booking_slots enable row level security;
drop policy if exists "members manage booking_slots" on booking_slots;
create policy "members manage booking_slots" on booking_slots for all
  using (is_account_member(account_id, 'agent'));

-- ----

create table if not exists appointments (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  slot_id uuid references booking_slots(id) on delete set null,
  contact_id uuid references contacts(id) on delete set null,
  service_id uuid references booking_services(id) on delete set null,
  agent_id uuid references auth.users(id) on delete set null,
  status text not null default 'confirmed',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_appointments_account on appointments(account_id);
create index if not exists idx_appointments_contact on appointments(contact_id);
create index if not exists idx_appointments_slot on appointments(slot_id);

alter table appointments enable row level security;
drop policy if exists "members manage appointments" on appointments;
create policy "members manage appointments" on appointments for all
  using (is_account_member(account_id, 'agent'));
