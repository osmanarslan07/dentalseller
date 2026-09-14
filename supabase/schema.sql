-- DentalSeller — schema + RLS
-- Run this in the Supabase SQL editor for your project.

create extension if not exists "pgcrypto";

-- ---------- patients ----------
create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),

  name text not null,
  treatment text,
  letter_treatment_items text,
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
alter table public.patients add column if not exists letter_treatment_items text;
alter table public.patients add column if not exists needs_visit2 boolean not null default true;

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

-- ---------- patient_visits (extra visits between visit 1 and visit 2, e.g. temp crown fix) ----------
create table if not exists public.patient_visits (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),

  label text not null,
  visit_date date,
  expected numeric(10,2),
  actual numeric(10,2),
  status text not null default 'upcoming' check (status in ('upcoming', 'completed')),
  treatment text,
  notes text,

  arrival_date date,
  arrival_time text,
  arrival_flight_no text,
  departure_date date,
  departure_time text,
  departure_flight_no text,
  hotel_name text,
  room_type text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- migration for existing databases (safe to re-run)
alter table public.patient_visits add column if not exists treatment text;
alter table public.patient_visits add column if not exists arrival_date date;
alter table public.patient_visits add column if not exists arrival_time text;
alter table public.patient_visits add column if not exists arrival_flight_no text;
alter table public.patient_visits add column if not exists departure_date date;
alter table public.patient_visits add column if not exists departure_time text;
alter table public.patient_visits add column if not exists departure_flight_no text;
alter table public.patient_visits add column if not exists hotel_name text;
alter table public.patient_visits add column if not exists room_type text;

create index if not exists patient_visits_patient_id_idx on public.patient_visits(patient_id);
create index if not exists patient_visits_visit_date_idx on public.patient_visits(visit_date);

alter table public.patient_visits enable row level security;

drop policy if exists "patient_visits_select_own" on public.patient_visits;
create policy "patient_visits_select_own" on public.patient_visits
  for select using (auth.uid() = user_id);
drop policy if exists "patient_visits_insert_own" on public.patient_visits;
create policy "patient_visits_insert_own" on public.patient_visits
  for insert with check (auth.uid() = user_id);
drop policy if exists "patient_visits_update_own" on public.patient_visits;
create policy "patient_visits_update_own" on public.patient_visits
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "patient_visits_delete_own" on public.patient_visits;
create policy "patient_visits_delete_own" on public.patient_visits
  for delete using (auth.uid() = user_id);

drop trigger if exists patient_visits_set_updated_at on public.patient_visits;
create trigger patient_visits_set_updated_at
  before update on public.patient_visits
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
alter table public.settings add column if not exists show_try boolean not null default false;
alter table public.settings add column if not exists dashboard_cards text[] not null default array[
  'total_earned', 'month_earnings', 'expected_earnings', 'patients_sold', 'confirmed_this_month',
  'new_patients_delta', 'upcoming_visits_value', 'avg_commission_patient', 'avg_treatment_value',
  'highest_value_patient'
]::text[];

-- new card added later: bump the column default so freshly-created settings rows include it
-- (existing rows keep whatever they already have saved — toggle it on from Settings)
alter table public.settings alter column dashboard_cards set default array[
  'total_earned', 'total_commission', 'month_earnings', 'expected_earnings', 'patients_sold',
  'confirmed_this_month', 'new_patients_delta', 'upcoming_visits_value', 'avg_commission_patient',
  'avg_treatment_value', 'highest_value_patient'
]::text[];

-- confirmation-letter clinic branding (name/contact/logo), editable from Settings
alter table public.settings add column if not exists clinic_name text not null default 'Thera Dental Clinic Turkey';
alter table public.settings add column if not exists clinic_short_name text not null default 'Thera Dental Clinic';
alter table public.settings add column if not exists clinic_address text not null default 'Kasya Plaza, Göksu, 6806 Sok No:8-3, 07260 Kepez/Antalya';
alter table public.settings add column if not exists clinic_phone text not null default '+90 (544) 954 04 49';
alter table public.settings add column if not exists clinic_email text not null default 'info@theradentturkey.com';
alter table public.settings add column if not exists clinic_logo_url text;

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

-- ---------- exchange_rates (shared history, not per-user) ----------
create table if not exists public.exchange_rates (
  id uuid primary key default gen_random_uuid(),
  base text not null,
  quote text not null default 'TRY',
  rate numeric(12,4) not null,
  rate_date date not null,
  created_at timestamptz not null default now(),
  unique (base, quote, rate_date)
);

create index if not exists exchange_rates_date_idx on public.exchange_rates(rate_date);

alter table public.exchange_rates enable row level security;

