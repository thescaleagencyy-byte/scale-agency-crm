-- 061_invoices.sql
-- Finance OS v1: simple amount + due date + paid/unpaid tracking per
-- contact — i.e. money an account's OWN customers owe them. Named
-- client_invoices (not invoices) because migration 056 already
-- created an `invoices` table for a different concept: the
-- platform's own SaaS billing history (accounts paying Scale Agency
-- for the CRM itself). Reusing the name would have silently no-opped
-- against that existing table via CREATE TABLE IF NOT EXISTS.
--
-- Deliberately not line-itemized — that's added complexity the
-- "who hasn't paid this month" / "show today's revenue" use cases
-- don't need yet. Same account-scoped RLS pattern as leads/appointments.

create table if not exists client_invoices (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  contact_id uuid references contacts(id) on delete set null,
  title text not null,
  amount numeric(12,2) not null default 0,
  currency text not null default 'PKR',
  due_date date,
  status text not null default 'unpaid' check (status in ('unpaid', 'paid', 'overdue', 'cancelled')),
  paid_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_client_invoices_account on client_invoices(account_id);
create index if not exists idx_client_invoices_contact on client_invoices(contact_id);
create index if not exists idx_client_invoices_status on client_invoices(account_id, status);

alter table client_invoices enable row level security;
drop policy if exists "members manage client_invoices" on client_invoices;
create policy "members manage client_invoices" on client_invoices for all
  using (is_account_member(account_id, 'agent'));

grant select, insert, update, delete on client_invoices to authenticated;

notify pgrst, 'reload schema';
