-- Dental Commission Tracker — schema + RLS
-- Run this in the Supabase SQL editor for your project.

create extension if not exists "pgcrypto";

-- ---------- patients ----------
create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),

  name text not null,
  treatment text,
  confirmation_date date,

  visit1_date date,
  visit1_expected numeric(10,2),
  visit1_actual numeric(10,2),
  visit1_status text not null default 'upcoming' check (visit1_status in ('upcoming', 'completed')),

  visit2_date date,
  visit2_expected numeric(10,2),
  visit2_actual numeric(10,2),
  visit2_status text not null default 'upcoming' check (visit2_status in ('upcoming', 'completed')),

  notes text,
  komo_reference text,

  visit1_arrival_date date,
  visit1_arrival_time text,
  visit1_arrival_flight_no text,
  visit1_departure_date date,
  visit1_departure_time text,
  visit1_departure_flight_no text,
  visit1_hotel_name text,
  visit1_room_type text,

  visit2_arrival_date date,
  visit2_arrival_time text,
  visit2_arrival_flight_no text,
  visit2_departure_date date,
  visit2_departure_time text,
  visit2_departure_flight_no text,
  visit2_hotel_name text,
  visit2_room_type text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- migration for existing databases (safe to re-run)
alter table public.patients drop column if exists arrival_date;
alter table public.patients drop column if exists arrival_time;
alter table public.patients drop column if exists arrival_flight_no;
alter table public.patients drop column if exists departure_date;
alter table public.patients drop column if exists departure_time;
alter table public.patients drop column if exists departure_flight_no;
alter table public.patients drop column if exists hotel_name;
alter table public.patients drop column if exists room_type;

alter table public.patients add column if not exists komo_reference text;

alter table public.patients add column if not exists visit1_arrival_date date;
alter table public.patients add column if not exists visit1_arrival_time text;
alter table public.patients add column if not exists visit1_arrival_flight_no text;
alter table public.patients add column if not exists visit1_departure_date date;
alter table public.patients add column if not exists visit1_departure_time text;
alter table public.patients add column if not exists visit1_departure_flight_no text;
alter table public.patients add column if not exists visit1_hotel_name text;
alter table public.patients add column if not exists visit1_room_type text;

alter table public.patients add column if not exists visit2_arrival_date date;
alter table public.patients add column if not exists visit2_arrival_time text;
alter table public.patients add column if not exists visit2_arrival_flight_no text;
alter table public.patients add column if not exists visit2_departure_date date;
alter table public.patients add column if not exists visit2_departure_time text;
alter table public.patients add column if not exists visit2_departure_flight_no text;
alter table public.patients add column if not exists visit2_hotel_name text;
alter table public.patients add column if not exists visit2_room_type text;

create index if not exists patients_user_id_idx on public.patients(user_id);
create index if not exists patients_visit1_date_idx on public.patients(visit1_date);
create index if not exists patients_visit2_date_idx on public.patients(visit2_date);

alter table public.patients enable row level security;

create policy "patients_select_own" on public.patients
  for select using (auth.uid() = user_id);
create policy "patients_insert_own" on public.patients
  for insert with check (auth.uid() = user_id);
create policy "patients_update_own" on public.patients
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "patients_delete_own" on public.patients
  for delete using (auth.uid() = user_id);

-- keep updated_at fresh
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists patients_set_updated_at on public.patients;
create trigger patients_set_updated_at
  before update on public.patients
  for each row execute function public.set_updated_at();

-- ---------- settings (one row per user) ----------
create table if not exists public.settings (
  user_id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  low_tier_threshold numeric(12,2) not null default 70000,
  low_tier_rate numeric(5,4) not null default 0.03,
  high_tier_rate numeric(5,4) not null default 0.04,
  currency text not null default 'GBP',
  updated_at timestamptz not null default now()
);

-- 3-tier commission + fixed monthly payment (replaces the 2-tier columns above; old columns left in place, unused)
alter table public.settings add column if not exists tier1_threshold numeric(12,2) not null default 40000;
alter table public.settings add column if not exists tier1_rate numeric(5,4) not null default 0.02;
alter table public.settings add column if not exists tier2_threshold numeric(12,2) not null default 70000;
alter table public.settings add column if not exists tier2_rate numeric(5,4) not null default 0.03;
alter table public.settings add column if not exists tier3_rate numeric(5,4) not null default 0.04;
alter table public.settings add column if not exists fixed_monthly_payment numeric(12,2) not null default 0;
alter table public.settings add column if not exists hide_earnings boolean not null default false;

alter table public.settings enable row level security;

create policy "settings_select_own" on public.settings
  for select using (auth.uid() = user_id);
create policy "settings_insert_own" on public.settings
  for insert with check (auth.uid() = user_id);
create policy "settings_update_own" on public.settings
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists settings_set_updated_at on public.settings;
create trigger settings_set_updated_at
  before update on public.settings
  for each row execute function public.set_updated_at();