-- readable by any signed-in user; only the service role (cron job) inserts
create policy "exchange_rates_select_all" on public.exchange_rates
  for select using (true);

-- ---------- quotes (draft/unconfirmed offers, decoupled from patients) ----------
create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),

  name text not null,
  status text not null default 'draft' check (status in ('draft', 'sent', 'accepted', 'declined')),

  intro_text text,
  inclusions text,

  total_price numeric(10,2),
  currency text not null default 'GBP',
  split_mode text not null default 'percent' check (split_mode in ('percent', 'amount')),
  deposit_percent numeric(5,2) not null default 60,
  first_visit_amount numeric(10,2),

  include_bone_graft_note boolean not null default false,
  bone_graft_note text,

  notes text,
  komo_reference text,

  converted_patient_id uuid references public.patients(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- migration for existing databases (safe to re-run)
alter table public.quotes add column if not exists split_mode text not null default 'percent' check (split_mode in ('percent', 'amount'));
alter table public.quotes add column if not exists first_visit_amount numeric(10,2);
alter table public.quotes add column if not exists label text;

create index if not exists quotes_user_id_idx on public.quotes(user_id);
create index if not exists quotes_status_idx on public.quotes(status);

alter table public.quotes enable row level security;

create policy "quotes_select_own" on public.quotes
  for select using (auth.uid() = user_id);
create policy "quotes_insert_own" on public.quotes
  for insert with check (auth.uid() = user_id);
create policy "quotes_update_own" on public.quotes
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "quotes_delete_own" on public.quotes
  for delete using (auth.uid() = user_id);

drop trigger if exists quotes_set_updated_at on public.quotes;
create trigger quotes_set_updated_at
  before update on public.quotes
  for each row execute function public.set_updated_at();

-- ---------- tasks (reminders, optionally linked to a patient) ----------
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),

  title text not null,
  notes text,

  due_date date not null,
  due_time text,

  patient_id uuid references public.patients(id) on delete set null,
  patient_name text,

  status text not null default 'pending' check (status in ('pending', 'done')),
  notified_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tasks_user_id_idx on public.tasks(user_id);
create index if not exists tasks_due_date_idx on public.tasks(due_date);
create index if not exists tasks_status_idx on public.tasks(status);

alter table public.tasks enable row level security;

drop policy if exists "tasks_select_own" on public.tasks;
create policy "tasks_select_own" on public.tasks
  for select using (auth.uid() = user_id);
drop policy if exists "tasks_insert_own" on public.tasks;
create policy "tasks_insert_own" on public.tasks
  for insert with check (auth.uid() = user_id);
drop policy if exists "tasks_update_own" on public.tasks;
create policy "tasks_update_own" on public.tasks
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "tasks_delete_own" on public.tasks;
create policy "tasks_delete_own" on public.tasks
  for delete using (auth.uid() = user_id);

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- ---------- profiles (one row per auth user — the seller directory) ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'seller' check (role in ('seller', 'admin')),
  telegram_chat_id text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- security-definer helpers so RLS policies/triggers can check role/active status
-- without re-entering RLS on profiles themselves (avoids self-referential recursion).
create or replace function public.is_active_profile(uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select is_active from public.profiles where id = uid), false);
$$;

create or replace function public.is_admin(uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select role = 'admin' from public.profiles where id = uid), false);
$$;

-- auto-create a bare profile row whenever a new auth user is created
-- (covers accounts made via admin.createUser, the Supabase dashboard, etc).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- only admin may change role/is_active — anyone can still update their own
-- display_name/telegram_chat_id via the normal update policy below.
create or replace function public.guard_profile_privilege_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.role is distinct from old.role or new.is_active is distinct from old.is_active)
     and not public.is_admin(auth.uid()) then
    raise exception 'Only an admin can change role or active status';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_privilege on public.profiles;
create trigger profiles_guard_privilege
  before update on public.profiles
  for each row execute function public.guard_profile_privilege_change();

alter table public.profiles enable row level security;

-- any active seller can see the whole directory (needed for "Responsible: X" badges,
-- assignment dropdowns, admin team view).
drop policy if exists "profiles_select_active_sellers" on public.profiles;
create policy "profiles_select_active_sellers" on public.profiles
  for select using (public.is_active_profile(auth.uid()));

-- everyone can update their own row (display_name, telegram_chat_id); admin can update anyone's.
-- the trigger above still blocks a non-admin from smuggling a role/is_active change through this.
drop policy if exists "profiles_update_self_or_admin" on public.profiles;
create policy "profiles_update_self_or_admin" on public.profiles
  for update using (auth.uid() = id or public.is_admin(auth.uid()))
  with check (auth.uid() = id or public.is_admin(auth.uid()));

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------- shared patients: rename ownership column + open visibility to all active sellers ----------
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'patients' and column_name = 'user_id'
  ) then
    alter table public.patients rename column user_id to responsible_seller_id;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'patient_visits' and column_name = 'user_id'
  ) then
    alter table public.patient_visits rename column user_id to created_by_seller_id;
  end if;
end $$;

alter index if exists patients_user_id_idx rename to patients_responsible_seller_id_idx;

drop policy if exists "patients_select_own" on public.patients;
drop policy if exists "patients_insert_own" on public.patients;
drop policy if exists "patients_update_own" on public.patients;
drop policy if exists "patients_delete_own" on public.patients;

drop policy if exists "patients_select_active_sellers" on public.patients;
create policy "patients_select_active_sellers" on public.patients
  for select using (public.is_active_profile(auth.uid()));

drop policy if exists "patients_insert_self" on public.patients;
create policy "patients_insert_self" on public.patients
  for insert with check (responsible_seller_id = auth.uid() and public.is_active_profile(auth.uid()));

-- any active seller can edit (arrange logistics for a colleague's patient); reassigning
-- responsible_seller_id itself is separately guarded by the trigger below.
drop policy if exists "patients_update_active_sellers" on public.patients;
create policy "patients_update_active_sellers" on public.patients
  for update using (public.is_active_profile(auth.uid()))
  with check (public.is_active_profile(auth.uid()));

drop policy if exists "patients_delete_owner_or_admin" on public.patients;
create policy "patients_delete_owner_or_admin" on public.patients
  for delete using (responsible_seller_id = auth.uid() or public.is_admin(auth.uid()));

create or replace function public.guard_patient_reassignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.responsible_seller_id is distinct from old.responsible_seller_id
     and not (auth.uid() = old.responsible_seller_id or public.is_admin(auth.uid())) then
    raise exception 'Only the responsible seller or an admin can reassign this patient';
  end if;
  return new;
end;
$$;

drop trigger if exists patients_guard_reassignment on public.patients;
create trigger patients_guard_reassignment
  before update on public.patients
  for each row execute function public.guard_patient_reassignment();

drop policy if exists "patient_visits_select_own" on public.patient_visits;
drop policy if exists "patient_visits_insert_own" on public.patient_visits;
drop policy if exists "patient_visits_update_own" on public.patient_visits;
drop policy if exists "patient_visits_delete_own" on public.patient_visits;

drop policy if exists "patient_visits_select_active_sellers" on public.patient_visits;
create policy "patient_visits_select_active_sellers" on public.patient_visits
  for select using (public.is_active_profile(auth.uid()));

drop policy if exists "patient_visits_insert_active_sellers" on public.patient_visits;
create policy "patient_visits_insert_active_sellers" on public.patient_visits
  for insert with check (created_by_seller_id = auth.uid() and public.is_active_profile(auth.uid()));

drop policy if exists "patient_visits_update_active_sellers" on public.patient_visits;
create policy "patient_visits_update_active_sellers" on public.patient_visits
  for update using (public.is_active_profile(auth.uid()))
  with check (public.is_active_profile(auth.uid()));

drop policy if exists "patient_visits_delete_active_sellers" on public.patient_visits;
create policy "patient_visits_delete_active_sellers" on public.patient_visits
  for delete using (public.is_active_profile(auth.uid()));

-- admin can also read every seller's commission settings (for a future cross-seller
-- breakdown view); each seller's own row otherwise stays private via settings_select_own.
drop policy if exists "settings_select_admin" on public.settings;
create policy "settings_select_admin" on public.settings
  for select using (public.is_admin(auth.uid()));

-- ---------- telegram_link_codes (short-lived, one-time codes to link a seller's own chat) ----------
create table if not exists public.telegram_link_codes (
  code text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

create index if not exists telegram_link_codes_user_id_idx on public.telegram_link_codes(user_id);

alter table public.telegram_link_codes enable row level security;

-- a seller can create their own code; nothing else is exposed to normal clients — the
-- webhook that verifies/consumes a code runs with the service-role key, which bypasses RLS.
drop policy if exists "telegram_link_codes_insert_own" on public.telegram_link_codes;
create policy "telegram_link_codes_insert_own" on public.telegram_link_codes
  for insert with check (user_id = auth.uid());

-- ---------- storage: clinic-assets (confirmation-letter logo) ----------
-- public read, uploads go through the server action using the service-role client
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('clinic-assets', 'clinic-assets', true, 2097152, array['image/png','image/jpeg','image/svg+xml','image/webp'])
on conflict (id) do nothing;
